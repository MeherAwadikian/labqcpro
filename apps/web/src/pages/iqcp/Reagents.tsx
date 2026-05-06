import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Card, Button, Input, Select, FormField, Modal, Badge, PageHeader, Spinner, Table, Th, Td, EmptyState } from '../../components/ui'
import { Plus, TestTube2, AlertTriangle } from 'lucide-react'

interface Lot {
  id: string; analyte_name: string | null; reagent_name: string; manufacturer: string
  lot_number: string; received_date: string; expiry_date: string
  status: string; verification_status: string; days_to_expiry: number
}

function expiryBadge(days: number, status: string) {
  if (status === 'expired')    return { label: 'EXPIRED',       variant: 'danger'   as const }
  if (status === 'extended')   return { label: 'EXTENDED',      variant: 'purple'   as const }
  if (status === 'quarantine') return { label: 'QUARANTINED',   variant: 'danger'   as const }
  if (days < 0)                return { label: 'EXPIRED',       variant: 'danger'   as const }
  if (days < 15)               return { label: 'EXPIRING SOON', variant: 'danger'   as const }
  if (days < 30)               return { label: `${days}d left`,  variant: 'warning'  as const }
  return                              { label: `${days}d left`,  variant: 'success'  as const }
}

const emptyForm = { analyte_id: '', reagent_name: '', manufacturer: '', lot_number: '', received_date: '', expiry_date: '', open_date: '' }

