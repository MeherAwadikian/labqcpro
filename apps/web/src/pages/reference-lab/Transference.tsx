import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams, NavLink } from 'react-router-dom'
import { api } from '../../lib/api'
import { CheckCircle2, XCircle, AlertTriangle, Plus, ChevronLeft, Loader2, Save } from 'lucide-react'

const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full'
const lbl = 'text-xs text-gray-400 mb-1 block'

type TransStudy = {
  id: string; analyte_name: string; source_name: string
  lower_limit: number; upper_limit: number; unit: string; sample_type: string
  n_samples: number; n_within: number; pct_within: number | null
  result: string; notes: string; created_at: string
  samples: { id: string; sample_number: number; measured_value: number; within_ri: number }[]
}
type Summary = { id: string; analyte_name: string; source_name: string; result: string; pct_within: number | null; n_samples: number; created_at: string }

const RESULT_CONFIG: Record<string, { label: string; color: string; border: string; bg: string; icon: any; text: string }> = {
  pass:       { label: 'PASS',       color: 'text-green-400',  border: 'border-green-700',  bg: 'bg-green-900/20',  icon: CheckCircle2, text: '≥18/20 samples within the reference RI. You may adopt this RI.' },
  borderline: { label: 'BORDERLINE', color: 'text-amber-400',  border: 'border-amber-700',  bg: 'bg-amber-900/20',  icon: AlertTriangle, text: '17/20 samples within RI. Expand to 60 samples per CLSI EP28-A3c to confirm.' },
  fail:       { label: 'FAIL',       color: 'text-red-400',    border: 'border-red-700',    bg: 'bg-red-900/20',    icon: XCircle, text: '≤16/20 samples within RI. This RI is not suitable for your population — establish your own.' },
  pending:    { label: 'PENDING',    color: 'text-gray-400',   border: 'border-gray-700',   bg: 'bg-gray-800',      icon: AlertTriangle, text: 'Enter and save samples to score.' },
}

function NewForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [form, setForm] = useState({
    analyte_name: '', source_name: '', lower_limit: '', upper_limit: '', unit: '', sample_type: 'serum', notes: '',
  })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await api.post<{ id: string }>('/reference-lab/transference', {
        ...form,
        lower_limit: parseFloat(form.lower_limit),
        upper_limit: parseFloat(form.upper_limit),
      })
      onCreated((r as any).id)
    } finally { setSaving(false) }
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4 max-w-2xl">
      <h2 className="text-sm font-semibold text-white">New Transference Study</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={lbl}>Analyte Name *</label>
          <input value={form.analyte_name} onChange={f('analyte_name')} required className={inp} placeholder="e.g. Sodium" />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Reference RI Source *</label>
          <input value={form.source_name} onChange={f('source_name')} required className={inp} placeholder="e.g. NHANES 2020 / WHO 2011 / Manufacturer Insert" />
        </div>
        <div>
          <label className={lbl}>Lower Limit *</label>
          <input type="number" step="any" value={form.lower_limit} onChange={f('lower_limit')} required className={inp} placeholder="136" />
        </div>
        <div>
          <label className={lbl}>Upper Limit *</label>
          <input type="number" step="any" value={form.upper_limit} onChange={f('upper_limit')} required className={inp} placeholder="145" />
        </div>
        <div>
          <label className={lbl}>Unit *</label>
          <input value={form.unit} onChange={f('unit')} required className={inp} placeholder="mEq/L" />
        </div>
        <div>
          <label className={lbl}>Sample Type</label>
          <select value={form.sample_type} onChange={f('sample_type')} className={inp}>
            <option value="serum">Serum</option>
            <option value="plasma">Plasma</option>
            <option value="whole_blood">Whole Blood</option>
            <option value="urine">Urine</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className={lbl}>Notes</label>
          <input value={form.notes} onChange={f('notes')} className={inp} placeholder="Optional" />
        </div>
      </div>
      <button type="submit" disabled={saving}
        className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Create Study
      </button>
    </form>
  )
}

