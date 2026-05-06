import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Card, Button, Input, Select, FormField, Modal, Badge, PageHeader, Spinner } from '../components/ui'
import { Plus, AlertTriangle, CheckCircle, Upload } from 'lucide-react'

interface Analyte { id: string; name: string; unit: string }
interface Violation { rule: string; severity: string }

export default function QCEntry() {
  const [analytes, setAnalytes] = useState<Analyte[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    analyte_id: '', level: 'normal', value: '', run_date: new Date().toISOString().split('T')[0],
    operator: '', lot_number: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ violations: Violation[] } | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [batchSubmitting, setBatchSubmitting] = useState(false)

  useEffect(() => {
    api.get<{ data: Analyte[] }>('/analytes').then(r => { setAnalytes(r.data); setLoading(false) })
  }, [])

  function set(field: string, val: string) { setForm(f => ({...f, [field]: val})) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.value || !form.analyte_id) return
    setSubmitting(true)
    setResult(null)
    try {
      const res = await api.post<{ data: { violations: Violation[] } }>('/qc/runs', {
        ...form, value: parseFloat(form.value),
      })
      setResult(res.data)
      setForm(f => ({ ...f, value: '', lot_number: f.lot_number }))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleBatch() {
    if (!form.analyte_id || !batchText.trim()) return
    setBatchSubmitting(true)
    try {
      const rows = batchText.trim().split('\n').map(line => {
        const [value, run_date] = line.split(',').map(s => s.trim())
        return { value: parseFloat(value), run_date: run_date || form.run_date }
      }).filter(r => !isNaN(r.value))

      await api.post('/qc/batch', {
        analyte_id: form.analyte_id, level: form.level,
        operator: form.operator, lot_number: form.lot_number, rows,
      })
      setBatchOpen(false)
      setBatchText('')
      alert(`Imported ${rows.length} QC runs successfully`)
    } finally {
      setBatchSubmitting(false)
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size={32} /></div>

  return (
    <div>
      <PageHeader
        title="QC Entry"
        subtitle="Enter individual or batch QC results"
        action={
          <Button variant="outline" onClick={() => setBatchOpen(true)}>
            <Upload size={16} /> Batch Import
          </Button>
        }
      />

      <div className="max-w-lg">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Analyte *">
              <Select value={form.analyte_id} onChange={e => set('analyte_id', e.target.value)} required>
                <option value="">Select analyte…</option>
                {analytes.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>
                ))}
              </Select>
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Level *">
                <Select value={form.level} onChange={e => set('level', e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="abnormal">Abnormal</option>
                </Select>
              </FormField>
              <FormField label="Value *">
                <Input
                  type="number" step="any" required
                  value={form.value} onChange={e => set('value', e.target.value)}
                  placeholder="Enter result"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Run Date *">
                <Input type="date" value={form.run_date} onChange={e => set('run_date', e.target.value)} required />
              </FormField>
              <FormField label="Operator *">
                <Input value={form.operator} onChange={e => set('operator', e.target.value)} placeholder="Tech name" required />
              </FormField>
            </div>

            <FormField label="Reagent Lot # *">
              <Input value={form.lot_number} onChange={e => set('lot_number', e.target.value)} placeholder="L-2024-001" required />
            </FormField>

            <Button type="submit" className="w-full" disabled={submitting}>
              <Plus size={16} />
              {submitting ? 'Submitting…' : 'Submit QC Run'}
            </Button>
          </form>

          {result && (
            <div className={`mt-4 p-4 rounded-lg border ${
              result.violations.some(v => v.severity === 'reject')
                ? 'bg-red-900/20 border-red-800'
                : result.violations.length > 0
                ? 'bg-amber-900/20 border-amber-800'
                : 'bg-green-900/20 border-green-800'
            }`}>
              {result.violations.length === 0 ? (
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle size={16} />
                  <span className="font-medium">QC Accepted — No violations</span>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-red-400" />
                    <span className="font-medium text-red-400">Westgard Violations Detected</span>
                  </div>
                  <div className="space-y-1">
                    {result.violations.map((v, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Badge variant={v.severity === 'reject' ? 'danger' : 'warning'}>{v.rule}</Badge>
                        <span className="text-sm text-gray-400 capitalize">{v.severity}</span>
                      </div>
                    ))}
                  </div>
                  {result.violations.some(v => v.severity === 'reject') && (
                    <p className="text-sm text-red-300 mt-2 font-medium">
                      ⚠ Run rejected — investigate and take corrective action before reporting results
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Modal open={batchOpen} onClose={() => setBatchOpen(false)} title="Batch CSV Import">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Paste CSV data: <code className="bg-gray-800 px-1 rounded text-brand-300">value, run_date</code> — one row per line.
            Date format: YYYY-MM-DD
          </p>
          <textarea
            value={batchText}
            onChange={e => setBatchText(e.target.value)}
            rows={10}
            placeholder={"5.2, 2024-11-01\n5.4, 2024-11-02\n5.1, 2024-11-03"}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-gray-500">
            Uses analyte, level, operator, and lot number from the form above.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setBatchOpen(false)}>Cancel</Button>
            <Button onClick={handleBatch} disabled={batchSubmitting || !batchText.trim()}>
              {batchSubmitting ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