export default function IQCPReagents() {
  const [lots, setLots] = useState<Lot[]>([])
  const [analytes, setAnalytes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [verifyId, setVerifyId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [verifyForm, setVerifyForm] = useState({ acceptance_pct: 10, tested_by: '', results: [{ test_performed: 'QC run', result_value: '' }] })
  const [saving, setSaving] = useState(false)

  async function load() {
    const [l, a] = await Promise.all([
      api.get<{ data: Lot[] }>('/iqcp/reagents'),
      api.get<{ data: any[] }>('/analytes'),
    ])
    setLots(l.data); setAnalytes(a.data); setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    try {
      const body = { ...form, analyte_id: form.analyte_id || undefined, open_date: form.open_date || undefined }
      await api.post('/iqcp/reagents', body)
      await load(); setAddOpen(false); setForm(emptyForm)
    } finally { setSaving(false) }
  }

  async function verify() {
    if (!verifyId) return
    setSaving(true)
    try {
      const rows = verifyForm.results.filter(r => r.result_value).map(r => ({
        test_performed: r.test_performed,
        result_value: parseFloat(r.result_value),
      }))
      await api.post(`/iqcp/reagents/${verifyId}/verify`, {
        results: rows, acceptance_pct: verifyForm.acceptance_pct, tested_by: verifyForm.tested_by,
      })
      await load(); setVerifyId(null)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <PageHeader
        title="Reagent Lots"
        subtitle="Track reagent lot verification, expiry, and quarantine status"
        action={<Button variant="iqcp" onClick={() => setAddOpen(true)}><Plus size={16} />Add Lot</Button>}
      />

      {/* Alert banner */}
      {lots.filter(l => l.days_to_expiry < 14).length > 0 && (
        <div className="bg-amber-900/20 border border-amber-800 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-400" />
          <p className="text-sm text-amber-300">
            {lots.filter(l => l.days_to_expiry < 14).length} reagent lot(s) expiring within 14 days — review immediately
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : lots.length === 0 ? (
        <EmptyState icon={<TestTube2 size={40} />} title="No reagent lots" desc="Add reagent lots to track expiry and verification status" />
      ) : (
        <Card className="p-0">
          <Table>
            <thead><tr>
              {['Reagent', 'Analyte', 'Lot #', 'Received', 'Expiry', 'Verified', ''].map(h => <Th key={h}>{h}</Th>)}
            </tr></thead>
            <tbody>
              {lots.map(lot => {
                const eb = expiryBadge(lot.days_to_expiry, lot.status)
                return (
                  <tr key={lot.id} className={`hover:bg-gray-800/30 transition-colors ${lot.status === 'quarantine' ? 'opacity-60' : ''}`}>
                    <Td>
                      <span className="font-medium text-white">{lot.reagent_name}</span>
                      <div className="text-xs text-gray-500">{lot.manufacturer}</div>
                    </Td>
                    <Td className="text-gray-400">{lot.analyte_name ?? '—'}</Td>
                    <Td><code className="text-xs text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded">{lot.lot_number}</code></Td>
                    <Td className="text-gray-400">{lot.received_date}</Td>
                    <Td>
                      <Badge variant={eb.variant}>{eb.label}</Badge>
                    </Td>
                    <Td>
                      <Badge variant={lot.verification_status === 'passed' ? 'success' : lot.verification_status === 'failed' ? 'danger' : 'warning'}>
                        {lot.verification_status}
                      </Badge>
                    </Td>
                    <Td>
                      {lot.verification_status === 'pending' && lot.status !== 'quarantine' && (
                        <Button variant="iqcp" size="sm" onClick={() => setVerifyId(lot.id)}>Verify</Button>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Add Lot Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Reagent Lot">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Reagent Name *"><Input value={form.reagent_name} onChange={e => setForm(f => ({...f, reagent_name: e.target.value}))} placeholder="Glucose Reagent" /></FormField>
            <FormField label="Manufacturer *"><Input value={form.manufacturer} onChange={e => setForm(f => ({...f, manufacturer: e.target.value}))} placeholder="Roche" /></FormField>
            <FormField label="Lot Number *"><Input value={form.lot_number} onChange={e => setForm(f => ({...f, lot_number: e.target.value}))} /></FormField>
            <FormField label="Analyte">
              <Select value={form.analyte_id} onChange={e => setForm(f => ({...f, analyte_id: e.target.value}))}>
                <option value="">Select…</option>
                {analytes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Received Date *"><Input type="date" value={form.received_date} onChange={e => setForm(f => ({...f, received_date: e.target.value}))} /></FormField>
            <FormField label="Expiry Date *"><Input type="date" value={form.expiry_date} onChange={e => setForm(f => ({...f, expiry_date: e.target.value}))} /></FormField>
            <FormField label="Open Date"><Input type="date" value={form.open_date} onChange={e => setForm(f => ({...f, open_date: e.target.value}))} /></FormField>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="iqcp" onClick={save} disabled={saving || !form.reagent_name || !form.lot_number || !form.expiry_date}>
              {saving ? 'Saving…' : 'Add Lot'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Verify Modal */}
      <Modal open={!!verifyId} onClose={() => setVerifyId(null)} title="Lot Verification">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Enter QC results obtained with the new lot. Results are compared against established mean ±{verifyForm.acceptance_pct}%.</p>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Acceptance Limit (%)">
              <Input type="number" value={verifyForm.acceptance_pct}
                onChange={e => setVerifyForm(f => ({...f, acceptance_pct: parseFloat(e.target.value)}))} />
            </FormField>
            <FormField label="Tested By *">
              <Input value={verifyForm.tested_by}
                onChange={e => setVerifyForm(f => ({...f, tested_by: e.target.value}))} placeholder="Tech name" />
            </FormField>
          </div>
          <div>
            <p className="text-sm text-gray-300 mb-2">Test Results (min 5 recommended)</p>
            {verifyForm.results.map((r, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input value={r.result_value} type="number" step="any"
                  onChange={e => setVerifyForm(f => ({ ...f, results: f.results.map((x, j) => j === i ? {...x, result_value: e.target.value} : x) }))}
                  placeholder={`Result ${i + 1}`} />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() =>
              setVerifyForm(f => ({...f, results: [...f.results, { test_performed: 'QC run', result_value: '' }]}))}>
              + Add result
            </Button>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setVerifyId(null)}>Cancel</Button>
            <Button variant="iqcp" onClick={verify} disabled={saving || !verifyForm.tested_by}>
              {saving ? 'Verifying…' : 'Submit Verification'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
