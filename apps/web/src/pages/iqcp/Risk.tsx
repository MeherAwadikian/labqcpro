import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Card, Button, Input, Select, Textarea, FormField, Modal, Badge, PageHeader, Spinner, Table, Th, Td, EmptyState } from '../../components/ui'
import { Plus, Edit2, Trash2, ShieldCheck } from 'lucide-react'

interface RiskItem {
  id: string; analyte_id: string | null; analyte_name: string | null
  risk_category: string; risk_description: string
  likelihood: number; severity: number; risk_score: number; mitigation: string
}
interface Analyte { id: string; name: string }

const CATEGORIES = [
  'Specimen', 'Reagent/Consumable', 'Calibration', 'Operator',
  'Environment', 'Instrument', 'Software/LIS', 'Test System',
]

function riskBadge(score: number) {
  if (score <= 4)  return { label: 'Low',      variant: 'success' as const }
  if (score <= 9)  return { label: 'Medium',   variant: 'warning' as const }
  if (score <= 16) return { label: 'High',     variant: 'danger' as const }
  return              { label: 'Critical',  variant: 'danger' as const }
}

const empty = { analyte_id: '', risk_category: CATEGORIES[0], risk_description: '', likelihood: 3, severity: 3, mitigation: '' }

export default function IQCPRisk() {
  const [risks, setRisks] = useState<RiskItem[]>([])
  const [analytes, setAnalytes] = useState<Analyte[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RiskItem | null>(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  async function load() {
    const [r, a] = await Promise.all([
      api.get<{ data: RiskItem[] }>('/iqcp/risk'),
      api.get<{ data: Analyte[] }>('/analytes'),
    ])
    setRisks(r.data)
    setAnalytes(a.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openNew() { setEditing(null); setForm(empty); setModalOpen(true) }
  function openEdit(r: RiskItem) {
    setEditing(r)
    setForm({ analyte_id: r.analyte_id ?? '', risk_category: r.risk_category,
      risk_description: r.risk_description, likelihood: r.likelihood,
      severity: r.severity, mitigation: r.mitigation })
    setModalOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      const body = { ...form, analyte_id: form.analyte_id || undefined,
        likelihood: Number(form.likelihood), severity: Number(form.severity) }
      if (editing) await api.put(`/iqcp/risk/${editing.id}`, body)
      else         await api.post('/iqcp/risk', body)
      await load(); setModalOpen(false)
    } finally { setSaving(false) }
  }

  async function del(id: string) {
    if (!confirm('Delete this risk item?')) return
    await api.delete(`/iqcp/risk/${id}`)
    setRisks(r => r.filter(x => x.id !== id))
  }

  return (
    <div>
      <PageHeader
        title="Risk Assessment"
        subtitle="Identify and score potential sources of error (IQCP Component 1)"
        action={<Button variant="iqcp" onClick={openNew}><Plus size={16} />Add Risk</Button>}
      />

      {/* Risk matrix heatmap */}
      {risks.length > 0 && (
        <Card className="mb-6">
          <h3 className="text-sm font-semibold text-white mb-4">Risk Matrix</h3>
          <div className="grid grid-cols-6 gap-1 text-xs">
            <div />
            {[1,2,3,4,5].map(s => (
              <div key={s} className="text-center text-gray-500 py-1">Sev {s}</div>
            ))}
            {[5,4,3,2,1].map(lik => (
              <>
                <div key={`l${lik}`} className="text-gray-500 flex items-center">Lik {lik}</div>
                {[1,2,3,4,5].map(sev => {
                  const score = lik * sev
                  const count = risks.filter(r => r.likelihood === lik && r.severity === sev).length
                  const color = score <= 4 ? 'bg-green-900/50 border-green-800'
                    : score <= 9  ? 'bg-amber-900/50 border-amber-800'
                    : score <= 16 ? 'bg-orange-900/50 border-orange-800'
                    : 'bg-red-900/50 border-red-800'
                  return (
                    <div key={sev} className={`${color} border rounded p-2 text-center text-xs`}>
                      <div className="text-gray-400 text-[10px]">{score}</div>
                      {count > 0 && <div className="font-bold text-white">{count}</div>}
                    </div>
                  )
                })}
              </>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-xs">
            {[['Low (1-4)', 'text-green-400'], ['Medium (5-9)', 'text-amber-400'],
              ['High (10-16)', 'text-orange-400'], ['Critical (17-25)', 'text-red-400']].map(([l, c]) => (
              <span key={l} className={`flex items-center gap-1 ${c}`}>
                <span className="w-2 h-2 rounded-sm bg-current inline-block opacity-50" />{l}
              </span>
            ))}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : risks.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={40} />} title="No risk items yet" desc="Add potential error sources for your test systems to build your IQCP risk assessment" />
      ) : (
        <Card className="p-0">
          <Table>
            <thead><tr>
              {['Risk Category', 'Description', 'Analyte', 'L×S', 'Score', 'Mitigation', ''].map(h => <Th key={h}>{h}</Th>)}
            </tr></thead>
            <tbody>
              {risks.map(r => {
                const b = riskBadge(r.risk_score)
                return (
                  <tr key={r.id} className="hover:bg-gray-800/30 transition-colors">
                    <Td><Badge variant="iqcp">{r.risk_category}</Badge></Td>
                    <Td className="max-w-xs"><p className="text-sm text-gray-300 line-clamp-2">{r.risk_description}</p></Td>
                    <Td className="text-gray-400">{r.analyte_name ?? 'All'}</Td>
                    <Td className="text-gray-400">{r.likelihood}×{r.severity}</Td>
                    <Td><Badge variant={b.variant}>{r.risk_score} {b.label}</Badge></Td>
                    <Td className="max-w-xs"><p className="text-xs text-gray-500 line-clamp-2">{r.mitigation || '—'}</p></Td>
                    <Td>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Edit2 size={14} /></Button>
                        <Button variant="ghost" size="sm" onClick={() => del(r.id)} className="hover:text-red-400"><Trash2 size={14} /></Button>
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Risk' : 'Add Risk Item'} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Risk Category *">
              <Select value={form.risk_category} onChange={e => setForm(f => ({...f, risk_category: e.target.value}))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormField>
            <FormField label="Analyte (optional)">
              <Select value={form.analyte_id} onChange={e => setForm(f => ({...f, analyte_id: e.target.value}))}>
                <option value="">All analytes</option>
                {analytes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="Risk Description *">
            <Textarea rows={2} value={form.risk_description}
              onChange={e => setForm(f => ({...f, risk_description: e.target.value}))}
              placeholder="Describe the potential source of error…" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={`Likelihood: ${form.likelihood}/5`}>
              <input type="range" min={1} max={5} step={1} value={form.likelihood}
                onChange={e => setForm(f => ({...f, likelihood: parseInt(e.target.value)}))}
                className="w-full accent-iqcp-500" />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Very unlikely</span><span>Very likely</span>
              </div>
            </FormField>
            <FormField label={`Severity: ${form.severity}/5`}>
              <input type="range" min={1} max={5} step={1} value={form.severity}
                onChange={e => setForm(f => ({...f, severity: parseInt(e.target.value)}))}
                className="w-full accent-iqcp-500" />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Minor</span><span>Catastrophic</span>
              </div>
            </FormField>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 flex items-center gap-3">
            <span className="text-sm text-gray-400">Risk Score:</span>
            <span className="text-2xl font-bold text-iqcp-300">{Number(form.likelihood) * Number(form.severity)}</span>
            <Badge variant={riskBadge(Number(form.likelihood) * Number(form.severity)).variant}>
              {riskBadge(Number(form.likelihood) * Number(form.severity)).label}
            </Badge>
          </div>
          <FormField label="Mitigation / Control Measure">
            <Textarea rows={3} value={form.mitigation}
              onChange={e => setForm(f => ({...f, mitigation: e.target.value}))}
              placeholder="Describe how this risk is controlled or mitigated…" />
          </FormField>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="iqcp" onClick={save} disabled={saving || !form.risk_description}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
