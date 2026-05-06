import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Card, Button, Input, Select, Textarea, FormField, Modal, Badge, PageHeader, Spinner, Table, Th, Td, EmptyState } from '../../components/ui'
import { Plus, Check, ClipboardList } from 'lucide-react'

interface Plan {
  id: string; analyte_id: string; analyte_name: string; analyte_unit: string
  qc_frequency: string; qc_levels: number; acceptance_criteria: string[]
  tea_source: string; tea_value: number | null; status: string
  review_date: string; approved_by: string | null; is_overdue: boolean
}
interface Analyte { id: string; name: string }

const WESTGARD = ['1_2s','1_3s','2_2s','R_4s','4_1s','10x']
const FREQ_LABELS: Record<string, string> = {
  per_run: 'Per Run', daily: 'Daily', per_shift: 'Per 8h Shift', weekly: 'Weekly'
}

const emptyForm = {
  analyte_id: '', qc_frequency: 'daily', qc_levels: 2,
  acceptance_criteria: ['1_3s','2_2s','R_4s'] as string[],
  tea_source: 'CLIA', tea_value: '', corrective_action_plan: '',
  review_cycle: 12, review_date: '',
}

export default function IQCPPlans() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [analytes, setAnalytes] = useState<Analyte[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [approveId, setApproveId] = useState<string | null>(null)
  const [approvedBy, setApprovedBy] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  async function load() {
    const [p, a] = await Promise.all([
      api.get<{ data: Plan[] }>('/iqcp/plans'),
      api.get<{ data: Analyte[] }>('/analytes'),
    ])
    setPlans(p.data)
    setAnalytes(a.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function toggleRule(rule: string) {
    setForm(f => ({
      ...f,
      acceptance_criteria: f.acceptance_criteria.includes(rule)
        ? f.acceptance_criteria.filter(r => r !== rule)
        : [...f.acceptance_criteria, rule],
    }))
  }

  async function save() {
    setSaving(true)
    try {
      const body = { ...form, qc_levels: Number(form.qc_levels),
        tea_value: form.tea_value ? parseFloat(form.tea_value as any) : undefined,
        review_cycle: Number(form.review_cycle) }
      await api.post('/iqcp/plans', body)
      await load(); setModalOpen(false); setForm(emptyForm)
    } finally { setSaving(false) }
  }

  async function approve() {
    if (!approveId || !approvedBy) return
    await api.post(`/iqcp/plans/${approveId}/approve`, { approved_by: approvedBy })
    setApproveId(null); setApprovedBy(''); await load()
  }

  const statusVariant = (s: string) =>
    s === 'active' ? 'success' : s === 'draft' ? 'info' : 'warning'

  return (
    <div>
      <PageHeader
        title="QC Plans"
        subtitle="Define QC frequency, rules, and corrective actions per analyte (IQCP Component 2)"
        action={<Button variant="iqcp" onClick={() => setModalOpen(true)}><Plus size={16} />New Plan</Button>}
      />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : plans.length === 0 ? (
        <EmptyState icon={<ClipboardList size={40} />} title="No QC plans yet" desc="Create a QC plan for each analyte to document your IQCP approach" />
      ) : (
        <Card className="p-0">
          <Table>
            <thead><tr>
              {['Analyte', 'Frequency', 'Levels', 'Westgard Rules', 'TEa', 'Status', 'Review Date', ''].map(h => <Th key={h}>{h}</Th>)}
            </tr></thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} className="hover:bg-gray-800/30 transition-colors">
                  <Td><span className="font-medium text-white">{p.analyte_name}</span>
                    <span className="text-gray-500 text-xs ml-1">{p.analyte_unit}</span></Td>
                  <Td className="text-gray-300">{FREQ_LABELS[p.qc_frequency] || p.qc_frequency}</Td>
                  <Td className="text-gray-300">{p.qc_levels}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {p.acceptance_criteria.map(r => <Badge key={r} variant="iqcp" className="text-[10px]">{r}</Badge>)}
                    </div>
                  </Td>
                  <Td className="text-gray-400">{p.tea_value ? `${p.tea_value}% (${p.tea_source})` : p.tea_source}</Td>
                  <Td>
                    <Badge variant={statusVariant(p.status)} className="capitalize">{p.status}</Badge>
                    {p.is_overdue && <Badge variant="danger" className="ml-1 text-[10px]">OVERDUE</Badge>}
                  </Td>
                  <Td className="text-gray-400">{p.review_date}</Td>
                  <Td>
                    {p.status === 'draft' && (
                      <Button variant="iqcp" size="sm" onClick={() => setApproveId(p.id)}>
                        <Check size={12} /> Approve
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* New Plan Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create QC Plan" maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Analyte *">
              <Select value={form.analyte_id} onChange={e => setForm(f => ({...f, analyte_id: e.target.value}))}>
                <option value="">Select…</option>
                {analytes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </FormField>
            <FormField label="QC Frequency *">
              <Select value={form.qc_frequency} onChange={e => setForm(f => ({...f, qc_frequency: e.target.value}))}>
                {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </FormField>
            <FormField label="QC Levels Required">
              <Select value={form.qc_levels} onChange={e => setForm(f => ({...f, qc_levels: parseInt(e.target.value)}))}>
                <option value={1}>1 Level</option>
                <option value={2}>2 Levels</option>
                <option value={3}>3 Levels</option>
              </Select>
            </FormField>
            <FormField label="Review Cycle">
              <Select value={form.review_cycle} onChange={e => setForm(f => ({...f, review_cycle: parseInt(e.target.value)}))}>
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
              </Select>
            </FormField>
            <FormField label="TEa Source">
              <Select value={form.tea_source} onChange={e => setForm(f => ({...f, tea_source: e.target.value}))}>
                {['CLIA','CAP','manufacturer','lab'].map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </FormField>
            <FormField label="TEa Value (%)">
              <Input type="number" step="0.1" value={form.tea_value as any}
                onChange={e => setForm(f => ({...f, tea_value: e.target.value as any}))} placeholder="10.0" />
            </FormField>
          </div>

          <FormField label="Review Date *">
            <Input type="date" value={form.review_date}
              onChange={e => setForm(f => ({...f, review_date: e.target.value}))} />
          </FormField>

          <div>
            <p className="text-sm font-medium text-gray-300 mb-2">Westgard Rules to Apply</p>
            <div className="flex flex-wrap gap-2">
              {WESTGARD.map(r => (
                <button key={r} onClick={() => toggleRule(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    form.acceptance_criteria.includes(r)
                      ? 'bg-iqcp-600/30 border-iqcp-500 text-iqcp-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <FormField label="Corrective Action Plan">
            <Textarea rows={4} value={form.corrective_action_plan}
              onChange={e => setForm(f => ({...f, corrective_action_plan: e.target.value}))}
              placeholder="Steps to take when QC fails…" />
          </FormField>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="iqcp" onClick={save} disabled={saving || !form.analyte_id || !form.review_date}>
              {saving ? 'Saving…' : 'Create Plan'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Approve Modal */}
      <Modal open={!!approveId} onClose={() => setApproveId(null)} title="Approve QC Plan">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Enter the approver's name (Lab Director signature required for IQCP):</p>
          <FormField label="Approved By *">
            <Input value={approvedBy} onChange={e => setApprovedBy(e.target.value)} placeholder="Dr. Jane Smith" />
          </FormField>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setApproveId(null)}>Cancel</Button>
            <Button variant="iqcp" onClick={approve} disabled={!approvedBy}>Approve Plan</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
