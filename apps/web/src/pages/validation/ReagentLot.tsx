import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { computeStats, pctDiff } from '../../lib/stats'
import {
  ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ScatterChart,
} from 'recharts'

type Analyte = { id: string; name: string; unit: string; tea: number | null }
type SampleRow = { label: string; current: string; newLot: string }

const STEPS = ['Setup', 'Data Entry', 'Statistics', 'Graphs', 'Conclusion']

const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'
const labelCls = 'text-xs text-gray-400 mb-1 block'

function StepBar({ step, total, labels }: { step: number; total: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-1 flex-1">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
            i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-500'
          }`}>{i + 1}</div>
          <span className={`text-xs hidden sm:block ${i === step ? 'text-white font-medium' : 'text-gray-500'}`}>{l}</span>
          {i < total - 1 && <div className={`h-0.5 flex-1 mx-1 ${i < step ? 'bg-brand-600' : 'bg-gray-800'}`} />}
        </div>
      ))}
    </div>
  )
}

export default function ReagentLot() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const studyId = params.get('id')

  const [step, setStep] = useState(0)
  const [analytes, setAnalytes] = useState<Analyte[]>([])
  const [saving, setSaving] = useState(false)

  // Setup
  const [title, setTitle]         = useState('')
  const [analyteId, setAnalyteId] = useState('')
  const [currentLot, setCurrentLot] = useState('')
  const [newLot, setNewLot]         = useState('')
  const [instrument, setInstrument] = useState('')
  const [operator, setOperator]     = useState('')
  const [tea, setTea]               = useState('10')
  const [rejLimit, setRejLimit]     = useState('5')
  const [notes, setNotes]           = useState('')

  // Samples
  const [samples, setSamples] = useState<SampleRow[]>(() =>
    Array.from({ length: 20 }, (_, i) => ({ label: `S${String(i + 1).padStart(2, '0')}`, current: '', newLot: '' }))
  )

  // Conclusion
  const [conclusion, setConclusion] = useState('')
  const [currentStudyId, setCurrentStudyId] = useState<string | null>(studyId)

  useEffect(() => {
    api.get<Analyte[]>('/analytes').then(setAnalytes)
  }, [])

  useEffect(() => {
    if (!studyId) return
    api.get<any>(`/validation/${studyId}`).then(data => {
      setTitle(data.title ?? '')
      setAnalyteId(data.analyte_id ?? '')
      setConclusion(data.conclusion ?? '')
      const meta = data.metadata ? JSON.parse(data.metadata) : {}
      setCurrentLot(meta.currentLot ?? '')
      setNewLot(meta.newLot ?? '')
      setInstrument(meta.instrument ?? '')
      setOperator(meta.operator ?? '')
      setTea(String(meta.tea ?? 10))
      setRejLimit(String(meta.rejectionLimit ?? 5))
      setNotes(meta.notes ?? '')
      if (data.samples?.length) {
        setSamples(data.samples.map((s: any) => ({
          label: s.sample_id_label,
          current: s.method_a_value ?? '',
          newLot:  s.method_b_value ?? '',
        })))
      }
    })
  }, [studyId])

  // Auto-title from analyte
  useEffect(() => {
    const a = analytes.find(a => a.id === analyteId)
    if (a && !studyId) {
      const d = new Date().toISOString().split('T')[0]
      setTitle(`Reagent Lot Validation — ${a.name} — ${d}`)
      if (a.tea) { setTea(String(a.tea)); setRejLimit(String(a.tea / 2)) }
    }
  }, [analyteId, analytes, studyId])

  function updateSample(i: number, field: keyof SampleRow, val: string) {
    setSamples(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s))
  }

  function addRow() {
    setSamples(prev => [...prev, { label: `S${String(prev.length + 1).padStart(2, '0')}`, current: '', newLot: '' }])
  }

  // Computed stats
  const stats = useMemo(() => {
    const pairs = samples
      .filter(s => s.current !== '' && s.newLot !== '')
      .map(s => ({ a: parseFloat(s.current), b: parseFloat(s.newLot) }))
      .filter(p => isFinite(p.a) && isFinite(p.b))
    if (pairs.length < 2) return null
    return computeStats(pairs, parseFloat(tea) || 10, parseFloat(rejLimit) || 5)
  }, [samples, tea, rejLimit])

  // Chart data
  const diffChartData = samples
    .filter(s => s.current !== '' && s.newLot !== '')
    .map((s, i) => {
      const d = pctDiff(parseFloat(s.current), parseFloat(s.newLot))
      return { sample: i + 1, diff: isFinite(d) ? +d.toFixed(3) : null, pass: Math.abs(d) <= parseFloat(rejLimit) }
    })

  const scatterData = samples
    .filter(s => s.current !== '' && s.newLot !== '')
    .map(s => ({ x: parseFloat(s.current), y: parseFloat(s.newLot) }))
    .filter(p => isFinite(p.x) && isFinite(p.y))

  const regLine = scatterData.length > 1 && stats ? (() => {
    const xs = scatterData.map(p => p.x)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    return [
      { x: xMin, y: stats.slope * xMin + stats.intercept },
      { x: xMax, y: stats.slope * xMax + stats.intercept },
    ]
  })() : []

  const identityLine = scatterData.length > 1 ? (() => {
    const xs = scatterData.map(p => p.x)
    const m = Math.min(...xs), M = Math.max(...xs)
    return [{ x: m, y: m }, { x: M, y: M }]
  })() : []

  async function saveAndNext() {
    setSaving(true)
    try {
      const meta = { currentLot, newLot, instrument, operator, tea: parseFloat(tea), rejectionLimit: parseFloat(rejLimit), notes }
      let id = currentStudyId
      if (!id) {
        const res = await api.post<{ id: string }>('/validation', {
          study_type: 'reagent_lot', title, analyte_id: analyteId || undefined, metadata: meta,
        })
        id = res.id
        setCurrentStudyId(id)
        navigate(`/validation/reagent-lot?id=${id}`, { replace: true })
      } else {
        await api.put(`/validation/${id}`, { title, analyte_id: analyteId || undefined, metadata: meta })
      }
      if (step >= 1) {
        await api.put(`/validation/${id}/samples`, {
          samples: samples.map((s, i) => ({
            sample_id_label: s.label,
            method_a_value: s.current !== '' ? parseFloat(s.current) : null,
            method_b_value: s.newLot !== '' ? parseFloat(s.newLot) : null,
            sort_order: i,
          }))
        })
      }
      setStep(s => s + 1)
    } finally { setSaving(false) }
  }

  async function complete() {
    if (!currentStudyId) return
    setSaving(true)
    try {
      await api.post(`/validation/${currentStudyId}/calculate`, {})
      await api.put(`/validation/${currentStudyId}`, { conclusion, status: 'complete' })
      navigate('/validation')
    } finally { setSaving(false) }
  }

  const rej = parseFloat(rejLimit) || 5

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/validation')} className="text-gray-500 hover:text-gray-300 text-sm">← Validation</button>
        <span className="text-gray-700">/</span>
        <span className="text-gray-300 text-sm font-medium">Reagent Lot Validation</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <StepBar step={step} total={STEPS.length} labels={STEPS} />

        {/* Step 1: Setup */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Study Setup <span className="text-xs text-gray-500 font-normal ml-2">CLSI EP26</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelCls}>Study Title</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="Auto-populated from analyte" />
              </div>
              <div>
                <label className={labelCls}>Analyte</label>
                <select value={analyteId} onChange={e => setAnalyteId(e.target.value)} className={inputCls}>
                  <option value="">Select analyte…</option>
                  {analytes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Instrument</label>
                <input type="text" value={instrument} onChange={e => setInstrument(e.target.value)} className={inputCls} placeholder="Analyzer model" />
              </div>
              <div>
                <label className={labelCls}>Current Lot Number</label>
                <input type="text" value={currentLot} onChange={e => setCurrentLot(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>New Lot Number</label>
                <input type="text" value={newLot} onChange={e => setNewLot(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>TEa Limit (%)</label>
                <input type="number" value={tea} onChange={e => setTea(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Rejection Limit (% — default TEa/2)</label>
                <input type="number" value={rejLimit} onChange={e => setRejLimit(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Operator</label>
                <input type="text" value={operator} onChange={e => setOperator(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Protocol Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} rows={2} />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Data Entry */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Data Entry <span className="text-xs text-gray-500 font-normal ml-2">Minimum 20 samples</span></h2>
              <button onClick={addRow} className="text-xs text-brand-400 hover:text-brand-300 border border-brand-700 rounded px-2 py-1">+ Add Row</button>
            </div>
            <div className="overflow-auto max-h-96 border border-gray-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900">
                  <tr className="border-b border-gray-700 text-gray-400 text-xs">
                    <th className="text-left px-3 py-2 w-24">Sample ID</th>
                    <th className="text-left px-3 py-2">Current Lot</th>
                    <th className="text-left px-3 py-2">New Lot</th>
                    <th className="text-left px-3 py-2">% Diff</th>
                    <th className="text-center px-3 py-2">Pass</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.map((s, i) => {
                    const d = (s.current !== '' && s.newLot !== '') ? pctDiff(parseFloat(s.current), parseFloat(s.newLot)) : null
                    const pass = d !== null && Math.abs(d) <= rej
                    return (
                      <tr key={i} className="border-b border-gray-800/50">
                        <td className="px-2 py-1.5">
                          <input type="text" value={s.label} onChange={e => updateSample(i, 'label', e.target.value)}
                            className="bg-transparent text-gray-400 text-xs w-full focus:outline-none" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" value={s.current} onChange={e => updateSample(i, 'current', e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" value={s.newLot} onChange={e => updateSample(i, 'newLot', e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full" />
                        </td>
                        <td className={`px-3 py-1.5 text-xs font-mono ${d !== null ? (pass ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                          {d !== null ? `${d > 0 ? '+' : ''}${d.toFixed(2)}%` : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {d !== null && <span className={`text-xs font-bold ${pass ? 'text-green-400' : 'text-red-400'}`}>{pass ? '✓' : '✗'}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">Entered: {samples.filter(s => s.current !== '' && s.newLot !== '').length} / {samples.length} rows · Rejection limit: ±{rej}%</p>
          </div>
        )}

        {/* Step 3: Statistics */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Statistical Results</h2>
            {!stats ? (
              <p className="text-gray-500 text-sm">Not enough data. Go back and enter at least 2 sample pairs.</p>
            ) : (
              <>
                <div className={`rounded-xl p-4 border text-center ${stats.passed ? 'bg-green-900/20 border-green-700' : 'bg-red-900/20 border-red-700'}`}>
                  <span className={`text-lg font-bold ${stats.passed ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.passed ? '✓ ACCEPTABLE' : '✗ NOT ACCEPTABLE'}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">{stats.nExceeding}/{stats.n} samples exceed ±{rej}% rejection limit</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'N Samples', value: stats.n },
                    { label: 'Mean % Bias', value: `${stats.biasPct.toFixed(2)}%` },
                    { label: 'SD of Diffs', value: `${stats.sdDiff.toFixed(3)}` },
                    { label: 'Samples Exceeding', value: stats.nExceeding },
                    { label: 'Mean (Current)', value: stats.meanA.toFixed(3) },
                    { label: 'CV% (Current)', value: `${stats.cvA.toFixed(2)}%` },
                    { label: 'Mean (New)', value: stats.meanB.toFixed(3) },
                    { label: 'CV% (New)', value: `${stats.cvB.toFixed(2)}%` },
                    { label: 'Pearson r', value: stats.r.toFixed(4) },
                    { label: 'r²', value: stats.r2.toFixed(4) },
                    { label: 'TEa Limit', value: `${tea}%` },
                    { label: 'Rejection Limit', value: `±${rej}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-800 rounded-lg p-3">
                      <div className="text-xs text-gray-400">{label}</div>
                      <div className="text-sm font-semibold text-white mt-1">{value}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Graphs */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="font-semibold text-white">Graphs</h2>
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">% Difference Plot</h3>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={diffChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="sample" tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: 'Sample', position: 'insideBottom', offset: -2, fill: '#6b7280', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: '% Diff', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [`${v}%`, '% Diff']} contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                  <ReferenceLine y={0} stroke="#4b5563" />
                  <ReferenceLine y={rej} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `+${rej}%`, fill: '#ef4444', fontSize: 10 }} />
                  <ReferenceLine y={-rej} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `-${rej}%`, fill: '#ef4444', fontSize: 10 }} />
                  <Scatter dataKey="diff" fill="#60a5fa" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">Correlation (Current vs New Lot)</h3>
              {scatterData.length > 1 && stats && (
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="x" type="number" name="Current" domain={['auto', 'auto']} tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: 'Current Lot', position: 'insideBottom', offset: -2, fill: '#6b7280', fontSize: 11 }} />
                    <YAxis dataKey="y" type="number" name="New" domain={['auto', 'auto']} tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: 'New Lot', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                    <Scatter data={scatterData} fill="#60a5fa" opacity={0.8} />
                    <Line data={regLine} dataKey="y" stroke="#f59e0b" dot={false} type="linear" legendType="none" />
                    <Line data={identityLine} dataKey="y" stroke="#6b7280" dot={false} type="linear" strokeDasharray="5 5" legendType="none" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              {stats && <p className="text-xs text-gray-500 mt-2">r² = {stats.r2.toFixed(4)} · Slope = {stats.slope.toFixed(4)} · Intercept = {stats.intercept.toFixed(4)}</p>}
            </div>
          </div>
        )}

        {/* Step 5: Conclusion */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Conclusion & Approval</h2>
            {stats && (
              <div className={`rounded-lg p-4 border text-sm ${stats.passed ? 'bg-green-900/20 border-green-700 text-green-300' : 'bg-red-900/20 border-red-700 text-red-300'}`}>
                <strong>Auto-generated:</strong> New reagent lot <em>{newLot}</em> showed a mean bias of {stats.biasPct.toFixed(2)}% (±{stats.sdDiff.toFixed(2)}) against the current lot.
                {' '}{stats.nExceeding}/{stats.n} samples exceeded the rejection limit of ±{rej}%.
                {' '}The new lot is <strong>{stats.passed ? 'ACCEPTABLE' : 'NOT ACCEPTABLE'}</strong> for clinical use.
              </div>
            )}
            <div>
              <label className={labelCls}>Conclusion (editable)</label>
              <textarea value={conclusion} onChange={e => setConclusion(e.target.value)} className={inputCls} rows={5} />
            </div>
            <button
              onClick={complete}
              disabled={saving}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Complete & Save Study'}
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-4 border-t border-gray-800">
          <button
            onClick={() => step === 0 ? navigate('/validation') : setStep(s => s - 1)}
            className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            {step === 0 ? 'Cancel' : '← Back'}
          </button>
          {step < 4 && (
            <button
              onClick={saveAndNext}
              disabled={saving || (step === 0 && !title)}
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save & Continue →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
