import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Card, Button, Input, Select, Textarea, FormField, Modal, Badge, PageHeader, Spinner, Table, Th, Td, EmptyState } from '../../components/ui'
import { Plus, Clock, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../../store/auth'

interface Extension {
  id: string; reagent_name: string; lot_number: string; original_expiry: string
  requested_extension_date: string; justification: string; regulatory_basis: string
  status: string; approved_by: string | null; approval_date: string | null; created_at: string
}

interface ReagentLot { id: string; reagent_name: string; lot_number: string; expiry_date: string }

const RULES = [
  "Reagent extension must be supported by documented QC performance data",
  "Extension must not exceed manufacturer's opened-vial stability period",
  "Lab director signature required for all extensions",
  "Maximum extension: document per reagent category — typically 30–90 days",
  "If QC fails during extension period, immediately remove from service",
]

const empty = {
  reagent_lot_id: '', requested_extension_date: '',
  justification: '', supporting_data: '', regulatory_basis: '',
}

export default function IQCPExtensions() {
  const [extensions, setExtensions] = useState<Extension[]>([])
  const [reagentLots, setReagentLots] = useState<ReagentLot[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [approveId, setApproveId] = useState<string | null>(null)
  const [approvedBy, setApprovedBy] = useState('')
  const [approveDecision, setApproveDecision] = useState<'approved'|'denied'>('approved')
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const role = useAuthStore(s => s.role)

  async function load() {
    const [e, r] = await Promise.all([
      api.get<{ data: Extension[] }>('/iqcp/extensions'),
      api.get<{ data: ReagentLot[] }>('/iqcp/reagents'),
    ])
    setExtensions(e.data)
    setReagentLots(r.data.filter(r => r.expiry_date <= new Date().toISOString().split('T')[0] || true))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save() {
    if (form.justification.length < 200) {
      alert('Justification must be at least 200 characters')
      return
    }
    setSaving(true)
    try {
      await api.post('/iqcp/extensions', form)
      await load(); setAddOpen(false); setForm(empty)
    } finally { setSaving(false) }
  }

  async function approve() {
    if (!approveId) return
    await api.post(`/iqcp/extensions/${approveId}/approve`, { approved_by: approvedBy, decision: approveDecision })
    setApproveId(null); await load()
  }

  const statusVariant = (s: string) =>
    s === 'approved' ? 'success' : s === 'denied' ? 'danger' : 'warning'

  return (
    <div>
      <PageHeader
        title="Expired Reagent Extensions"
        subtitle="Document and approve extensions to reagent use beyond labeled expiry"
        action={<Button variant="iqcp" onClick={() => setAddOpen(true)}><Plus size={16} />New Extension</Button>}
      />

      {/* Regulatory warnings */}
      <Card className="mb-4 bg-amber-900/10 border-amber-800">
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-300 mb-2">Regulatory Requirements for Extensions</p>
            <ul className="space-y-1">
              {RULES.map((r, i) => (
                <li key={i} className="text-xs text-amber-200/70 flex items-start gap-2">
                  <span className="text-amber-500">⚠</span>{r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : extensions.length === 0 ? (
        <EmptyState icon={<Clock size={40} />} title="No extension requests" desc="Document any reagent extensions for audit trail and regulatory compliance" />
      ) : (
        <Card className="p-0">
          <Table>
            <thead><tr>
              {['Reagent', 'Lot #', 'Original Expiry', 'Requested Until', 'Status', 'Approved By', ''].map(h => <Th key={h}>{h}</Th>)}
            </tr></thead>
            <tbody>
              {extensions.map(e => (
                <tr key={e.id} className="hover:bg-gray-800/30 transition-colors">
                  <Td><span className="font-medium text-white">{e.reagent_name}</span></Td>
                  <Td><code className="text-xs text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded">{e.lot_number}</code></Td>
                  <Td className="text-gray-400">{e.original_expiry}</Td>
                  <Td className="text-iqcp-300 font-medium">{e.requested_extension_date}</Td>
                  <Td><Badge variant={statusVariant(e.status)} className="capitalize">{e.status}</Badge></Td>
                  <Td className="text-gray-400">{e.approved_by ?? '—'}</Td>
                  <Td>
                    {e.status === 'pending' && (role === 'admin' || role === 'director') && (
                      <Button variant="iqcp" size="sm" onClick={() => setApproveId(e.id)}>Review</Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Add Extension Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Request Reagent Extension" maxWidth="max-w-2xl">
        <div className="space-y-4">
          <FormField label="Reagent Lot *">
            <Select value={form.reagent_lot_id} onChange={e => setForm(f => ({...f, reagent_lot_id: e.target.value}))}>
              <option value="">Select lot…</option>
              {reagentLots.map(r => (
                <option key={r.id} value={r.id}>{r.reagent_name} — Lot {r.lot_number} (exp: {r.expiry_date})</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Requested Extension Date *">
            <Input type="date" value={form.requested_extension_date}
              onChange={e => setForm(f => ({...f, requested_extension_date: e.target.value}))} />
          </FormField>
          <FormField label={`Justification * (${form.justification.length}/200 min)`}>
            <Textarea rows={5} value={form.justification}
              onChange={e => setForm(f => ({...f, justification: e.target.value}))}
              placeholder="Describe why this extension is clinically necessary and what data supports it…" />
          </FormField>
          <FormField label="Supporting Data">
            <Textarea rows={3} value={form.supporting_data}
              onChange={e => setForm(f => ({...f, supporting_data: e.target.value}))}
              placeholder="QC performance data, dates, values demonstrating ongoing acceptability…" />
          </FormField>
          <FormField label="Regulatory Basis *">
            <Textarea rows={2} value={form.regulatory_basis}
              onChange={e => setForm(f => ({...f, regulatory_basis: e.target.value}))}
              placeholder="CLIA 42 CFR 493.1252 — test system requirements; Manufacturer authorization letter dated…" />
          </FormField>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="iqcp" onClick={save} disabled={saving || !form.reagent_lot_id || !form.justification}>
              {saving ? 'Submitting…' : 'Submit Request'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Approve Modal */}
      <Modal open={!!approveId} onClose={() => setApproveId(null)} title="Review Extension Request">
        <div className="space-y-4">
          <FormField label="Decision">
            <Select value={approveDecision} onChange={e => setApproveDecision(e.target.value as any)}>
              <option value="approved">Approve</option>
              <option value="denied">Deny</option>
            </Select>
          </FormField>
          <FormField label="Approver Name (Lab Director) *">
            <Input value={approvedBy} onChange={e => setApprovedBy(e.target.value)} placeholder="Dr. Smith" />
          </FormField>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setApproveId(null)}>Cancel</Button>
            <Button variant={approveDecision === 'approved' ? 'iqcp' : 'danger'} onClick={approve} disabled={!approvedBy}>
              {approveDecision === 'approved' ? 'Approve' : 'Deny'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
