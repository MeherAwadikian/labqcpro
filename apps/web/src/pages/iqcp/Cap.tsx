import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Card, Button, Select, Textarea, FormField, Modal, Badge, PageHeader, Spinner, Table, Th, Td } from '../../components/ui'
import { Building2, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts'

interface ChecklistItem {
  id: string; cap_question_id: string; compliance_status: string
  section: string; subsection: string; requirement_text: string
  clia_reference: string; evidence: string; deficiency_note: string; last_reviewed: string | null
}

interface Score {
  overall_score: number
  checklist: { total: number; compliant: number; non_compliant: number; pending: number; na: number; score: number }
  reagents: { total: number; verified: number; score: number }
  plans: { total: number; approved: number; score: number }
}

const STATUS_OPTS = ['compliant', 'non-compliant', 'na', 'pending']
const SECTIONS = ['GEN', 'COM', 'HEM', 'MIC', 'URN']

export default function IQCPCap() {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [score, setScore] = useState<Score | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState('')
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null)
  const [editForm, setEditForm] = useState({ compliance_status: 'pending', evidence: '', deficiency_note: '' })
  const [saving, setSaving] = useState(false)
  const [initializing, setInitializing] = useState(false)

  async function load() {
    const [i, s] = await Promise.all([
      api.get<{ data: ChecklistItem[] }>(`/iqcp/cap/checklist${section ? `?section=${section}` : ''}`),
      api.get<{ data: Score }>('/iqcp/cap/score'),
    ])
    setItems(i.data)
    setScore(s.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [section])

  async function initialize() {
    setInitializing(true)
    await api.post('/iqcp/cap/checklist/initialize', {})
    await load()
    setInitializing(false)
  }

  function openEdit(item: ChecklistItem) {
    setEditItem(item)
    setEditForm({ compliance_status: item.compliance_status, evidence: item.evidence, deficiency_note: item.deficiency_note })
  }

  async function saveEdit() {
    if (!editItem) return
    setSaving(true)
    try {
      await api.put(`/iqcp/cap/checklist/${editItem.id}`, { ...editForm, inspector_note: '' })
      await load(); setEditItem(null)
    } finally { setSaving(false) }
  }

  const statusIcon = (s: string) => {
    if (s === 'compliant')     return <CheckCircle size={14} className="text-green-400" />
    if (s === 'non-compliant') return <XCircle size={14} className="text-red-400" />
    if (s === 'na')            return <span className="text-gray-500 text-xs">N/A</span>
    return                            <Clock size={14} className="text-amber-400" />
  }

  const scoreColor = (v: number) =>
    v >= 80 ? '#22c55e' : v >= 60 ? '#f59e0b' : '#ef4444'

  return (
    <div>
      <PageHeader
        title="CAP Standards"
        subtitle="College of American Pathologists accreditation checklist and compliance tracking"
        action={
          items.length === 0 ? (
            <Button variant="iqcp" onClick={initialize} disabled={initializing}>
              <RefreshCw size={16} />
              {initializing ? 'Initializing…' : 'Initialize Checklist'}
            </Button>
          ) : undefined
        }
      />

      {/* Score gauges */}
      {score && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Overall Score',   value: score.overall_score,       color: scoreColor(score.overall_score) },
            { label: 'Checklist',       value: score.checklist.score,     color: scoreColor(score.checklist.score) },
            { label: 'Reagent Verify',  value: score.reagents.score,      color: scoreColor(score.reagents.score) },
            { label: 'Plans Approved',  value: score.plans.score,         color: scoreColor(score.plans.score) },
          ].map(g => (
            <Card key={g.label} className="flex flex-col items-center py-4">
              <div className="w-20 h-20 relative mb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" data={[{ value: g.value }]} startAngle={90} endAngle={-270}>
                    <RadialBar dataKey="value" fill={g.color} background={{ fill: '#1f2937' }} cornerRadius={4} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold" style={{ color: g.color }}>{g.value}%</span>
                </div>
              </div>
              <p className="text-xs text-gray-400">{g.label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Stats row */}
      {score && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Compliant',    v: score.checklist.compliant,     cls: 'text-green-400' },
            { label: 'Non-compliant', v: score.checklist.non_compliant, cls: 'text-red-400' },
            { label: 'Pending',      v: score.checklist.pending,       cls: 'text-amber-400' },
            { label: 'N/A',          v: score.checklist.na,            cls: 'text-gray-400' },
          ].map(s => (
            <Card key={s.label} className="text-center py-3">
              <div className={`text-2xl font-bold ${s.cls}`}>{s.v}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Section filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setSection('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!section ? 'bg-iqcp-600/30 border-iqcp-500 text-iqcp-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
          All
        </button>
        {SECTIONS.map(s => (
          <button key={s} onClick={() => setSection(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${section === s ? 'bg-iqcp-600/30 border-iqcp-500 text-iqcp-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : items.length === 0 ? (
        <Card className="text-center py-12 text-gray-500">
          <Building2 size={40} className="mx-auto mb-3 text-gray-700" />
          <p>No checklist items. Click "Initialize Checklist" to populate CAP requirements for your lab.</p>
        </Card>
      ) : (
        <Card className="p-0">
          <Table>
            <thead><tr>
              {['#', 'Section', 'Requirement', 'CLIA Ref', 'Status', 'Last Reviewed', ''].map(h => <Th key={h}>{h}</Th>)}
            </tr></thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-800/30 transition-colors cursor-pointer" onClick={() => openEdit(item)}>
                  <Td><code className="text-xs text-iqcp-300">{item.cap_question_id}</code></Td>
                  <Td><Badge variant="iqcp">{item.section}</Badge></Td>
                  <Td className="max-w-sm"><p className="text-sm text-gray-300 line-clamp-2">{item.requirement_text}</p></Td>
                  <Td className="text-gray-500 text-xs">{item.clia_reference}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {statusIcon(item.compliance_status)}
                      <span className="text-xs text-gray-400 capitalize">{item.compliance_status}</span>
                    </div>
                    {item.deficiency_note && (
                      <p className="text-xs text-red-400 mt-1 line-clamp-1">{item.deficiency_note}</p>
                    )}
                  </Td>
                  <Td className="text-gray-500 text-xs">
                    {item.last_reviewed ? new Date(item.last_reviewed).toLocaleDateString() : 'Never'}
                  </Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(item) }}>
                      Edit
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Edit Modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={`${editItem?.cap_question_id} — Update Status`} maxWidth="max-w-lg">
        {editItem && (
          <div className="space-y-4">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <p className="text-xs text-iqcp-300 mb-1">{editItem.section} — {editItem.subsection}</p>
              <p className="text-sm text-gray-200">{editItem.requirement_text}</p>
              {editItem.clia_reference && (
                <p className="text-xs text-gray-500 mt-1">Ref: {editItem.clia_reference}</p>
              )}
            </div>
            <FormField label="Compliance Status">
              <Select value={editForm.compliance_status}
                onChange={e => setEditForm(f => ({...f, compliance_status: e.target.value}))}>
                {STATUS_OPTS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </Select>
            </FormField>
            <FormField label="Evidence (documentation, records, procedures)">
              <Textarea rows={3} value={editForm.evidence}
                onChange={e => setEditForm(f => ({...f, evidence: e.target.value}))}
                placeholder="SOP #QC-001, QC logs reviewed monthly, competency records in HR file…" />
            </FormField>
            {editForm.compliance_status === 'non-compliant' && (
              <FormField label="Deficiency Note / Corrective Action">
                <Textarea rows={3} value={editForm.deficiency_note}
                  onChange={e => setEditForm(f => ({...f, deficiency_note: e.target.value}))}
                  placeholder="Describe deficiency and planned corrective action with due date…" />
              </FormField>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
              <Button variant="iqcp" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Update'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
