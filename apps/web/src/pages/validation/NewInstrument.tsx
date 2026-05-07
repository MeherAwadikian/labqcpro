import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { mean, sd, cv, computeStats, blandAltman, pctDiff, linearRegression } from '../../lib/stats'
import {
  ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar,
} from 'recharts'

type Analyte = { id: string; name: string; unit: string; tea: number | null }

const STEPS = ['Setup', 'Precision', 'Accuracy', 'Linearity', 'Method Comparison', 'Scorecard']
const LEVELS = ['QC Level 1', 'QC Level 2', 'QC Level 3']
const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'
const labelCls = 'text-xs text-gray-400 mb-1 block'

type PrecRep = string   // 5 days × 5 reps × 3 levels
type AccRow  = { name: string; assigned: string; obtained: string }
type LinRow  = { expected: string; obs1: string; obs2: string }
type CmpRow  = { label: string; newInst: string; current: string }

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

function makePrecGrid() {
  // [level][day][rep] = ''
  return Array.from({ length: 3 }, () =>
    Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => '')
    )
  )
}

export default function NewInstrument() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const studyId = params.get('id')

  const [step, setStep] = useState(0)
  const [analytes, setAnalytes] = useState<Analyte[]>([])
  const [saving, setSaving] = useState(false)
  const [currentStudyId, setCurrentStudyId] = useState<string | null>(studyId)
  const [activeLevel, setActiveLevel] = useState(0)
  const [cmpChart, setCmpChart] = useState<'correlation' | 'bland-altman' | 'pct-diff'>('correlation')

  // Setup
  const [title, setTitle]           = useState('')
  const [analyteId, setAnalyteId]   = useState('')
  const [instName, setInstName]     = useState('')
  const [model, setModel]           = useState('')
  const [serial, setSerial]         = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [compMethod, setCompMethod] = useState('')
  const [operator, setOperator]     = useState('')
  const [tea, setTea]               = useState('10')
  const [mfrCv, setMfrCv]           = useState('')
  const [conclusion, setConclusion] = useState('')

  // Precision: [level][day][rep]
  const [precGrid, setPrecGrid] = useState<string[][][]>(makePrecGrid)

  // Accuracy
  const [accRows, setAccRows] = useState<AccRow[]>([
    { name: 'Reference Material 1', assigned: '', obtained: '' },
    { name: 'Reference Material 2', assigned: '', obtained: '' },
    { name: 'Reference Material 3', assigned: '', obtained: '' },
  ])

  // Linearity
  const [linRows, setLinRows] = useState<LinRow[]>(
    Array.from({ length: 5 }, () => ({ expected: '', obs1: '', obs2: '' }))
  )

  // Method comparison
  const [cmpRows, setCmpRows] = useState<CmpRow[]>(
    Array.from({ length: 40 }, (_, i) => ({ label: `S${String(i + 1).padStart(2, '0')}`, newInst: '', current: '' }))
  )

  useEffect(() => { api.get<Analyte[]>('/analytes').then(setAnalytes) }, [])

  useEffect(() => {
    const a = analytes.find(a => a.id === analyteId)
    if (a && !studyId) {
      const d = new Date().toISOString().split('T')[0]
      setTitle(`New Instrument Validation — ${instName || a.name} — ${d}`)
      if (a.tea) setTea(String(a.tea))
    }
  }, [analyteId, analytes, instName, studyId])

  // Precision calculations
  const precStats = useMemo(() => LEVELS.map((_, li) => {
    const allVals = precGrid[li].flatMap(day => day.map(v => parseFloat(v)).filter(isFinite))
    const dayMeans = precGrid[li].map(day => {
      const vs = day.map(v => parseFloat(v)).filter(isFinite)
      return vs.length ? mean(vs) : null
    }).filter((m): m is number => m !== null)
    const withinRunSD = sd(allVals)
    const betweenRunSD = dayMeans.length > 1 ? sd(dayMeans) : 0
    const totalCV = mean(allVals) !== 0 ? (withinRunSD / Math.abs(mean(allVals))) * 100 : 0
    const mfrCvNum = parseFloat(mfrCv)
    return {
      n: allVals.length, mean: mean(allVals), withinRunSD, betweenRunSD, totalCV,
      pass: isFinite(mfrCvNum) ? totalCV <= mfrCvNum * 1.5 : null,
    }
  }), [precGrid, mfrCv])

  // Accuracy
  const accStats = useMemo(() => accRows.map(r => {
    const a = parseFloat(r.assigned), o = parseFloat(r.obtained)
    if (!isFinite(a) || !isFinite(o)) return { bias: null, pass: null }
    const bias = pctDiff(a, o)
    return { bias, pass: Math.abs(bias) <= parseFloat(tea) / 2 }
  }), [accRows, tea])

  // Linearity
  const linStats = useMemo(() => {
    const points = linRows.map(r => {
      const exp = parseFloat(r.expected)
      const o1  = parseFloat(r.obs1), o2 = parseFloat(r.obs2)
      const obs = isFinite(o2) ? (o1 + o2) / 2 : o1
      return { exp, obs }
    }).filter(p => isFinite(p.exp) && isFinite(p.obs))
    if (points.length < 2) return { r2: 0, points: [], pass: false }
    const lr = linearRegression(points.map(p => p.exp), points.map(p => p.obs))
    const withDev = points.map(p => ({
      expected: p.exp, observed: +p.obs.toFixed(3),
      deviation: +pctDiff(p.exp, p.obs).toFixed(2),
      within: Math.abs(pctDiff(p.exp, p.obs)) <= 10,
    }))
    return { r2: lr.r2, points: withDev, pass: lr.r2 >= 0.99 && withDev.every(p => p.within) }
  }, [linRows])

  // Method comparison
  const cmpPairs = useMemo(() =>
    cmpRows.filter(r => r.newInst !== '' && r.current !== '')
      .map(r => ({ a: parseFloat(r.current), b: parseFloat(r.newInst) }))
      .filter(p => isFinite(p.a) && isFinite(p.b)),
    [cmpRows]
  )
  const cmpStats = useMemo(() => cmpPairs.length >= 2 ? computeStats(cmpPairs, parseFloat(tea) || 10) : null, [cmpPairs, tea])
  const baData   = useMemo(() => {
    if (cmpPairs.length < 2) return { points: [], meanDiff: 0, loaUpper: 0, loaLower: 0 }
    return blandAltman(cmpPairs.map(p => p.a), cmpPairs.map(p => p.b))
  }, [cmpPairs])

  const scatterData = useMemo(() => cmpPairs.map(p => ({ x: p.a, y: p.b })), [cmpPairs])
  const regLine = useMemo(() => {
    if (!cmpStats || scatterData.length < 2) return []
    const xs = scatterData.map(p => p.x), mn = Math.min(...xs), mx = Math.max(...xs)
    return [{ x: mn, y: cmpStats.slope * mn + cmpStats.intercept }, { x: mx, y: cmpStats.slope * mx + cmpStats.intercept }]
  }, [cmpStats, scatterData])
  const identityLine = useMemo(() => {
    if (scatterData.length < 2) return []
    const xs = scatterData.map(p => p.x)
    const mn = Math.min(...xs), mx = Math.max(...xs)
    return [{ x: mn, y: mn }, { x: mx, y: mx }]
  }, [scatterData])

  function updatePrec(li: number, di: number, ri: number, v: string) {
    setPrecGrid(prev => {
      const next = prev.map(l => l.map(d => [...d]))
      next[li][di][ri] = v
      return next
    })
  }

  function updateAcc(i: number, field: keyof AccRow, v: string) {
    setAccRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: v } : r))
  }

  function updateLin(i: number, field: keyof LinRow, v: string) {
    setLinRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: v } : r))
  }

  function updateCmp(i: number, field: keyof CmpRow, v: string) {
    setCmpRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: v } : r))
  }

  const teaNum = parseFloat(tea) || 10

  async function saveAndNext() {
    setSaving(true)
    try {
      const meta = { instName, model, serial, manufacturer, compMethod, operator, tea: teaNum, mfrCv }
      let id = currentStudyId
      if (!id) {
        const res = await api.post<{ id: string }>('/validation', {
          study_type: 'new_instrument', title, analyte_id: analyteId || undefined, metadata: meta,
        })
        id = res.id; setCurrentStudyId(id)
        navigate(`/validation/new-instrument?id=${id}`, { replace: true })
      } else {
        await api.put(`/validation/${id}`, { title, analyte_id: analyteId || undefined, metadata: meta })
      }
      setStep(s => s + 1)
    } finally { setSaving(false) }
  }

  async function complete() {
    if (!currentStudyId) return
    setSaving(true)
    try {
      if (cmpPairs.length >= 2) await api.post(`/validation/${currentStudyId}/calculate`, {})
      await api.put(`/validation/${currentStudyId}`, { conclusion, status: 'complete' })
      navigate('/validation')
    } finally { setSaving(false) }
  }

  // Scorecard
  const precPass = precStats.every(s => s.pass !== false)
  const accPass  = accStats.every(s => s.pass !== false)
  const linPass  = linStats.pass
  const cmpPass  = cmpStats?.passed ?? false
  const allPass  = precPass && accPass && linPass && cmpPass

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/validation')} className="text-gray-500 hover:text-gray-300 text-sm">← Validation</button>
        <span className="text-gray-700">/</span>
        <span className="text-gray-300 text-sm font-medium">New Instrument Validation</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <StepBar step={step} total={STEPS.length} labels={STEPS} />

        {/* Step 1: Setup */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Instrument Setup <span className="text-xs text-gray-500 font-normal ml-2">CLSI EP15-A3 + CAP</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelCls}>Study Title</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Analyte Being Validated</label>
                <select value={analyteId} onChange={e => setAnalyteId(e.target.value)} className={inputCls}>
                  <option value="">Select analyte…</option>
                  {analytes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>TEa Limit (%)</label>
                <input type="number" value={tea} onChange={e => setTea(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Instrument Name</label>
                <input type="text" value={instName} onChange={e => setInstName(e.target.value)} className={inputCls} placeholder="e.g. Roche Cobas Pro" />
              </div>
              <div>
                <label className={labelCls}>Model</label>
                <input type="text" value={model} onChange={e => setModel(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Serial Number</label>
                <input type="text" value={serial} onChange={e => setSerial(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Manufacturer</label>
                <input type="text" value={manufacturer} onChange={e => setManufacturer(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Comparison Method / Instrument</label>
                <input type="text" value={compMethod} onChange={e => setCompMethod(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Responsible Operator</label>
                <input type="text" value={operator} onChange={e => setOperator(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Manufacturer's Claimed CV% (from insert)</label>
                <input type="number" value={mfrCv} onChange={e => setMfrCv(e.target.value)} className={inputCls} placeholder="e.g. 3.5" />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Precision */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Phase 1 — Precision Study <span className="text-xs text-gray-500 font-normal ml-2">5 days × 5 replicates × 3 QC levels</span></h2>
            <div className="flex gap-2">
              {LEVELS.map((l, i) => (
                <button key={l} onClick={() => setActiveLevel(i)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${activeLevel === i ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-xs bg-gray-900">
                    <th className="text-left px-3 py-2">Day</th>
                    {[1, 2, 3, 4, 5].map(r => <th key={r} className="text-left px-3 py-2">Rep {r}</th>)}
                    <th className="text-left px-3 py-2">Day Mean</th>
                  </tr>
                </thead>
                <tbody>
                  {precGrid[activeLevel].map((day, di) => {
                    const dayVals = day.map(v => parseFloat(v)).filter(isFinite)
                    const dayMean = dayVals.length ? mean(dayVals) : null
                    return (
                      <tr key={di} className="border-b border-gray-800/50">
                        <td className="px-3 py-1.5 text-gray-500 text-xs">Day {di + 1}</td>
                        {day.map((v, ri) => (
                          <td key={ri} className="px-2 py-1.5">
                            <input type="number" value={v} onChange={e => updatePrec(activeLevel, di, ri, e.target.value)}
                              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full" />
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-xs text-gray-400">{dayMean !== null ? dayMean.toFixed(3) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'N', value: precStats[activeLevel].n },
                { label: 'Mean', value: precStats[activeLevel].mean.toFixed(3) },
                { label: 'Total CV%', value: `${precStats[activeLevel].totalCV.toFixed(2)}%` },
                { label: 'vs Mfr CV%', value: mfrCv ? `${(precStats[activeLevel].totalCV / parseFloat(mfrCv) * 100).toFixed(0)}% of ${mfrCv}%` : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-400">{label}</div>
                  <div className={`text-sm font-bold mt-1 ${label === 'vs Mfr CV%' && precStats[activeLevel].pass !== null ? (precStats[activeLevel].pass ? 'text-green-400' : 'text-red-400') : 'text-white'}`}>{value}</div>
                </div>
              ))}
            </div>
            {mfrCv && <p className="text-xs text-gray-500">Acceptance: Lab CV ≤ 1.5× manufacturer's claimed CV ({(parseFloat(mfrCv) * 1.5).toFixed(1)}%)</p>}
          </div>
        )}

        {/* Step 3: Accuracy */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Phase 2 — Accuracy Study <span className="text-xs text-gray-500 font-normal ml-2">Acceptance: |bias| ≤ TEa/2</span></h2>
            <div className="border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-xs bg-gray-900">
                    <th className="text-left px-3 py-2">Reference Material</th>
                    <th className="text-left px-3 py-2">Assigned Value</th>
                    <th className="text-left px-3 py-2">Obtained Value</th>
                    <th className="text-left px-3 py-2">% Bias</th>
                    <th className="text-center px-3 py-2">Pass</th>
                  </tr>
                </thead>
                <tbody>
                  {accRows.map((r, i) => {
                    const s = accStats[i]
                    return (
                      <tr key={i} className="border-b border-gray-800/50">
                        <td className="px-3 py-1.5">
                          <input type="text" value={r.name} onChange={e => updateAcc(i, 'name', e.target.value)}
                            className="bg-transparent text-gray-300 text-xs focus:outline-none w-full" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" value={r.assigned} onChange={e => updateAcc(i, 'assigned', e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" value={r.obtained} onChange={e => updateAcc(i, 'obtained', e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full" />
                        </td>
                        <td className={`px-3 py-1.5 text-xs ${s.bias !== null ? (s.pass ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                          {s.bias !== null ? `${s.bias > 0 ? '+' : ''}${s.bias.toFixed(2)}%` : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {s.pass !== null && <span className={`text-xs font-bold ${s.pass ? 'text-green-400' : 'text-red-400'}`}>{s.pass ? '✓' : '✗'}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">Acceptance limit: ±{(teaNum / 2).toFixed(1)}% (TEa/2 = {teaNum}/2)</p>
          </div>
        )}

        {/* Step 4: Linearity */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Phase 3 — Linearity / AMR Verification <span className="text-xs text-gray-500 font-normal ml-2">5 levels, r² ≥ 0.99</span></h2>
            <div className="border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-xs bg-gray-900">
                    <th className="px-3 py-2 text-left">Level</th>
                    <th className="px-3 py-2 text-left">Expected</th>
                    <th className="px-3 py-2 text-left">Replicate 1</th>
                    <th className="px-3 py-2 text-left">Replicate 2</th>
                    <th className="px-3 py-2 text-left">Mean</th>
                    <th className="px-3 py-2 text-left">% Dev</th>
                    <th className="px-3 py-2 text-center">Pass</th>
                  </tr>
                </thead>
                <tbody>
                  {linRows.map((r, i) => {
                    const exp = parseFloat(r.expected)
                    const o1  = parseFloat(r.obs1), o2 = parseFloat(r.obs2)
                    const obs = isFinite(o2) ? (o1 + o2) / 2 : o1
                    const dev = (isFinite(exp) && isFinite(obs)) ? pctDiff(exp, obs) : null
                    const pass = dev !== null && Math.abs(dev) <= 10
                    return (
                      <tr key={i} className="border-b border-gray-800/50">
                        <td className="px-3 py-1.5 text-gray-400 text-xs">Level {i + 1}</td>
                        {(['expected', 'obs1', 'obs2'] as const).map(f => (
                          <td key={f} className="px-2 py-1.5">
                            <input type="number" value={r[f]} onChange={e => updateLin(i, f, e.target.value)}
                              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full" />
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-xs text-gray-400">{isFinite(obs) ? obs.toFixed(3) : '—'}</td>
                        <td className={`px-3 py-1.5 text-xs ${dev !== null ? (pass ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                          {dev !== null ? `${dev > 0 ? '+' : ''}${dev.toFixed(2)}%` : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {dev !== null && <span className={`text-xs font-bold ${pass ? 'text-green-400' : 'text-red-400'}`}>{pass ? '✓' : '✗'}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className={`rounded-lg p-3 text-sm ${linStats.pass ? 'bg-green-900/20 border border-green-700 text-green-400' : 'bg-gray-800 border border-gray-700 text-gray-400'}`}>
              r² = <strong>{linStats.r2.toFixed(4)}</strong>  {linStats.r2 >= 0.99 ? '✓ ≥ 0.99 — acceptable' : '✗ < 0.99 — linearity fails'}
            </div>
          </div>
        )}

        {/* Step 5: Method Comparison */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Phase 4 — Method Comparison <span className="text-xs text-gray-500 font-normal ml-2">vs {compMethod || 'current method'}</span></h2>
            <div className="flex gap-2">
              {([['correlation', 'Correlation'], ['bland-altman', 'Bland-Altman'], ['pct-diff', '% Diff']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setCmpChart(k)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${cmpChart === k ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {l}
                </button>
              ))}
            </div>

            {cmpChart === 'correlation' && cmpStats && scatterData.length > 1 && (
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="x" type="number" domain={['auto', 'auto']} tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: compMethod || 'Current', position: 'insideBottom', offset: -2, fill: '#6b7280', fontSize: 11 }} />
                  <YAxis dataKey="y" type="number" domain={['auto', 'auto']} tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: instName || 'New', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                  <Scatter data={scatterData} fill="#60a5fa" opacity={0.7} />
                  <Line data={regLine} dataKey="y" stroke="#f59e0b" dot={false} type="linear" legendType="none" strokeWidth={2} />
                  <Line data={identityLine} dataKey="y" stroke="#6b7280" dot={false} type="linear" strokeDasharray="5 5" legendType="none" />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {cmpChart === 'bland-altman' && baData.points.length > 0 && (
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="avg" type="number" domain={['auto', 'auto']} tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: 'Average', position: 'insideBottom', offset: -2, fill: '#6b7280', fontSize: 11 }} />
                  <YAxis dataKey="diff" type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: 'Difference', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} />
                  <Scatter data={baData.points} fill="#60a5fa" opacity={0.7} />
                  <ReferenceLine y={baData.meanDiff} stroke="#3b82f6" strokeWidth={2} label={{ value: `Bias ${baData.meanDiff.toFixed(2)}`, fill: '#60a5fa', fontSize: 10 }} />
                  <ReferenceLine y={baData.loaUpper} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `+LoA ${baData.loaUpper.toFixed(2)}`, fill: '#ef4444', fontSize: 10 }} />
                  <ReferenceLine y={baData.loaLower} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `-LoA ${baData.loaLower.toFixed(2)}`, fill: '#ef4444', fontSize: 10 }} />
                  <ReferenceLine y={0} stroke="#4b5563" />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {cmpChart === 'pct-diff' && cmpPairs.length > 0 && (
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={cmpPairs.map(p => ({ avg: +((p.a + p.b) / 2).toFixed(2), pct: +pctDiff(p.a, p.b).toFixed(2) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="avg" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <ReferenceLine y={teaNum} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `+TEa`, fill: '#ef4444', fontSize: 10 }} />
                  <ReferenceLine y={-teaNum} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `-TEa`, fill: '#ef4444', fontSize: 10 }} />
                  <ReferenceLine y={0} stroke="#4b5563" />
                  <Scatter dataKey="pct" fill="#a78bfa" opacity={0.7} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            <div className="mt-3 overflow-auto max-h-56 border border-gray-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900">
                  <tr className="border-b border-gray-700 text-gray-400 text-xs">
                    <th className="text-left px-3 py-2">Sample</th>
                    <th className="text-left px-3 py-2">{instName || 'New'}</th>
                    <th className="text-left px-3 py-2">{compMethod || 'Current'}</th>
                    <th className="text-left px-3 py-2">% Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {cmpRows.map((r, i) => {
                    const pd = (r.newInst !== '' && r.current !== '') ? pctDiff(parseFloat(r.current), parseFloat(r.newInst)) : null
                    return (
                      <tr key={i} className="border-b border-gray-800/50">
                        <td className="px-2 py-1"><input type="text" value={r.label} onChange={e => updateCmp(i, 'label', e.target.value)} className="bg-transparent text-gray-400 text-xs focus:outline-none w-full" /></td>
                        <td className="px-2 py-1"><input type="number" value={r.newInst} onChange={e => updateCmp(i, 'newInst', e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none w-full" /></td>
                        <td className="px-2 py-1"><input type="number" value={r.current} onChange={e => updateCmp(i, 'current', e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none w-full" /></td>
                        <td className={`px-3 py-1 text-xs ${pd !== null ? (Math.abs(pd) <= teaNum ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                          {pd !== null ? `${pd > 0 ? '+' : ''}${pd.toFixed(2)}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 6: Scorecard */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Validation Scorecard</h2>
            <div className={`rounded-xl p-4 border text-center ${allPass ? 'bg-green-900/20 border-green-700' : 'bg-red-900/20 border-red-700'}`}>
              <span className={`text-xl font-bold ${allPass ? 'text-green-400' : 'text-red-400'}`}>
                {allPass ? '✓ INSTRUMENT VALIDATED' : '✗ VALIDATION INCOMPLETE / FAILED'}
              </span>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Phase 1 — Precision: CV within 1.5× manufacturer claim', pass: precPass },
                { label: 'Phase 2 — Accuracy: |bias| ≤ TEa/2', pass: accPass },
                { label: 'Phase 3 — Linearity: r² ≥ 0.99, all points ≤ ±10%', pass: linPass },
                { label: `Phase 4 — Method Comparison: Bias within TEa, r ≥ 0.975${cmpStats ? `, slope CI ${cmpStats.slopeCILow.toFixed(3)}–${cmpStats.slopeCIHigh.toFixed(3)}` : ''}`, pass: cmpPass },
              ].map(({ label, pass }) => (
                <div key={label} className={`flex items-center gap-3 p-3 rounded-lg border ${pass ? 'border-green-700 bg-green-900/10' : 'border-red-700 bg-red-900/10'}`}>
                  <span className={`text-lg ${pass ? 'text-green-400' : 'text-red-400'}`}>{pass ? '✓' : '✗'}</span>
                  <span className="text-sm text-gray-300">{label}</span>
                </div>
              ))}
            </div>
            <div>
              <label className={labelCls}>Conclusion</label>
              <textarea value={conclusion} onChange={e => setConclusion(e.target.value)} className={inputCls} rows={4}
                placeholder={`${instName || 'New instrument'} ${allPass ? 'has successfully passed' : 'failed'} all validation phases...`} />
            </div>
            <button onClick={complete} disabled={saving}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Complete & Save Validation'}
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
