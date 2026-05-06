import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Card, Button, Input, FormField, Modal, Badge, Table, Th, Td, PageHeader, EmptyState, Spinner } from '../components/ui'
import { Plus, Edit2, Trash2, FlaskConical } from 'lucide-react'

interface Analyte {
  id: string; name: string; unit: string; method: string; instrument: string
  amr_lower?: number; amr_upper?: number; tea?: number
}

const empty = { name: '', unit: '', method: '', instrument: '', amr_lower: '', amr_upper: '', tea: '' }

export default function Analytes() {
  const [analytes, setAnalytes] = useState<Analyte[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Analyte | null>(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await api.get<{ data: Analyte[] }>('/analytes')
    setAnalytes(res.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function openNew() { setEditing(null); setForm(empty); setModalOpen(true) }
  function openEdit(a: Analyte) {
    setEditing(a)
    setForm({ name: a.name, unit: a.unit, method: a.method, instrument: a.instrument,
      amr_lower: a.amr_lower?.toString() ?? '', amr_upper: a.amr_upper?.toString() ?? '',
      tea: a.tea?.toString() ?? '' })
    setModalOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      const body = {
        ...form,
        amr_lower: form.amr_lower ? parseFloat(form.amr_lower) : undefined,
        amr_upper: form.amr_upper ? parseFloat(form.amr_upper) : undefined,
        tea: form.tea ? parseFloat(form.tea) : undefined,
      }
      if (editing) {
        await api.put(`/analytes/${editing.id}`, body)
      } else {
        await api.post('/analytes', body)
      }
      await load()
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function del(id: string) {
    if (!confirm('Delete this analyte and all its QC data?')) return
    await api.delete(`/analytes/${id}`)
    setAnalytes(a => a.filter(x => x.id !== id))
  }

  return (
    <div>
      <PageHeader
        title="Analytes"
        subtitle="Manage your test menu and measurement systems"
        action={<Button onClick={openNew}><Plus size={16} />Add Analyte</Button>}
      />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : analytes.length === 0 ? (
        <EmptyState icon={<FlaskConical size={40} />} title="No analytes yet" desc="Add your first test analyte to start tracking QC data" />
      ) : (
        <Card className="p-0">
          <Table>
            <thead>
              <tr>
                {['Analyte', 'Unit', 'Method', 'Instrument', 'AMR', 'TEa%', ''].map(h => <Th key={h}>{h}</Th>)}
              </tr>
            </thead>
            <tbody>
              {analytes.map(a => (
                <tr key={a.id} className="hover:bg-gray-800/30 transition-colors">
                  <Td><span className="font-medium text-white">{a.name}</span></Td>
                  <Td><Badge variant="info">{a.unit}</Badge></Td>
                  <Td className="text-gray-400">{a.method || '—'}</Td>
                  <Td className="text-gray-400">{a.instrument || '—'}</Td>
                  <Td className="text-gray-400">
                    {a.amr_lower != null && a.amr_upper != null
                      ? `${a.amr_lower}–${a.amr_upper}`
                      : '—'}
                  </Td>
                  <Td>{a.tea != null ? `${a.tea}%` : '—'}</Td>
                  <Td>
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(a)}><Edit2 size={14} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del(a.id)} className="hover:text-red-400"><Trash2 size={14} /></Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Analyte' : 'Add Analyte'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Name *">
              <Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Glucose" />
            </FormField>
            <FormField label="Unit *">
              <Input value={form.unit} onChange={e => setForm(f => ({...f, unit: e.target.value}))} placeholder="mg/dL" />
            </FormField>
            <FormField label="Method">
              <Input value={form.method} onChange={e => setForm(f => ({...f, method: e.target.value}))} placeholder="Enzymatic" />
            </FormField>
            <FormField label="Instrument">
              <Input value={form.instrument} onChange={e => setForm(f => ({...f, instrument: e.target.value}))} placeholder="Cobas 501" />
            </FormField>
            <FormField label="AMR Lower">
              <Input type="number" value={form.amr_lower} onChange={e => setForm(f => ({...f, amr_lower: e.target.value}))} placeholder="2" />
            </FormField>
            <FormField label="AMR Upper">
              <Input type="number" value={form.amr_upper} onChange={e => setForm(f => ({...f, amr_upper: e.target.value}))} placeholder="500" />
            </FormField>
            <FormField label="TEa (%)">
              <Input type="number" value={form.tea} onChange={e => setForm(f => ({...f, tea: e.target.value}))} placeholder="10" />
            </FormField>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name || !form.unit}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
