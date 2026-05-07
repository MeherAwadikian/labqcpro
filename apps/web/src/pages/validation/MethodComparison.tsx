import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { computeStats, blandAltman, pctDiff, pearsonR, mean, sd } from '../../lib/stats'
import {
  ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar,
} from 'recharts'

type Analyte = { id: string; name: string; unit: string; tea: number | null }
type Row = { label: string; a: string; b: string }

const STEPS = ['Setup', 'Data Entry', 'Statistics', 'Graphs', 'Clinical Assessment', 'Report']
const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'
const labelCls = 'text-xs text-gray-400 mb-1 block'

function StepBar({ step, total, labels }: { step: number; total: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-1 flex-1 min-w-0">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
            i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-500'
          }`}>{i + 1}</div>
          <span className={`text-xs hidden sm:block truncate ${i === step ? 'text-white font-medium' : 'text-gray-500'}`}>{l}</span>
          {i < total - 1 && <div className={`h-0.5 flex-1 mx-1 shrink-0 ${i < step ? 'bg-brand-600' : 'bg-gray-800'}`} />}
        </div>
      ))}
    </div>
  )
}

export default function MethodComparison() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const studyId = params.get('id')

  const [step, setStep] = useState(0)
  const [analytes, setAnalytes] = useState<Analyte[]>([])
  const [saving, setSaving] = useState(false)
  const [activeChart, setActiveChart] = useState<'correlation' | 'bland-altman' | 'pct-diff'>('correlation')
  const [currentStudyId, setCurrentStudyId] = useState<string | null>(studyId)

  // Setup
  const [title, setTitle]         = useState('')
  const [analyteId, setAnalyteId] = useState('')
  const [methodA, setMethodA]     = useState('')
  const [methodB, setMethodB]     = useState('')
  const [sampleType, setSampleType] = useState('serum')
  const [tea, setTea]             = useState('10')
  // Clinical
  const [decisionLevel, setDecisionLevel]   = useState('')
  const [clinicalSig, setClinicalSig]       = useState('')
  const [corrective, setCorrective]         = useState('')
  const [recommendation, setRecommendation] = useState('accept')
  const [conclusion, setConclusion]         = useState('')

  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: 40 }, (_, i) => ({ label: `S${String(i + 1).padStart(2, '0')}`, a: '', b: '' }))
  )

  useEffect(() => { api.get<Analyte[]>('/analytes').then(setAnalytes) }, [])

  useEffect(() => {
    const an = analytes.find(a => a.id === analyteId)
    if (an && !studyId) {
      const d = new Date().toISOString().split('T')[0]
      setTitle(`Method Comparison — ${an.name} — ${d}`)
      if (an.tea) setTea(String(an.tea))
    }
  }, [analyteId, analytes, studyId])

  useEffect(() => {
    if (!studyId) return
    api.get<any>(`/validation/${studyId}`).then(data => {
      setTitle(data.title ?? ''); setAnalyteId(data.analyte_id ?? ''); setConclusion(data.conclusion ?? '')
      const meta = data.metadata ? JSON.parse(data.metadata) : {}
      setMethodA(meta.methodA ?? ''); setMethodB(meta.methodB ?? ''); setSampleType(meta.sampleType ?? 'serum')
      setTea(String(meta.tea ?? 10))
      setDecisionLevel(meta.decisionLevel ?? ''); setClinicalSig(meta.clinicalSig ?? '')
      setCorrective(meta.corrective ?? ''); setRecommendation(meta.recommendation ?? 'accept')
      if (data.samples?.length) {
        setRows(data.samples.map((s: any) => ({
          label: s.sample_id_label, a: s.method_a_value ?? '', b: s.method_b_value ?? '',
        })))
      }
    })
  }, [studyId])

  function updateRow(i: number, field: keyof Row, v: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: v } : r))
  }

  function addRow() {
    setRows(prev => [...prev, { label: `S${String(prev.length + 1).padStart(2, '0')}`, a: '', b: '' }])
  }

  // Valid pairs
  const pairs = useMemo(() =>
    rows.filter(r => r.a !== '' && r.b !== '')
      .map(r => ({ a: parseFloat(r.a), b: parseFloat(r.b) }))
      .filter(p => isFinite(p.a) && isFinite(p.b)),
    [rows]
  )

  const stats = useMemo(() => pairs.length >= 2 ? computeStats(pairs, parseFloat(tea) || 10) : null, [pairs, tea])

  const baData = useMemo(() => {
    if (pairs.length < 2) return { points: [], meanDiff: 0, sdDiff: 0, loaUpper: 0, loaLower: 0 }
    return blandAltman(pairs.map(p => p.a), pairs.map(p => p.b))
  }, [pairs])

  const scatterData = useMemo(() => pairs.map(p => ({ x: p.a, y: p.b })), [pairs])

  const regLine = useMemo(() => {
    if (!stats || scatterData.length < 2) return []
    const xs = scatterData.map(p => p.x)
    const mn = Math.min(...xs), mx = Math.max(...xs)
    return [{ x: mn, y: stats.slope * mn + stats.intercept }, { x: mx, y: stats.slope * mx + stats.intercept }]
  }, [stats, scatterData])

  const identityLine = useMemo(() => {
    if (scatterData.length < 2) return []
    const xs = scatterData.map(p => p.x)
    const mn = Math.min(...xs), mx = Math.max(...xs)
    return [{ x: mn, y: mn }, { x: mx, y: mx }]
  }, [scatterData])

  const pctDiffData = useMemo(() =>
    pairs.map(p => ({ avg: +((p.a + p.b) / 2).toFixed(3), pct: +pctDiff(p.a, p.b).toFixed(3) })),
    [pairs]
  )

  async function saveAndNext() {
    setSaving(true)
    try {
      const meta = { methodA, methodB, sampleType, tea: parseFloat(tea), decisionLevel, clinicalSig, corrective, recommendation }
      let id = currentStudyId
      if (!id) {
        const res = await api.post<{ id: string }>('/validation', {
          study_type: 'method_comparison', title, analyte_id: analyteId || undefined, metadata: meta,
        })
        id = res.id; setCurrentStudyId(id)
        navigate(`/validation/method-comparison?id=${id}`, { replace: true })
      } else {
        await api.put(`/validation/${id}`, { title, analyte_id: analyteId || undefined, metadata: meta })
      }
      if (step >= 1) {
        await api.put(`/validation/${id}/samples`, {
          samples: rows.map((r, i) => ({
            sample_id_label: r.label,
            method_a_value: r.a !== '' ? parseFloat(r.a) : null,
            method_b_value: r.b !== '' ? parseFloat(r.b) : null,
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

  const teaNum = parseFloat(tea) || 10

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/validation')} className="text-gray-500 hover:text-gray-300 text-sm">← Validation</button>
        <span className="text-gray-700">/</span>
        <span className="text-gray-300 text-sm font-medium">Method Comparison Study</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <StepBar step={step} total={STEPS.length} labels={STEPS} />

        {/* Step 1: Setup */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Study Setup <span className="text-xs text-gray-500 font-normal ml-2">CLSI EP9</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelCls}>Study Title</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Analyte</label>
                <select value={analyteId} onChange={e => setAnalyteId(e.target.value)} className={inputCls}>
                  <option value="">Select analyte…</option>
                  {analytes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Sample Type</label>
                <select value={sampleType} onChange={e => setSampleType(e.target.value)} className={inputCls}>
                  {['serum', 'plasma', 'whole blood', 'urine', 'CSF'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Method A — Reference / Comparator</label>
                <input type="text" value={methodA} onChange={e => setMethodA(e.target.value)} className={inputCls} placeholder="e.g. Roche Cobas 8000" />
              </div>
              <div>
                <label className={labelCls}>Method B — Test Method</label>
                <input type="text" value={methodB} onChange={e => setMethodB(e.target.value)} className={inputCls} placeholder="e.g. Abbott Architect" />
              </div>
              <div>
                <label className={labelCls}>TEa Limit (%)</label>
                <input type="number" value={tea} onChange={e => setTea(e.target.value)} className={inputCls} />
              </div>
            </div>
            <p className="text-xs text-gray-500">CLSI EP9 requires a minimum of 40 samples spanning the full AMR. 100 samples recommended.</p>
          </div>
        )}

        {/* Step 2: Data Entry */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Data Entry
                <span className="text-xs text-gray-500 font-normal ml-2">
                  {pairs.length} valid pairs (min 40)
                  {pairs.length < 40 && <span className="text-yellow-500"> — need {40 - pairs.length} more</span>}
                </span>
              </h2>
              <button onClick={addRow} className="text-xs text-brand-400 hover:text-brand-300 border border-brand-700 rounded px-2 py-1">+ Row</button>
            </div>
            <div className="overflow-auto max-h-96 border border-gray-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900">
                  <tr className="border-b border-gray-700 text-gray-400 text-xs">
                    <th className="text-left px-3 py-2 w-20">Sample</th>
                    <th className="text-left px-3 py-2">{methodA || 'Method A'}</th>
                    <th className="text-left px-3 py-2">{methodB || 'Method B'}</th>
                    <th className="text-left px-3 py-2">Diff</th>
                    <th className="text-left px-3 py-2">% Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const aNum = parseFloat(r.a), bNum = parseFloat(r.b)
                    const d = (r.a !== '' && r.b !== '' && isFinite(aNum) && isFinite(bNum)) ? bNum - aNum : null
                    const pd = d !== null && aNum !== 0 ? pctDiff(aNum, bNum) : null
                    const outlier = pd !== null && Math.abs(pd) > teaNum * 2
                    return (
                      <tr key={i} className={`border-b border-gray-800/50 ${outlier ? 'bg-yellow-900/10' : ''}`}>
                        <td className="px-2 py-1.5">
                          <input type="text" value={r.label} onChange={e => updateRow(i, 'label', e.target.value)}
                            className="bg-transparent text-gray-400 text-xs w-full focus:outline-none" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" value={r.a} onChange={e => updateRow(i, 'a', e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" value={r.b} onChange={e => updateRow(i, 'b', e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full" />
                        </td>
                        <td className="px-3 py-1.5 text-xs text-gray-400">{d !== null ? d.toFixed(3) : '—'}</td>
                        <td className={`px-3 py-1.5 text-xs font-mono ${outlier ? 'text-yellow-400' : pd !== null ? 'text-gray-400' : 'text-gray-600'}`}>
                          {pd !== null ? `${pd > 0 ? '+' : ''}${pd.toFixed(2)}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">Yellow rows = potential outliers (&gt;2×TEa)</p>
          </div>
        )}

        {/* Step 3: Statistics */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Statistical Analysis</h2>
            {!stats ? (
              <p className="text-gray-500 text-sm">Enter at least 2 sample pairs.</p>
            ) : (
              <>
                <div className={`rounded-xl p-4 border text-center ${stats.passed ? 'bg-green-900/20 border-green-700' : 'bg-red-900/20 border-red-700'}`}>
                  <span className={`text-lg font-bold ${stats.passed ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.passed ? '✓ METHODS EQUIVALENT' : '✗ SIGNIFICANT BIAS DETECTED'}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: 'N', value: stats.n },
                    { label: `Mean — ${methodA || 'A'}`, value: stats.meanA.toFixed(3) },
                    { label: `Mean — ${methodB || 'B'}`, value: stats.meanB.toFixed(3) },
                    { label: 'Mean Difference', value: stats.meanDiff.toFixed(3) },
                    { label: 'SD of Differences', value: stats.sdDiff.toFixed(3) },
                    { label: 'Bias %', value: `${stats.biasPct > 0 ? '+' : ''}${stats.biasPct.toFixed(2)}%` },
                    { label: 'Pearson r', value: stats.r.toFixed(4) },
                    { label: 'r²', value: stats.r2.toFixed(4) },
                    { label: 'PB Slope', value: `${stats.slope.toFixed(4)} [${stats.slopeCILow.toFixed(3)}, ${stats.slopeCIHigh.toFixed(3)}]` },
                    { label: 'PB Intercept', value: stats.intercept.toFixed(4) },
                    { label: '+LoA (Bland-Altman)', value: stats.loaUpper.toFixed(3) },
                    { label: '−LoA (Bland-Altman)', value: stats.loaLower.toFixed(3) },
                    { label: 'TEa', value: `${teaNum}%` },
                    { label: '% Exceeding TEa', value: `${stats.nExceeding}/${stats.n}` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-800 rounded-lg p-3">
                      <div className="text-xs text-gray-400">{label}</div>
                      <div className="text-sm font-semibold text-white mt-1 break-all">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className={`rounded-lg p-2 border ${stats.slopeCILow <= 1 && stats.slopeCIHigh >= 1 ? 'border-green-700 text-green-400' : 'border-red-700 text-red-400'}`}>
                    Slope CI includes 1: {stats.slopeCILow <= 1 && stats.slopeCIHigh >= 1 ? '✓ Yes' : '✗ No — proportional bias'}
                  </div>
                  <div className={`rounded-lg p-2 border ${stats.r >= 0.975 ? 'border-green-700 text-green-400' : 'border-yellow-700 text-yellow-400'}`}>
                    r ≥ 0.975: {stats.r >= 0.975 ? '✓ Yes' : `✗ No (r = ${stats.r.toFixed(4)})`}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Graphs */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Graphs</h2>
            <div className="flex gap-2">
              {([['correlation', 'Correlation (PB)'], ['bland-altman', 'Bland-Altman'], ['pct-diff', '% Difference']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setActiveChart(k)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${activeChart === k ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {l}
                </button>
              ))}
            </div>

            {activeChart === 'correlation' && stats && scatterData.length > 1 && (
              <div>
                <h3 className="text-xs text-gray-400 mb-2">Passing-Bablok Regression · Slope {stats.slope.toFixed(4)} [{stats.slopeCILow.toFixed(3)}, {stats.slopeCIHigh.toFixed(3)}] · r² {stats.r2.toFixed(4)}</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="x" type="number" name={methodA || 'Method A'} domain={['auto', 'auto']} tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: methodA || 'Method A', position: 'insideBottom', offset: -2, fill: '#6b7280', fontSize: 11 }} />
                    <YAxis dataKey="y" type="number" name={methodB || 'Method B'} domain={['auto', 'auto']} tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: methodB || 'Method B', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                    <Scatter data={scatterData} fill="#60a5fa" opacity={0.7} />
                    <Line data={regLine} dataKey="y" stroke="#f59e0b" dot={false} type="linear" legendType="none" strokeWidth={2} />
                    <Line data={identityLine} dataKey="y" stroke="#6b7280" dot={false} type="linear" strokeDasharray="5 5" legendType="none" />
                  </ComposedChart>
                </ResponsiveContainer>
                <p className="text-xs text-gray-500 mt-1">Yellow = Passing-Bablok regression · Gray dashed = identity (y=x)</p>
              </div>
            )}

            {activeChart === 'bland-altman' && (
              <div>
                <h3 className="text-xs text-gray-400 mb-2">
                  Bias {baData.meanDiff.toFixed(3)} · +LoA {baData.loaUpper.toFixed(3)} · −LoA {baData.loaLower.toFixed(3)}
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="avg" type="number" name="Average" domain={['auto', 'auto']} tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: 'Average', position: 'insideBottom', offset: -2, fill: '#6b7280', fontSize: 11 }} />
                    <YAxis dataKey="diff" type="number" name="Difference" tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: 'Diff (B−A)', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                    <Scatter data={baData.points} fill="#60a5fa" opacity={0.7} />
                    <ReferenceLine y={baData.meanDiff} stroke="#3b82f6" strokeWidth={2} label={{ value: `Bias ${baData.meanDiff.toFixed(3)}`, fill: '#60a5fa', fontSize: 10 }} />
                    <ReferenceLine y={baData.loaUpper} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `+LoA ${baData.loaUpper.toFixed(3)}`, fill: '#ef4444', fontSize: 10 }} />
                    <ReferenceLine y={baData.loaLower} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `-LoA ${baData.loaLower.toFixed(3)}`, fill: '#ef4444', fontSize: 10 }} />
                    <ReferenceLine y={0} stroke="#4b5563" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {activeChart === 'pct-diff' && (
              <div>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={pctDiffData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="avg" type="number" name="Average" tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: 'Average', position: 'insideBottom', offset: -2, fill: '#6b7280', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: '% Diff', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} />
                    <ReferenceLine y={teaNum} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `+TEa ${teaNum}%`, fill: '#ef4444', fontSize: 10 }} />
                    <ReferenceLine y={-teaNum} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `-TEa ${teaNum}%`, fill: '#ef4444', fontSize: 10 }} />
                    <ReferenceLine y={0} stroke="#4b5563" />
                    <Scatter dataKey="pct" fill="#a78bfa" opacity={0.7} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Clinical Assessment */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Clinical Significance Assessment</h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className={labelCls}>Medical Decision Level</label>
                <input type="text" value={decisionLevel} onChange={e => setDecisionLevel(e.target.value)} className={inputCls}
                  placeholder="e.g. Glucose 126 mg/dL (diabetes threshold)" />
              </div>
              {decisionLevel && stats && (
                <div className="bg-gray-800 rounded-lg p-3 text-sm">
                  <span className="text-gray-400">At this decision level, bias of <span className="text-white font-bold">{stats.biasPct.toFixed(2)}%</span> may affect clinical interpretation.</span>
                </div>
              )}
              <div>
                <label className={labelCls}>Clinically Significant?</label>
                <div className="flex gap-4">
                  {['yes', 'no', 'borderline'].map(v => (
                    <label key={v} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                      <input type="radio" name="clinSig" value={v} checked={clinicalSig === v} onChange={() => setClinicalSig(v)} className="accent-brand-500" />
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Corrective Action (if significant)</label>
                <textarea value={corrective} onChange={e => setCorrective(e.target.value)} className={inputCls} rows={2} />
              </div>
              <div>
                <label className={labelCls}>Recommendation</label>
                <select value={recommendation} onChange={e => setRecommendation(e.target.value)} className={inputCls}>
                  <option value="accept">Accept Method B</option>
                  <option value="reject">Reject Method B</option>
                  <option value="correction_factor">Accept with Correction Factor</option>
                  <option value="revalidate">Revalidate with More Samples</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Report */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Report & Approval</h2>
            {stats && (
              <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-300 space-y-2">
                <p><strong>Auto-summary:</strong> A method comparison study (CLSI EP9) was performed between {methodA || 'Method A'} and {methodB || 'Method B'} for {analytes.find(a => a.id === analyteId)?.name ?? 'the analyte'} using {stats.n} patient samples.</p>
                <p>Passing-Bablok regression: slope = {stats.slope.toFixed(4)} [{stats.slopeCILow.toFixed(3)}, {stats.slopeCIHigh.toFixed(3)}], intercept = {stats.intercept.toFixed(4)}. Pearson r = {stats.r.toFixed(4)}.</p>
                <p>Bland-Altman: mean bias = {stats.meanDiff.toFixed(3)} ({stats.biasPct.toFixed(2)}%), limits of agreement [{stats.loaLower.toFixed(3)}, {stats.loaUpper.toFixed(3)}].</p>
                <p>Overall: <strong>{stats.passed ? 'EQUIVALENT — Methods can be used interchangeably' : 'NOT EQUIVALENT — Clinical review required'}</strong></p>
              </div>
            )}
            <div>
              <label className={labelCls}>Conclusion (editable)</label>
              <textarea value={conclusion} onChange={e => setConclusion(e.target.value)} className={inputCls} rows={5} />
            </div>
            <button onClick={complete} disabled={saving}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Complete & Save Study'}
            </button>
          </div>
        )}

        <div className="flex justify-between mt-6 pt-4 border-t border-gray-800">
          <button onClick={() => step === 0 ? navigate('/validation') : setStep(s => s - 1)}
            className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
            {step === 0 ? 'Cancel' : '← Back'}
          </button>
          {step < 5 && (
            <button onClick={saveAndNext} disabled={saving || (step === 0 && !title)}
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Save & Continue →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