function StudyDetail({ studyId }: { studyId: string }) {
  const [study, setStudy]   = useState<TransStudy | null>(null)
  const [loading, setLoading] = useState(true)
  const [values, setValues] = useState<string[]>(Array(20).fill(''))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ data: TransStudy }>(`/reference-lab/transference/${studyId}`)
      const s = (r as any).data as TransStudy
      setStudy(s)
      if (s.samples.length > 0) {
        const v = Array(Math.max(20, s.samples.length)).fill('')
        s.samples.forEach(sp => { v[sp.sample_number - 1] = String(sp.measured_value) })
        setValues(v)
      }
    } finally { setLoading(false) }
  }, [studyId])

  useEffect(() => { load() }, [load])

  async function save() {
    const nums = values.map(v => parseFloat(v)).filter(n => !isNaN(n))
    if (nums.length < 1) { setError('Enter at least 1 value'); return }
    setSaving(true); setError('')
    try {
      await api.put(`/reference-lab/transference/${studyId}/samples`, { samples: nums })
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  function addRow() { setValues(v => [...v, '']) }

  if (loading || !study) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-brand-400" /></div>

  const rc = RESULT_CONFIG[study.result] ?? RESULT_CONFIG.pending
  const ResultIcon = rc.icon

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{study.analyte_name}</h2>
            <div className="text-sm text-gray-400 mt-1">Source: {study.source_name}</div>
            <div className="text-brand-300 font-semibold mt-1">
              RI: {study.lower_limit} – {study.upper_limit} {study.unit}
            </div>
          </div>
          {study.result !== 'pending' && (
            <div className={`${rc.bg} ${rc.border} border rounded-xl p-3 text-center`}>
              <ResultIcon size={20} className={`${rc.color} mx-auto mb-1`} />
              <div className={`text-sm font-bold ${rc.color}`}>{rc.label}</div>
              <div className="text-xs text-gray-400">{study.n_within}/{study.n_samples}</div>
            </div>
          )}
        </div>
      </div>

      {/* Result interpretation */}
      {study.result !== 'pending' && (
        <div className={`${rc.bg} border ${rc.border} rounded-xl p-4 space-y-2`}>
          <div className={`text-sm font-semibold ${rc.color} flex items-center gap-2`}>
            <ResultIcon size={14} /> {rc.label} — {study.pct_within?.toFixed(0)}% within RI
          </div>
          <div className="text-xs text-gray-300">{rc.text}</div>

          {/* Visual bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>0%</span><span>90% threshold</span><span>100%</span>
            </div>
            <div className="h-4 bg-gray-700 rounded-full relative overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${study.result === 'pass' ? 'bg-green-500' : study.result === 'borderline' ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${study.pct_within ?? 0}%` }}
              />
              <div className="absolute top-0 h-full w-0.5 bg-white/30" style={{ left: '90%' }} />
            </div>
          </div>
        </div>
      )}

      {/* Sample entry */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          Sample Values
          <span className="text-xs text-gray-500 font-normal">(20 minimum per CLSI EP28-A3c)</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {values.map((v, i) => {
            const num = parseFloat(v)
            const within = !isNaN(num) && study ? num >= study.lower_limit && num <= study.upper_limit : null
            return (
              <div key={i} className="relative">
                <div className="text-xs text-gray-600 mb-0.5">#{i + 1}</div>
                <input
                  type="number" step="any"
                  value={v}
                  onChange={e => setValues(prev => { const n = [...prev]; n[i] = e.target.value; return n })}
                  className={`w-full bg-gray-800 border rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                    within === true ? 'border-green-700 text-green-300' :
                    within === false ? 'border-red-700 text-red-300' : 'border-gray-700 text-gray-100'
                  }`}
                  placeholder="—"
                />
                {within !== null && (
                  <div className={`absolute right-1 top-6 text-xs ${within ? 'text-green-500' : 'text-red-500'}`}>
                    {within ? '✓' : '✗'}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={addRow} className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1">
            <Plus size={12} /> Add row
          </button>
          <div className="flex-1" />
          <div className="text-xs text-gray-500">
            {values.filter(v => !isNaN(parseFloat(v))).length} of {values.length} filled
          </div>
          <button
            onClick={save} disabled={saving}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Scoring…' : 'Save & Score'}
          </button>
        </div>

        {error && <div className="text-xs text-red-400">{error}</div>}

        <div className="flex items-center gap-4 text-xs text-gray-500 border-t border-gray-800 pt-3">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-green-700 bg-green-900/20" /> Within RI</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-red-700 bg-red-900/20" /> Outside RI</span>
          <span className="ml-auto">Pass threshold: 90% (18/20)</span>
        </div>
      </div>
    </div>
  )
}

export default function Transference() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [studies, setStudies] = useState<Summary[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!id) {
      api.get<{ data: Summary[] }>('/reference-lab/transference')
        .then((r: any) => setStudies(r.data ?? []))
        .finally(() => setLoading(false))
    } else { setLoading(false) }
  }, [id])

  if (id) return (
    <div className="space-y-4">
      <NavLink to="/reference-lab/transference" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
        <ChevronLeft size={14} /> All Transference Studies
      </NavLink>
      <StudyDetail studyId={id} />
    </div>
  )

  const COLORS: Record<string, string> = { pass: 'text-green-400', borderline: 'text-amber-400', fail: 'text-red-400', pending: 'text-gray-500' }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <CheckCircle2 size={18} className="text-green-400" />
          Transference Verification
        </h1>
        <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
          <Plus size={14} /> New Study
        </button>
      </div>

      <div className="bg-green-900/10 border border-green-800 rounded-xl p-4 text-xs text-green-300 space-y-1">
        <div className="font-semibold">CLSI EP28-A3c Transference Verification</div>
        <div>Use 20 samples from healthy individuals. Measure each on your instrument. If ≥18/20 fall within the reference RI → you can adopt it. Fewer than 18 may require a larger study or your own de novo establishment.</div>
      </div>

      {showForm && <NewForm onCreated={id => { setShowForm(false); navigate(`/reference-lab/transference/${id}`) }} />}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-brand-400" /></div>
      ) : studies.length === 0 && !showForm ? (
        <div className="text-center py-12 text-gray-600">
          <CheckCircle2 size={32} className="mx-auto mb-3 opacity-30" />
          <div className="text-sm">No studies yet</div>
          <button onClick={() => setShowForm(true)} className="mt-3 text-xs text-brand-400 hover:text-brand-300">Start a verification →</button>
        </div>
      ) : (
        <div className="space-y-2">
          {studies.map(s => (
            <NavLink key={s.id} to={`/reference-lab/transference/${s.id}`}
              className="flex items-center justify-between bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl px-5 py-4 transition-colors">
              <div>
                <div className="font-medium text-white">{s.analyte_name}</div>
                <div className="text-xs text-gray-500">{s.source_name} · {s.n_samples} samples · {new Date(s.created_at).toLocaleDateString()}</div>
              </div>
              <div className="text-right">
                {s.pct_within != null && <div className="text-xs text-gray-400">{s.pct_within.toFixed(0)}% within RI</div>}
                <div className={`text-sm font-semibold capitalize ${COLORS[s.result] ?? 'text-gray-500'}`}>{s.result}</div>
              </div>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}
