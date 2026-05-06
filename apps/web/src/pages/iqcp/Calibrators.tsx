import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Card, Button, Input, Select, Textarea, FormField, Modal, Badge, PageHeader, Spinner, Table, Th, Td, EmptyState } from '../../components/ui'
import { Plus, Pipette, Upload } from 'lucide-react'

interface CalLot {
  id: string; analyte_name: string | null; calibrator_name: string; manufacturer: string
  lot_number: string; expiry_date: string; si_unit_traceable: number
  verification_status: string; days_to_expiry: number; open_vial_expired: boolean
}

const emptyForm = {
  analyte_id: '', calibrator_name: '', manufacturer: '', lot_number: '',
  received_date: '', expiry_date: '', open_date: '', open_stability_days: '',
  traceability_statement: '', si_unit_traceable: false,
}

export default function IQCPCalibrators() {
  const [lots, setLots] = useState<CalLot[]>([])
  const [analytes, setAnalytes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [verifyId, setVerifyId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [verifyForm, setVerifyForm] = useState({
    analyte_id: '', expected_value: '', obtained_values: ['', '', '', '', ''],
    acceptance_limit: 5.0, verified_by: ''
  })
  const [saving, setSaving] = useState(false)

  async function load() {
    const [l, a] = await Promise.all([
      api.get<{ data: CalLot[] }>('/iqcp/calibrators'),
      api.get<{ data: any[] }>('/analytes'),
    ])
    setLots(l.data); setAnalytes(a.data); setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    try {
      const body = {
        ...form, analyte_id: form.analyte_id || undefined,
        open_date: form.open_date || undefined,
        open_stability_days: form.open_stability_days ? parseInt(form.open_stability_days) : undefined,
      }
      await api.post('/iqcp/calibrators', body)
      await load(); setAddOpen(false); setForm(emptyForm)
    } finally { setSaving(false) }
  }

  async function verify() {
    if (!verifyId) return
    setSaving(true)
    try {
      const values = verifyForm.obtained_values.filter(v => v).map(v => parseFloat(v))
      await api.post(`/iqcp/calibrators/${verifyId}/verify`, {
        analyte_id: verifyForm.analyte_id,
        expected_value: parseFloat(verifyForm.expected_value),
        obtained_values: values,
        acceptance_limit: verifyForm.acceptance_limit,
        verified_by: verifyForm.verified_by,
      })
      await load(); setVerifyId(null)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <PageHeader
        title="Calibrators"
        subtitle="Verify calibrator lots, traceability, and certificate of analysis"
        action={<Button variant="iqcp" onClick={() => setAddOpen(true)}><Plus size={16} />Add Calibrator</Button>}
      />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : lots.length === 0 ? (
        <EmptyState icon={<Pipette size={40} />} title="No calibrator lots" desc="Add calibrator lots to track verification and traceability" />
      ) : (
        <Card className="p-0">
          <Table>
            <thead><tr>
              {['Calibrator', 'Analyte', 'Lot #', 'Expiry', 'SI Traceable', 'Verified', 'Open-Vial', ''].map(h => <Th key={h}>{h}</Th>)}
            </tr></thead>
            <tbody>
              {lots.map(lot => (
                <tr key={lot.id} className="hover:bg-gray-800/30 transition-colors">
                  <Td>
                    <span className="font-medium text-white">{lot.calibrator_name}</span>
                    <div className="text-xs text-gray-500">{lot.manufacturer}</div>
                  </Td>
                  <Td className="text-gray-400">{lot.analyte_name ?? '—'}</Td>
                  <Td><code className="text-xs text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded">{lot.lot_number}</code></Td>
                  <Td>
                    <Badge variant={lot.days_to_expiry < 14 ? 'danger' : lot.days_to_expiry < 30 ? 'warning' : 'success'}>
                      {lot.expiry_date}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={lot.si_unit_traceable ? 'success' : 'danger'}>
                      {lot.si_unit_traceable ? 'Yes ✓' : 'No ✗'}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={lot.verification_status === 'passed' ? 'success' : lot.verification_status === 'failed' ? 'danger' : 'warning'}>
                      {lot.verification_status}
                    </Badge>
                  </Td>
                  <Td>
                    {lot.open_vial_expired ? (
                      <Badge variant="danger">EXPIRED</Badge>
                    ) : <span className="text-gray-500">OK</span>}
                  </Td>
                  <Td>
                    {lot.verification_status === 'pending' && (
                      <Button variant="iqcp" size="sm" onClick={() => { setVerifyId(lot.id); setVerifyForm(f => ({...f, analyte_id: ''})) }}>
                        Verify
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Add Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Calibrator Lot" maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Calibrator Name *"><Input value={form.calibrator_name} onChange={e => setForm(f => ({...f, calibrator_name: e.target.value}))} /></FormField>
            <FormField label="Manufacturer *"><Input value={form.manufacturer} onChange={e => setForm(f => ({...f, manufacturer: e.target.value}))} /></FormField>
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
            <FormField label="Open-Vial Stability (days)"><Input type="number" value={form.open_stability_days} onChange={e => setForm(f => ({...f, open_stability_days: e.target.value}))} placeholder="30" /></FormField>
          </div>

          <FormField label="Traceability Statement">
            <Textarea rows={2} value={form.traceability_statement}
              onChange={e => setForm(f => ({...f, traceability_statement: e.target.value}))}
              placeholder="This calibrator is traceable to NIST SRM… per Certificate of Analysis…" />
          </FormField>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="si" checked={form.si_unit_traceable}
              onChange={e => setForm(f => ({...f, si_unit_traceable: e.target.checked}))}
              className="w-4 h-4 accent-iqcp-500" />
            <label htmlFor="si" className="text-sm text-gray-300">SI unit traceable (required by CLIA)</label>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="iqcp" onClick={save} disabled={saving || !form.calibrator_name || !form.lot_number}>
              {saving ? 'Saving…' : 'Add Calibrator'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Verify Modal */}
      <Modal open={!!verifyId} onClose={() => setVerifyId(null)} title="Calibrator Verification">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Enter 5 replicates. Result must be within ±{verifyForm.acceptance_limit}% of expected value.</p>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Analyte *">
              <Select value={verifyForm.analyte_id} onChange={e => setVerifyForm(f => ({...f, analyte_id: e.target.value}))}>
                <option value="">Select…</option>
                {analytes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Expected Value (from CoA) *">
              <Input type="number" step="any" value={verifyForm.expected_value}
                onChange={e => setVerifyForm(f => ({...f, expected_value: e.target.value}))} />
            </FormField>
            <FormField label="Acceptance Limit (%)">
              <Input type="number" value={verifyForm.acceptance_limit}
                onChange={e => setVerifyForm(f => ({...f, acceptance_limit: parseFloat(e.target.value)}))} />
            </FormField>
            <FormField label="Verified By *">
              <Input value={verifyForm.verified_by}
                onChange={e => setVerifyForm(f => ({...f, verified_by: e.target.value}))} />
            </FormField>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {verifyForm.obtained_values.map((v, i) => (
              <Input key={i} type="number" step="any" value={v} placeholder={`Rep ${i+1}`}
                onChange={e => setVerifyForm(f => ({...f, obtained_values: f.obtained_values.map((x, j) => j === i ? e.target.value : x)}))} />
            ))}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setVerifyId(null)}>Cancel</Button>
            <Button variant="iqcp" onClick={verify} disabled={saving || !verifyForm.expected_value || !verifyForm.verified_by}>
              {saving ? 'Verifying…' : 'Submit'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
