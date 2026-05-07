import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams, NavLink } from 'react-router-dom'
import { api } from '../../lib/api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import {
  FlaskConical, Plus, Trash2, Calculator, ChevronLeft, Loader2,
  CheckCircle2, AlertTriangle, Info, Upload,
} from 'lucide-react'

const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full'
const lbl = 'text-xs text-gray-400 mb-1 block'

type Study = {
  id: string; analyte_name: string; population_group: string; sex: string
  age_min: number | null; age_max: number | null; sample_type: string; unit: string
  method: string; instrument: string; notes: string
  n_subjects: number; lower_limit: number | null; upper_limit: number | null
  lower_ci_lo: number | null; lower_ci_hi: number | null
  upper_ci_lo: number | null; upper_ci_hi: number | null
  mean_val: number | null; sd_val: number | null; cv_pct: number | null
  median_val: number | null; skewness: number | null
  distribution_type: string; method_used: string; outliers_removed: number
  status: string; created_at: string
  data_points: { id: string; value: number; excluded: number }[]
}

type StudySummary = {
  id: string; analyte_name: string; status: string
  lower_limit: number | null; upper_limit: number | null; unit: string
  n_subjects: number; created_at: string
}

// Build histogram bins
function buildHistogram(values: number[], lower: number, upper: number, nBins = 20) {
  if (!values.length) return []
  const min = Math.min(...values), max = Math.max(...values)
  const w = (max - min) / nBins
  const bins: { x: number; count: number; inRI: boolean }[] = []
  for (let i = 0; i < nBins; i++) {
    const lo = min + i * w, hi = lo + w
    bins.push({
      x: Math.round((lo + hi) / 2 * 100) / 100,
      count: values.filter(v => v >= lo && (i === nBins - 1 ? v <= hi : v < hi)).length,
      inRI: lo >= lower && hi <= upper,
    })
  }
  return bins
}

// ─── New Study Form ───────────────────────────────────────────────────────────
function NewStudyForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [form, setForm] = useState({
    analyte_name: '', population_group: 'adult', sex: 'both',
    age_min: '', age_max: '', sample_type: 'serum',
    unit: '', method: '', instrument: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await api.post<{ id: string }>('/reference-lab/direct', {
        ...form,
        age_min: form.age_min ? parseFloat(form.age_min) : undefined,
        age_max: form.age_max ? parseFloat(form.age_max) : undefined,
      })
      onCreated((r as any).id)
    } finally { setSaving(false) }
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const sel = inp

  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4 max-w-2xl">
      <h2 className="text-sm font-semibold text-white">New Direct RI Study</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={lbl}>Analyte Name *</label>
          <input value={form.analyte_name} onChange={f('analyte_name')} required className={inp} placeholder="e.g. Hemoglobin" />
        </div>
        <div>
          <label className={lbl}>Unit *</label>
          <input value={form.unit} onChange={f('unit')} required className={inp} placeholder="e.g. g/dL" />
        </div>
        <div>
          <label className={lbl}>Sample Type</label>
          <select value={form.sample_type} onChange={f('sample_type')} className={sel}>
            <option value="serum">Serum</option>
            <option value="plasma">Plasma</option>
            <option value="whole_blood">Whole Blood</option>
            <option value="urine">Urine</option>
            <option value="csf">CSF</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Population Group</label>
          <select value={form.population_group} onChange={f('population_group')} className={sel}>
            <option value="adult">Adult</option>
            <option value="pediatric">Pediatric</option>
            <option value="neonatal">Neonatal</option>
            <option value="geriatric">Geriatric</option>
            <option value="pregnant">Pregnant</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Sex</label>
          <select value={form.sex} onChange={f('sex')} className={sel}>
            <option value="both">Combined (M+F)</option>
            <option value="male">Male only</option>
            <option value="female">Female only</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Age Min (years)</label>
          <input type="number" value={form.age_min} onChange={f('age_min')} className={inp} placeholder="18" />
        </div>
        <div>
          <label className={lbl}>Age Max (years)</label>
          <input type="number" value={form.age_max} onChange={f('age_max')} className={inp} placeholder="65" />
        </div>
        <div>
          <label className={lbl}>Method / Assay</label>
          <input value={form.method} onChange={f('method')} className={inp} placeholder="e.g. Enzymatic" />
        </div>
        <div>
          <label className={lbl}>Instrument / Platform</label>
          <input value={form.instrument} onChange={f('instrument')} className={inp} placeholder="e.g. Roche Cobas c702" />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Notes</label>
          <textarea value={form.notes} onChange={f('notes')} rows={2} className={`${inp} resize-none`} />
        </div>
      </div>
      <button
        type="submit" disabled={saving}
        className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Create Study
      </button>
    </form>
  )
}

