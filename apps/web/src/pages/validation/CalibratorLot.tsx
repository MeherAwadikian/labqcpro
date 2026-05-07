import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { mean, sd, cv, pctDiff } from '../../lib/stats'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ComposedChart, ErrorBar,
} from 'recharts'

type Analyte = { id: string; name: string; unit: string; tea: number | null }
type Rep = { current: string; newLot: string }

const STEPS = ['Setup', 'Data Entry', 'Statistics', 'Charts', 'Traceability', 'Conclusion']
const LEVELS = ['Low', 'Mid', 'High'] as const

const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'
const labelCls = 'text-xs text-gray-400 mb-1 block'

function makeReps(n = 5): Rep[] {
  return Array.from({ length: n }, () => ({ current: '', newLot: '' }))
}

function StepBar({ step, total, labels }: { step: number; total: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-1 flex-1 min-w-0">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
            i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-500'
          }`}>{i + 1}</div>
          <span className={`text-xs hidden sm:block truncate ${i === step ? 'text-white font-medium' : 'text-gray-500'}`}>{l}</span>
          {i < total - 1 && <div className={`h-0.5 w-4 flex-1 mx-1 shrink-0 ${i < step ? 'bg-brand-600' : 'bg-gray-800'}`} />}
        </div>
      ))}
    </div>
  )
}

function levelStats(reps: Rep[]) {
  const vals = reps.filter(r => r.newLot !== '').map(r => parseFloat(r.newLot)).filter(isFinite)
  const vals_c = reps.filter(r => r.current !== '').map(r => parseFloat(r.current)).filter(isFinite)
  return {
    meanNew: mean(vals), sdNew: sd(vals), cvNew: cv(vals), n: vals.length,
    meanCur: mean(vals_c), sdCur: sd(vals_c),
  }
}

export default function CalibratorLot() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const studyId = params.get('id')

  const [step, setStep] = useState(0)
  const [analytes, setAnalytes] = useState<Analyte[]>([])
  const [saving, setSaving] = useState(false)
  const [activeLevel, setActiveLevel] = useState<0 | 1 | 2>(0)
  const [currentStudyId, setCurrentStudyId] = useState<string | null>(studyId)

  // Setup fields
  const [title, setTitle]         = useState('')
  const [analyteId, setAnalyteId] = useState('')
  const [currentLot, setCurrentLot] = useState('')
  const [newLot, setNewLot]         = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [traceability, setTraceability] = useState('')
  const [siTraceable, setSiTraceable]   = useState(false)
  const [openStability, setOpenStability] = useState('')
  const [acceptanceLimit, setAcceptanceLimit] = useState('5')
  const [coaValues, setCoaValues] = useState(['', '', ''])
  const [conclusion, setConclusion] = useState('')

  // Data: 3 levels × 5 replicates
  const [reps, setReps] = useState<[Rep[], Rep[], Rep[]]>([makeReps(), makeReps(), makeReps()])

  useEffect(() => { api.get<Analyte[]>('/analytes').then(setAnalytes) }, [])

  useEffect(() => {
    const a = analytes.find(a => a.id === analyteId)
    if (a && !studyId) {
      const d = new Date().toISOString().split('T')[0]
      setTitle(`Calibrator Lot Validation — ${a.name} — ${d}`)
    }
  }, [analyteId, analytes, studyId])

  useEffect(() => {
    if (!studyId) return
    api.get<any>(`/validation/${studyId}`).then(data => {
      setTitle(data.title ?? '')
      setAnalyteId(data.analyte_id ?? '')
      setConclusion(data.conclusion ?? '')
      const meta = data.metadata ? JSON.parse(data.metadata) : {}
      setCurrentLot(meta.currentLot ?? ''); setNewLot(meta.newLot ?? '')
      setManufacturer(meta.manufacturer ?? ''); setTraceability(meta.traceability ?? '')
      setSiTraceable(meta.siTraceable ?? false); setOpenStability(String(meta.openStability ?? ''))
      setAcceptanceLimit(String(meta.acceptanceLimit ?? 5)); setCoaValues(meta.coaValues ?? ['', '', ''])
    })
  }, [studyId])

  function updateRep(level: 0 | 1 | 2, repIdx: number, field: keyof Rep, val: string) {
    setReps(prev => {
      const next = [prev[0].slice(), prev[1].slice(), prev[2].slice()] as [Rep[], Rep[], Rep[]]
      next[level][repIdx] = { ...next[level][repIdx], [field]: val }
      return next
    })
  }

  function updateCoa(i: number, v: string) {
    setCoaValues(prev => prev.map((c, idx) => idx === i ? v : c))
  }

  // Level stats
  const lstats = LEVELS.map((_, i) => levelStats(reps[i]))

  // Chart data for bar chart
  const barData = LEVELS.map((l, i) => {
    const coa = parseFloat(coaValues[i])
    const bias = isFinite(coa) && lstats[i].meanNew !== 0 ? pctDiff(coa, lstats[i].meanNew) : null
    return {
      level: l, current: +lstats[i].meanCur.toFixed(3), newLot: +lstats[i].meanNew.toFixed(3),
      bias: bias !== null ? +bias.toFixed(2) : null,
    }
  })

  async function saveAndNext() {
    setSaving(true)
    try {
      const meta = {
        currentLot, newLot, manufacturer, traceability, siTraceable,
        openStability: openStability ? parseInt(openStability) : null,
        acceptanceLimit: parseFloat(acceptanceLimit), coaValues,
      }
      let id = currentStudyId
      if (!id) {
        const res = await api.post<{ id: string }>('/validation', {
          study_type: 'calibrator_lot', title, analyte_id: analyteId || undefined, metadata: meta,
        })
        id = res.id
        setCurrentStudyId(id)
        navigate(`/validation/calibrator-lot?id=${id}`, { replace: true })
      } else {
        await api.put(`/validation/${id}`, { title, analyte_id: analyteId || undefined, metadata: meta })
      }
      if (step >= 1) {
        const samples: any[] = []
        reps.forEach((levelReps, li) => levelReps.forEach((r, ri) => {
          samples.push({
            sample_id_label: `L${li + 1}R${ri + 1}`,
            method_a_value: r.current !== '' ? parseFloat(r.current) : null,
            method_b_value: r.newLot !== '' ? parseFloat(r.newLot) : null,
            level_label: LEVELS[li], replicate_number: ri + 1, sort_order: li * 5 + ri,
          })
        }))
        await api.put(`/validation/${id}/samples`, { samples })
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

  const acLimit = parseFloat(acceptanceLimit) || 5

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/validation')} className="text-gray-500 hover:text-gray-300 text-sm">← Validation</button>
        <span className="text-gray-700">/</span>
        <span className="text-gray-300 text-sm font-medium">Calibrator Lot Validation</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <StepBar step={step} total={STEPS.length} labels={STEPS} />

        {/* Step 1: Setup */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Study Setup <span className="text-xs text-gray-500 font-normal ml-2">CLIA 42 CFR 493.1255 · CLSI C24</span></h2>
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
                <label className={labelCls}>Manufacturer</label>
                <input type="text" value={manufacturer} onChange={e => setManufacturer(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Current Calibrator Lot #</label>
                <input type="text" value={currentLot} onChange={e => setCurrentLot(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>New Calibrator Lot #</label>
                <input type="text" value={newLot} onChange={e => setNewLot(e.target.value)} className={inputCls} />
              </div>
              {LEVELS.map((l, i) => (
                <div key={l}>
                  <label className={labelCls}>CoA Value — {l} Level</label>
                  <input type="number" value={coaValues[i]} onChange={e => updateCoa(i, e.target.value)} className={inputCls} placeholder={`Assigned value`} />
                </div>
              ))}
              <div>
                <label className={labelCls}>Acceptance Limit (% from CoA)</label>
                <input type="number" value={acceptanceLimit} onChange={e => setAcceptanceLimit(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Open Vial Stability (days)</label>
                <input type="number" value={openStability} onChange={e => setOpenStability(e.target.value)} className={inputCls} />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Traceability Statement</label>
                <textarea value={traceability} onChange={e => setTraceability(e.target.value)} className={inputCls} rows={2} placeholder="e.g. Traceable to NIST SRM 965a via manufacturer reference standard" />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="si" checked={siTraceable} onChange={e => setSiTraceable(e.target.checked)}
                  className="w-4 h-4 accent-brand-500" />
                <label htmlFor="si" className="text-sm text-gray-300">SI Unit Traceable (mandatory per CLIA)</label>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Data Entry */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Data Entry — 5 Replicates × 3 Levels</h2>
            <div className="flex gap-2">
              {LEVELS.map((l, i) => (
                <button key={l} onClick={() => setActiveLevel(i as 0 | 1 | 2)}
                  className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${activeLevel === i ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {l} Level
                </button>
              ))}
            </div>
            <div className="border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-xs bg-gray-900">
                    <th className="text-left px-4 py-2">Replicate</th>
                    <th className="text-left px-4 py-2">Current Lot</th>
                    <th className="text-left px-4 py-2">New Lot</th>
                  </tr>
                </thead>
                <tbody>
                  {reps[activeLevel].map((r, ri) => (
                    <tr key={ri} className="border-b border-gray-800/50">
                      <td className="px-4 py-2 text-gray-500 text-xs">Rep {ri + 1}</td>
                      <td className="px-3 py-1.5">
                        <input type="number" value={r.current}
                          onChange={e => updateRep(activeLevel, ri, 'current', e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full" />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" value={r.newLot}
                          onChange={e => updateRep(activeLevel, ri, 'newLot', e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full" />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-700 bg-gray-900/50 text-xs text-gray-400">
                    <td className="px-4 py-2 font-medium">Mean</td>
                    <td className="px-4 py-2">{lstats[activeLevel].meanCur.toFixed(3)}</td>
                    <td className="px-4 py-2">{lstats[activeLevel].meanNew.toFixed(3)}</td>
                  </tr>
                  <tr className="bg-gray-900/50 text-xs text-gray-400">
                    <td className="px-4 py-2 font-medium">CV%</td>
                    <td className="px-4 py-2">{lstats[activeLevel].cvNew.toFixed(2)}%</td>
                    <td className="px-4 py-2">{lstats[activeLevel].cvNew.toFixed(2)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Step 3: Statistics */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Statistics Summary</h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-xs">
                    <th className="text-left px-3 py-2">Level</th>
                    <th className="text-left px-3 py-2">Current Mean</th>
                    <th className="text-left px-3 py-2">New Mean</th>
                    <th className="text-left px-3 py-2">% Diff</th>
                    <th className="text-left px-3 py-2">CV% (New)</th>
                    <th className="text-left px-3 py-2">CoA Value</th>
                    <th className="text-left px-3 py-2">% from CoA</th>
                    <th className="text-center px-3 py-2">Pass</th>
                  </tr>
                </thead>
                <tbody>
                  {LEVELS.map((l, i) => {
                    const s = lstats[i]
                    const coa = parseFloat(coaValues[i])
                    const diffLots = s.meanCur !== 0 ? pctDiff(s.meanCur, s.meanNew) : null
                    const diffCoa = isFinite(coa) ? pctDiff(coa, s.meanNew) : null
                    const pass = diffCoa !== null && Math.abs(diffCoa) <= acLimit
                    return (
                      <tr key={l} className="border-b border-gray-800">
                        <td className="px-3 py-2 text-gray-300 font-medium">{l}</td>
                        <td className="px-3 py-2 text-gray-400">{s.meanCur.toFixed(3)}</td>
                        <td className="px-3 py-2 text-gray-400">{s.meanNew.toFixed(3)}</td>
                        <td className={`px-3 py-2 text-xs ${diffLots !== null && Math.abs(diffLots) <= acLimit ? 'text-green-400' : 'text-yellow-400'}`}>
                          {diffLots !== null ? `${diffLots > 0 ? '+' : ''}${diffLots.toFixed(2)}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-400">{s.cvNew.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-gray-400">{isFinite(coa) ? coa : '—'}</td>
                        <td className={`px-3 py-2 text-xs ${diffCoa !== null ? (pass ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                          {diffCoa !== null ? `${diffCoa > 0 ? '+' : ''}${diffCoa.toFixed(2)}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {diffCoa !== null && <span className={`font-bold ${pass ? 'text-green-400' : 'text-red-400'}`}>{pass ? '✓' : '✗'}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">Acceptance limit: ±{acLimit}% from CoA value</p>
          </div>
        )}

        {/* Step 4: Charts */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="font-semibold text-white">Charts</h2>
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">Mean ± SD by Level (Current vs New)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="level" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                  <Bar dataKey="current" name="Current Lot" fill="#60a5fa" />
                  <Bar dataKey="newLot" name="New Lot" fill="#34d399" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">% Deviation from CoA</h3>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="level" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: '% Dev', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [`${v}%`, '% from CoA']} contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                  <ReferenceLine y={acLimit} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `+${acLimit}%`, fill: '#ef4444', fontSize: 10 }} />
                  <ReferenceLine y={-acLimit} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `-${acLimit}%`, fill: '#ef4444', fontSize: 10 }} />
                  <ReferenceLine y={0} stroke="#4b5563" />
                  <Bar dataKey="bias" name="% from CoA" fill="#a78bfa" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Step 5: Traceability */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Traceability Documentation</h2>
            <div className="bg-gray-800 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-medium text-gray-300">Metrological Traceability Chain</h3>
              <div className="flex flex-col gap-2 text-xs">
                {[
                  'SI Reference Standard (BIPM / NIST)',
                  'Manufacturer Reference Material',
                  `Calibrator Lot ${newLot || '—'} (under validation)`,
                  'Instrument Calibration',
                  'Patient Result',
                ].map((label, i, arr) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <div className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-gray-200 w-full text-center">{label}</div>
                    {i < arr.length - 1 && <div className="text-gray-600">↓</div>}
                  </div>
                ))}
              </div>
            </div>
            <div className={`rounded-lg p-3 border text-sm ${siTraceable ? 'bg-green-900/20 border-green-700 text-green-300' : 'bg-red-900/20 border-red-700 text-red-300'}`}>
              {siTraceable ? '✓ SI Unit Traceable — CLIA 493.1255 requirement satisfied' : '✗ SI Traceability NOT confirmed — required per CLIA 493.1255'}
            </div>
            {traceability && (
              <div className="bg-gray-800 rounded-lg p-3 text-sm text-gray-300">
                <span className="text-gray-500 text-xs uppercase tracking-wide block mb-1">Traceability Statement</span>
                {traceability}
              </div>
            )}
          </div>
        )}

        {/* Step 6: Conclusion */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-white">Conclusion & Approval</h2>
            <div>
              <label className={labelCls}>Conclusion</label>
              <textarea value={conclusion} onChange={e => setConclusion(e.target.value)} className={inputCls} rows={5}
                placeholder={`New calibrator lot ${newLot} was compared against current lot ${currentLot} at 3 concentration levels...`} />
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