// ─── Study Detail ─────────────────────────────────────────────────────────────
function StudyDetail({ studyId }: { studyId: string }) {
  const [study, setStudy]     = useState<Study | null>(null)
  const [loading, setLoading] = useState(true)
  const [pasteText, setPaste] = useState('')
  const [adding, setAdding]   = useState(false)
  const [calculating, setCalc] = useState(false)
  const [error, setError]     = useState('')
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ data: Study }>(`/reference-lab/direct/${studyId}`)
      setStudy((r as any).data)
    } finally { setLoading(false) }
  }, [studyId])

  useEffect(() => { load() }, [load])

  async function addData() {
    const nums = pasteText
      .replace(/,/g, '\n').split('\n')
      .map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
    if (!nums.length) { setError('No valid numbers found'); return }
    setAdding(true); setError('')
    try {
      await api.post(`/reference-lab/direct/${studyId}/data`, { values: nums })
      setPaste('')
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setAdding(false) }
  }

  async function clearData() {
    if (!confirm('Delete all data points for this study?')) return
    setClearing(true)
    await api.delete(`/reference-lab/direct/${studyId}/data`)
    await load()
    setClearing(false)
  }

  async function calculate() {
    setCalc(true); setError('')
    try {
      await api.post(`/reference-lab/direct/${studyId}/calculate`, {})
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setCalc(false) }
  }

  if (loading || !study) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-brand-400" /></div>

  const values = study.data_points.filter(d => !d.excluded).map(d => d.value)
  const histogram = study.lower_limit != null
    ? buildHistogram(values, study.lower_limit, study.upper_limit!, 24)
    : []
  const nMin = 120

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Study header */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{study.analyte_name}</h2>
            <div className="text-sm text-gray-400 mt-1 flex gap-3">
              <span className="capitalize">{study.population_group}</span>
              <span className="capitalize">{study.sex}</span>
              <span>{study.unit}</span>
              {study.sample_type && <span className="capitalize">{study.sample_type.replace('_', ' ')}</span>}
            </div>
            {study.method && <div className="text-xs text-gray-500 mt-1">{study.method} · {study.instrument}</div>}
          </div>
          <div className={`text-xs px-2 py-1 rounded-full border ${
            study.status === 'complete' ? 'bg-green-900/20 text-green-400 border-green-700' : 'bg-amber-900/20 text-amber-400 border-amber-700'
          } capitalize`}>
            {study.status.replace('_', ' ')}
          </div>
        </div>
      </div>

      {/* Results (if calculated) */}
      {study.status === 'complete' && study.lower_limit != null && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Reference Interval Results</h3>

          {/* RI display */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-brand-300">
                {study.lower_limit} – {study.upper_limit}
              </div>
              <div className="text-sm text-gray-400">{study.unit} (95% RI)</div>
            </div>
            <div className="text-xs text-gray-500 space-y-1">
              <div>Lower 90% CI: {study.lower_ci_lo} – {study.lower_ci_hi}</div>
              <div>Upper 90% CI: {study.upper_ci_lo} – {study.upper_ci_hi}</div>
              <div>Method: {study.method_used} ({study.distribution_type})</div>
            </div>
          </div>

          {/* Stats table */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
            {[
              ['n', study.n_subjects],
              ['Mean', study.mean_val?.toFixed(2)],
              ['SD', study.sd_val?.toFixed(2)],
              ['CV%', study.cv_pct?.toFixed(1) + '%'],
              ['Median', study.median_val?.toFixed(2)],
              ['Skewness', study.skewness?.toFixed(2)],
            ].map(([k, v]) => (
              <div key={k as string} className="bg-gray-800 rounded-lg p-2">
                <div className="text-xs text-gray-500">{k}</div>
                <div className="text-sm font-semibold text-white">{v}</div>
              </div>
            ))}
          </div>

          {study.outliers_removed > 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-900/10 border border-amber-800 rounded px-3 py-2">
              <AlertTriangle size={12} />
              {study.outliers_removed} outlier{study.outliers_removed > 1 ? 's' : ''} removed by Grubbs test (iterative, α=0.05)
            </div>
          )}

          {/* Histogram */}
          {histogram.length > 0 && (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histogram} margin={{ left: 0, right: 0 }}>
                  <XAxis dataKey="x" tick={{ fontSize: 10, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                    labelStyle={{ color: '#9ca3af' }}
                    formatter={(v: number) => [v, 'Count']}
                  />
                  <ReferenceLine x={study.lower_limit!} stroke="#7c3aed" strokeDasharray="4 2" label={{ value: 'LL', fill: '#7c3aed', fontSize: 10 }} />
                  <ReferenceLine x={study.upper_limit!} stroke="#7c3aed" strokeDasharray="4 2" label={{ value: 'UL', fill: '#7c3aed', fontSize: 10 }} />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {histogram.map((entry, i) => (
                      <Cell key={i} fill={entry.inRI ? '#7c3aed' : '#374151'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className={`text-xs rounded-lg px-3 py-2 border ${
            Math.abs(study.skewness ?? 0) < 0.5
              ? 'bg-green-900/10 border-green-800 text-green-300'
              : 'bg-amber-900/10 border-amber-800 text-amber-300'
          }`}>
            {Math.abs(study.skewness ?? 0) < 0.5
              ? '✅ Distribution is approximately normal — parametric method applied (mean ± 1.96 SD)'
              : `⚠️ Skewness ${study.skewness?.toFixed(2)} — nonparametric method applied (2.5th/97.5th ranked percentiles)`}
          </div>
        </div>
      )}

      {/* Data entry */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Upload size={14} className="text-brand-400" />
            Data Entry
            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
              values.length >= nMin ? 'bg-green-900/20 text-green-400' : 'bg-amber-900/20 text-amber-400'
            }`}>
              {values.length} / {nMin} values {values.length >= nMin ? '✓' : `(${nMin - values.length} more needed)`}
            </span>
          </h3>
          {values.length > 0 && (
            <button onClick={clearData} disabled={clearing} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
              <Trash2 size={12} /> {clearing ? 'Clearing…' : 'Clear all'}
            </button>
          )}
        </div>

        <div className="bg-blue-900/10 border border-blue-800 rounded-lg p-3 text-xs text-blue-300 space-y-1">
          <div className="font-semibold">How to enter data:</div>
          <div>Paste comma-separated or one-per-line values from a spreadsheet. Multiple pastes accumulate.</div>
          <div className="text-gray-400">Example: 13.2, 14.5, 12.8, 15.1, 13.7...</div>
        </div>

        <textarea
          value={pasteText}
          onChange={e => setPaste(e.target.value)}
          rows={5}
          placeholder="Paste values here: 13.2, 14.5, 12.8&#10;or one per line:&#10;13.2&#10;14.5&#10;12.8"
          className={`${inp} font-mono text-xs resize-none`}
        />

        {error && <div className="text-xs text-red-400 bg-red-900/20 border border-red-700 rounded px-3 py-2">{error}</div>}

        <div className="flex gap-3">
          <button
            onClick={addData}
            disabled={adding || !pasteText.trim()}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add Values
          </button>

          {values.length >= 20 && (
            <button
              onClick={calculate}
              disabled={calculating}
              className="bg-green-700 hover:bg-green-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {calculating ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
              {calculating ? 'Computing…' : 'Calculate RI'}
            </button>
          )}
        </div>

        {values.length > 0 && (
          <div className="text-xs text-gray-500">
            Preview — min: {Math.min(...values).toFixed(2)}, max: {Math.max(...values).toFixed(2)},
            mean: {(values.reduce((a,b)=>a+b,0)/values.length).toFixed(2)}
          </div>
        )}
      </div>

      {/* CLSI requirements note */}
      {values.length < nMin && (
        <div className="bg-amber-900/10 border border-amber-800 rounded-xl p-4 text-xs text-amber-300 flex gap-3">
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            <strong>CLSI EP28-A3c:</strong> De novo RI establishment requires a minimum of 120 healthy reference individuals.
            You have {values.length}. You can still compute a preliminary RI with 20+ values for exploration,
            but it will not meet regulatory requirements until you reach 120.
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DirectRI() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [studies, setStudies] = useState<StudySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!id) {
      api.get<{ data: StudySummary[] }>('/reference-lab/direct')
        .then((r: any) => setStudies(r.data ?? []))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [id])

  if (id) {
    return (
      <div className="space-y-4">
        <NavLink to="/reference-lab/direct" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
          <ChevronLeft size={14} /> All Direct Studies
        </NavLink>
        <StudyDetail studyId={id} />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <FlaskConical size={18} className="text-blue-400" />
          Direct RI Establishment
        </h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus size={14} /> New Study
        </button>
      </div>

      <div className="bg-blue-900/10 border border-blue-800 rounded-xl p-4 text-xs text-blue-300 space-y-1">
        <div className="font-semibold">CLSI EP28-A3c De Novo RI Establishment</div>
        <div>Collect ≥120 values from carefully selected healthy reference individuals → system auto-applies Grubbs outlier removal → computes parametric (normal) or nonparametric RI → reports 90% CI via bootstrap.</div>
      </div>

      {showForm && (
        <NewStudyForm onCreated={id => { setShowForm(false); navigate(`/reference-lab/direct/${id}`) }} />
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-brand-400" /></div>
      ) : studies.length === 0 && !showForm ? (
        <div className="text-center py-12 text-gray-600">
          <FlaskConical size={32} className="mx-auto mb-3 opacity-30" />
          <div className="text-sm">No studies yet</div>
          <button onClick={() => setShowForm(true)} className="mt-3 text-xs text-brand-400 hover:text-brand-300">
            Create your first RI study →
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {studies.map(s => (
            <NavLink
              key={s.id}
              to={`/reference-lab/direct/${s.id}`}
              className="flex items-center justify-between bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl px-5 py-4 transition-colors"
            >
              <div>
                <div className="font-medium text-white">{s.analyte_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {s.n_subjects} values · {new Date(s.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="text-right">
                {s.lower_limit != null ? (
                  <div className="text-sm font-semibold text-brand-300">{s.lower_limit} – {s.upper_limit} {s.unit}</div>
                ) : null}
                <div className={`text-xs mt-0.5 ${s.status === 'complete' ? 'text-green-400' : 'text-amber-400'} capitalize`}>
                  {s.status.replace('_', ' ')}
                </div>
              </div>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}
