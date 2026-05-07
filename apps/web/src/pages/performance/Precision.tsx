import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import {
  Target, ChevronDown, ChevronUp, BookOpen, CheckCircle2, XCircle,
  Trash2, RefreshCw, Plus, ArrowRight,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'

const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'
const lbl = 'text-xs text-gray-400 mb-1 block'
const btn = 'bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50'

type Analyte = { id: string; name: string; unit: string }
type Study = {
  id: string; analyte_name?: string; level: string; instrument: string; operator: string
  study_start_date: string; status: string; manufacturer_cv_total?: number
  total_cv?: number; stats_passed?: number
}

const DAYS = [1, 2, 3, 4, 5]
const REPS = [1, 2, 3, 4, 5]

function computeANOVA(grid: string[][], mfrCv: number, multiplier: number) {
  const dayNums: number[][] = grid.map(day =>
    day.map(v => parseFloat(v)).filter(v => isFinite(v))
  )
  const valid = dayNums.filter(d => d.length >= 2)
  if (valid.length < 2) return null

  const n_reps = valid[0].length
  const n_days = valid.length
  const grand_mean = valid.flat().reduce((a, b) => a + b, 0) / (n_days * n_reps)
  const day_means = valid.map(d => d.reduce((a, b) => a + b, 0) / d.length)

  const SS_between = n_reps * day_means.reduce((s, m) => s + (m - grand_mean) ** 2, 0)
  const MS_between = SS_between / (n_days - 1)

  let SS_within = 0
  for (let i = 0; i < n_days; i++)
    for (const v of valid[i]) SS_within += (v - day_means[i]) ** 2
  const MS_within = SS_within / (n_days * (n_reps - 1))

  const SD_within = Math.sqrt(MS_within)
  const SD_bsq = Math.max(0, (MS_between - MS_within) / n_reps)
  const SD_between = Math.sqrt(SD_bsq)
  const SD_total = Math.sqrt(SD_within ** 2 + SD_bsq)

  const CV_within  = grand_mean ? (SD_within  / grand_mean) * 100 : 0
  const CV_between = grand_mean ? (SD_between / grand_mean) * 100 : 0
  const CV_total   = grand_mean ? (SD_total   / grand_mean) * 100 : 0

  return {
    n: n_days * n_reps, grand_mean,
    within_run_sd: SD_within, within_run_cv: CV_within,
    between_run_sd: SD_between, between_run_cv: CV_between,
    total_sd: SD_total, total_cv: CV_total,
    manufacturer_cv: mfrCv,
    passed: CV_total <= mfrCv * multiplier,
  }
}

export default function Precision() {
  const { role } = useAuthStore()
  const canDelete = ['admin', 'director'].includes(role ?? '')

  const [eduOpen, setEduOpen]   = useState(false)
  const [eduTab, setEduTab]     = useState<'within' | 'between' | 'total' | 'anova'>('within')
  const [tab, setTab]           = useState<'new' | 'history'>('new')
  const [step, setStep]         = useState<1 | 2 | 3>(1)
  const [analytes, setAnalytes] = useState<Analyte[]>([])
  const [studies, setStudies]   = useState<Study[]>([])
  const [saving, setSaving]     = useState(false)
  const [calculating, setCalc]  = useState(false)
  const [msg, setMsg]           = useState<{ text: string; ok: boolean } | null>(null)

  // Setup fields
  const [studyId, setStudyId]       = useState<string | null>(null)
  const [analyteId, setAnalyteId]   = useState('')
  const [studyName, setStudyName]   = useState('')
  const [instrument, setInstrument] = useState('')
  const [operator, setOperator]     = useState('')
  const [level, setLevel]           = useState<'low' | 'high'>('low')
  const [mfrCvWithin, setMfrCvW]    = useState('')
  const [mfrCvTotal, setMfrCvT]     = useState('')
  const [multiplier, setMultiplier] = useState('1.5')
  const [startDate, setStartDate]   = useState(new Date().toISOString().split('T')[0])

  // Grid[5 days][5 reps]
  const [grid, setGrid] = useState<string[][]>(() => Array.from({ length: 5 }, () => Array(5).fill('')))
  const [dayDates, setDayDates] = useState<string[]>(() => Array(5).fill(''))
  const [currentDay, setCurrentDay] = useState(0)
  const [savingDay, setSavingDay]   = useState(false)
  const [savedDays, setSavedDays]   = useState<Set<number>>(new Set())

  // Final stats
  const [stats, setStats] = useState<ReturnType<typeof computeANOVA> | null>(null)

  function notify(text: string, ok: boolean) {
    setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000)
  }

  useEffect(() => {
    api.get<{ data: Analyte[] }>('/analytes').then(r => setAnalytes(r.data))
    loadStudies()
  }, [])

  function loadStudies() {
    api.get<{ data: Study[] }>('/performance/precision').then(r => setStudies(r.data))
  }

  function updateCell(day: number, rep: number, val: string) {
    setGrid(prev => {
      const copy = prev.map(r => [...r])
      copy[day][rep] = val
      return copy
    })
  }

  // Live stats for current grid
  const liveStats = useMemo(() => {
    const mfr = parseFloat(mfrCvTotal || mfrCvWithin)
    const mult = parseFloat(multiplier)
    if (!isFinite(mfr) || !isFinite(mult)) return null
    return computeANOVA(grid, mfr, mult)
  }, [grid, mfrCvTotal, mfrCvWithin, multiplier])

  async function createStudy() {
    if (!instrument || !operator) { notify('Instrument and operator required.', false); return }
    setSaving(true)
    try {
      const r = await api.post<{ id: string }>('/performance/precision', {
        analyte_id: analyteId || undefined, study_name: studyName || undefined,
        instrument, operator, level, study_start_date: startDate,
        manufacturer_cv_within: parseFloat(mfrCvWithin) || undefined,
        manufacturer_cv_total: parseFloat(mfrCvTotal) || undefined,
        acceptance_multiplier: parseFloat(multiplier) || 1.5,
      })
      setStudyId(r.id)
      setStep(2)
    } catch (e: any) { notify(e.message, false) }
    finally { setSaving(false) }
  }

  async function saveDay() {
    if (!studyId) return
    const vals = grid[currentDay].map(v => { const n = parseFloat(v); return isFinite(n) ? n : null })
    if (vals.every(v => v === null)) { notify('Enter at least one value for this day.', false); return }
    setSavingDay(true)
    try {
      await api.put(`/performance/precision/${studyId}/replicates`, {
        day: currentDay + 1,
        values: vals,
        run_date: dayDates[currentDay] || startDate,
        operator,
      })
      setSavedDays(prev => new Set([...prev, currentDay]))
      notify(`Day ${currentDay + 1} saved.`, true)
      if (currentDay < 4) setCurrentDay(currentDay + 1)
    } catch (e: any) { notify(e.message, false) }
    finally { setSavingDay(false) }
  }

  async function calculate() {
    if (!studyId) return
    setCalc(true)
    try {
      const r = await api.post<{ stats: any }>(`/performance/precision/${studyId}/calculate`, {})
      setStats(r.stats)
      setStep(3)
      loadStudies()
      notify('ANOVA calculation complete.', true)
    } catch (e: any) { notify(e.message, false) }
    finally { setCalc(false) }
  }

  function resetWizard() {
    setStep(1); setStudyId(null)
    setAnalyteId(''); setStudyName(''); setInstrument(''); setOperator('')
    setLevel('low'); setMfrCvW(''); setMfrCvT(''); setMultiplier('1.5')
    setStartDate(new Date().toISOString().split('T')[0])
    setGrid(Array.from({ length: 5 }, () => Array(5).fill('')))
    setDayDates(Array(5).fill('')); setCurrentDay(0); setSavedDays(new Set())
    setStats(null)
  }

  async function deleteStudy(id: string) {
    if (!confirm('Delete this precision study?')) return
    try {
      await api.delete(`/performance/precision/${id}`)
      setStudies(prev => prev.filter(s => s.id !== id))
    } catch (e: any) { notify(e.message, false) }
  }

  // Day mean/SD for display
  function dayStats(day: number) {
    const nums = grid[day].map(v => parseFloat(v)).filter(isFinite)
    if (!nums.length) return null
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length
    const sd = Math.sqrt(nums.reduce((s, v) => s + (v - mean) ** 2, 0) / (nums.length - 1 || 1))
    const cv = mean ? (sd / mean) * 100 : 0
    return { mean: mean.toFixed(3), sd: sd.toFixed(3), cv: cv.toFixed(2) }
  }

  const EDU_TABS = [
    { id: 'within', label: 'Within-Run' },
    { id: 'between', label: 'Between-Run' },
    { id: 'total', label: 'Total Precision' },
    { id: 'anova', label: 'ANOVA Explained' },
  ] as const

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Target size={20} className="text-purple-400" /> Precision Testing
          <span className="text-xs text-gray-500 font-normal ml-1">(CLSI EP15-A3)</span>
        </h1>
        <button onClick={loadStudies} className="p-2 text-gray-500 hover:text-gray-300 transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${msg.ok ? 'bg-green-900/30 border-green-700 text-green-300' : 'bg-red-900/30 border-red-700 text-red-300'}`}>
          {msg.text}
        </div>
      )}

      {/* Education */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <button onClick={() => setEduOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-300 hover:text-white transition-colors">
          <span className="flex items-center gap-2"><BookOpen size={15} className="text-purple-400" /> Understanding Precision (CLSI EP15-A3)</span>
          {eduOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {eduOpen && (
          <div className="border-t border-gray-800">
            <div className="flex border-b border-gray-800">
              {EDU_TABS.map(t => (
                <button key={t.id} onClick={() => setEduTab(t.id)}
                  className={`px-4 py-2 text-xs font-medium transition-colors ${eduTab === t.id ? 'text-purple-400 border-b-2 border-purple-500' : 'text-gray-500 hover:text-gray-300'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="p-5 text-sm text-gray-400 space-y-2">
              {eduTab === 'within' && <>
                <p><strong className="text-gray-200">Within-Run (Repeatability):</strong> Variation within a single analytical run.</p>
                <p>Caused by: pipetting variation, reagent mixing, temperature fluctuation within a run.</p>
                <p>Expressed as: <span className="font-mono text-purple-300">SD_r</span> (repeatability SD) and <span className="font-mono text-purple-300">CV_r%</span></p>
              </>}
              {eduTab === 'between' && <>
                <p><strong className="text-gray-200">Between-Run (Reproducibility / Within-Lab):</strong> Variation across different runs and days.</p>
                <p>Caused by: reagent lot changes, calibration drift, operator-to-operator variation, temperature changes between days.</p>
                <p>Expressed as: <span className="font-mono text-purple-300">SD_wl</span> and <span className="font-mono text-purple-300">CV_wl%</span></p>
              </>}
              {eduTab === 'total' && <>
                <p><strong className="text-gray-200">Total Precision:</strong> Combines within-run and between-run components using ANOVA.</p>
                <div className="bg-gray-800 rounded p-3 font-mono text-xs mt-2 space-y-1 text-purple-300">
                  <div>Total Variance = Within-Run Variance + Between-Run Variance</div>
                  <div>SD_total = √(SD_within² + SD_between²)</div>
                  <div>CV_total = (SD_total / Grand Mean) × 100</div>
                </div>
                <p className="mt-2">Acceptance: <span className="text-white">CV_total ≤ Manufacturer CV × Multiplier</span> (default 1.5× for Chi-square test)</p>
              </>}
              {eduTab === 'anova' && <>
                <p><strong className="text-gray-200">ANOVA (Analysis of Variance)</strong> separates total variation into components:</p>
                <div className="bg-gray-800 rounded p-3 font-mono text-xs mt-2 space-y-1 text-purple-300">
                  <div>SS_between = n_reps × Σ(day_mean - grand_mean)²</div>
                  <div>SS_within  = Σ Σ (value - day_mean)²</div>
                  <div>MS_between = SS_between / (n_days - 1)</div>
                  <div>MS_within  = SS_within  / (n_days × (n_reps - 1))</div>
                  <div>SD_within  = √MS_within</div>
                  <div>SD_between = √max(0, (MS_between - MS_within) / n_reps)</div>
                </div>
                <p className="mt-2">Protocol: <strong className="text-white">5 days × 5 replicates</strong> = 25 measurements per level</p>
              </>}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {(['new', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
            {t === 'new' ? 'New Study' : 'Study History'}
          </button>
        ))}
      </div>

      {tab === 'history' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {studies.length === 0
            ? <p className="px-5 py-8 text-sm text-gray-600 text-center">No precision studies yet</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      {['Started', 'Analyte', 'Level', 'Instrument', 'Total CV%', 'Mfr CV%', 'Status', ''].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs text-gray-500 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {studies.map(s => (
                      <tr key={s.id} className="hover:bg-gray-800/30">
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{s.study_start_date}</td>
                        <td className="px-4 py-2.5 text-gray-200">{s.analyte_name ?? '—'}</td>
                        <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-300 border border-purple-700 capitalize">{s.level}</span></td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{s.instrument}</td>
                        <td className="px-4 py-2.5 font-mono text-gray-200">{s.total_cv != null ? `${s.total_cv.toFixed(2)}%` : '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-gray-400">{s.manufacturer_cv_total != null ? `${s.manufacturer_cv_total}%` : '—'}</td>
                        <td className="px-4 py-2.5">
                          {s.status === 'complete'
                            ? s.stats_passed
                              ? <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle2 size={12} /> Pass</span>
                              : <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle size={12} /> Fail</span>
                            : <span className="text-xs text-amber-400">In Progress</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {canDelete && (
                            <button onClick={() => deleteStudy(s.id)} className="p-1 text-gray-600 hover:text-red-400 rounded transition-colors">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {tab === 'new' && (
        <div className="space-y-4">
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${step === s ? 'bg-purple-600 border-purple-500 text-white' : step > s ? 'bg-green-700 border-green-600 text-white' : 'border-gray-700 text-gray-600'}`}>
                  {step > s ? '✓' : s}
                </div>
                <span className={`text-xs hidden sm:block ${step === s ? 'text-purple-400' : step > s ? 'text-green-400' : 'text-gray-600'}`}>
                  {['Setup', 'Daily Entry', 'Results'][i]}
                </span>
                {i < 2 && <ArrowRight size={14} className="text-gray-700" />}
              </div>
            ))}
          </div>

          {/* Step 1: Setup */}
          {step === 1 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Step 1 — Study Configuration</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="col-span-2 md:col-span-3">
                  <label className={lbl}>Study Name (optional)</label>
                  <input value={studyName} onChange={e => setStudyName(e.target.value)} className={inp}
                    placeholder={`Precision Study — ${analytes.find(a => a.id === analyteId)?.name ?? 'Analyte'} — ${startDate}`} />
                </div>
                <div>
                  <label className={lbl}>Analyte</label>
                  <select value={analyteId} onChange={e => setAnalyteId(e.target.value)} className={inp}>
                    <option value="">— Select —</option>
                    {analytes.map(a => <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Concentration Level</label>
                  <select value={level} onChange={e => setLevel(e.target.value as 'low' | 'high')} className={inp}>
                    <option value="low">Low (normal/low pathological)</option>
                    <option value="high">High (abnormal/high pathological)</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Instrument</label>
                  <input value={instrument} onChange={e => setInstrument(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Operator</label>
                  <input value={operator} onChange={e => setOperator(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Study Start Date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Mfr. Within-Run CV% (from package insert)</label>
                  <input type="number" step="0.1" value={mfrCvWithin} onChange={e => setMfrCvW(e.target.value)} className={inp} placeholder="e.g. 2.0" />
                </div>
                <div>
                  <label className={lbl}>Mfr. Total Precision CV% (if stated)</label>
                  <input type="number" step="0.1" value={mfrCvTotal} onChange={e => setMfrCvT(e.target.value)} className={inp} placeholder="e.g. 3.5" />
                </div>
                <div>
                  <label className={lbl}>Acceptance Multiplier</label>
                  <select value={multiplier} onChange={e => setMultiplier(e.target.value)} className={inp}>
                    <option value="1.0">1.0 (strict — CV ≤ Mfr CV)</option>
                    <option value="1.5">1.5 (Chi-square test — CLSI recommended)</option>
                  </select>
                </div>
              </div>
              <button onClick={createStudy} disabled={saving} className={btn}>
                {saving ? 'Creating…' : 'Start Study →'}
              </button>
            </div>
          )}

          {/* Step 2: Daily entry */}
          {step === 2 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-white">Step 2 — Daily Data Entry</h2>
                <p className="text-xs text-gray-500 mt-1">Enter 5 replicates per day for 5 days (25 total). Save each day before proceeding.</p>
              </div>

              {/* Day tabs */}
              <div className="flex border-b border-gray-800">
                {DAYS.map(d => (
                  <button key={d} onClick={() => setCurrentDay(d - 1)}
                    className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${currentDay === d - 1 ? 'text-purple-400 border-b-2 border-purple-500' : 'text-gray-500 hover:text-gray-300'}`}>
                    Day {d}
                    {savedDays.has(d - 1) && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-500" />
                    )}
                  </button>
                ))}
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className={lbl}>Date for Day {currentDay + 1}</label>
                    <input type="date" value={dayDates[currentDay]}
                      onChange={e => setDayDates(prev => { const c = [...prev]; c[currentDay] = e.target.value; return c })}
                      className={inp} />
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 mb-2">Replicate Values (Day {currentDay + 1})</div>
                  <div className="grid grid-cols-5 gap-2">
                    {REPS.map(r => (
                      <div key={r}>
                        <label className={`${lbl} text-center`}>Rep {r}</label>
                        <input type="number" step="any" value={grid[currentDay][r - 1]}
                          onChange={e => updateCell(currentDay, r - 1, e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500 w-full text-center" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Day stats */}
                {(() => { const ds = dayStats(currentDay); return ds && (
                  <div className="grid grid-cols-3 gap-3 text-center bg-gray-800/50 rounded-lg p-3">
                    <div><div className="text-xs text-gray-500">Mean</div><div className="font-mono text-sm text-gray-200">{ds.mean}</div></div>
                    <div><div className="text-xs text-gray-500">SD</div><div className="font-mono text-sm text-gray-200">{ds.sd}</div></div>
                    <div><div className="text-xs text-gray-500">CV%</div><div className="font-mono text-sm text-gray-200">{ds.cv}%</div></div>
                  </div>
                )})()}

                <div className="flex gap-2 flex-wrap">
                  <button onClick={saveDay} disabled={savingDay} className={btn}>
                    {savingDay ? 'Saving…' : `Save Day ${currentDay + 1}`}
                  </button>
                  {savedDays.size >= 2 && (
                    <button onClick={calculate} disabled={calculating}
                      className="bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                      {calculating ? 'Calculating…' : 'Calculate ANOVA →'}
                    </button>
                  )}
                  <button onClick={resetWizard} className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
                    Cancel
                  </button>
                </div>
                {savedDays.size < 2 && <p className="text-xs text-gray-600">Save at least 2 days of data to calculate.</p>}
              </div>

              {/* Live preview table */}
              {liveStats && (
                <div className="border-t border-gray-800 p-5 space-y-3">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Live Preview (ANOVA)</div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                      { label: 'Within-Run CV', val: liveStats.within_run_cv, color: 'text-blue-400' },
                      { label: 'Between-Run CV', val: liveStats.between_run_cv, color: 'text-purple-400' },
                      { label: 'Total CV', val: liveStats.total_cv, color: liveStats.passed ? 'text-green-400' : 'text-red-400' },
                    ].map(item => (
                      <div key={item.label} className="bg-gray-800/50 rounded-lg p-3">
                        <div className={`text-lg font-bold font-mono ${item.color}`}>{item.val.toFixed(2)}%</div>
                        <div className="text-xs text-gray-500">{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Results */}
          {step === 3 && stats && (
            <div className="space-y-4">
              <div className={`rounded-xl p-5 border ${stats.passed ? 'bg-green-900/20 border-green-700' : 'bg-red-900/20 border-red-700'}`}>
                <div className="flex items-center gap-3 mb-4">
                  {stats.passed ? <CheckCircle2 size={24} className="text-green-400" /> : <XCircle size={24} className="text-red-400" />}
                  <div>
                    <div className="font-semibold text-white">{stats.passed ? 'PRECISION ACCEPTABLE' : 'PRECISION EXCEEDS LIMIT'}</div>
                    <div className="text-sm text-gray-400">Total CV {stats.total_cv.toFixed(2)}% vs limit {(stats.manufacturer_cv * parseFloat(multiplier)).toFixed(2)}%</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'N', val: `${stats.n}`, sub: 'measurements' },
                    { label: 'Grand Mean', val: stats.grand_mean.toFixed(3), sub: 'grand mean' },
                    { label: 'Within-Run SD', val: stats.within_run_sd.toFixed(4), sub: `CV ${stats.within_run_cv.toFixed(2)}%` },
                    { label: 'Total SD', val: stats.total_sd.toFixed(4), sub: `CV ${stats.total_cv.toFixed(2)}%` },
                  ].map(item => (
                    <div key={item.label} className="bg-gray-800/50 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold font-mono text-white">{item.val}</div>
                      <div className="text-xs text-gray-400">{item.label}</div>
                      <div className="text-xs text-gray-600">{item.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-700">
                        {['Component', 'SD', 'CV%', 'vs Mfr Limit', 'Status'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {[
                        { comp: 'Within-Run', sd: stats.within_run_sd, cv: stats.within_run_cv },
                        { comp: 'Between-Run', sd: stats.between_run_sd, cv: stats.between_run_cv },
                        { comp: 'Total Precision', sd: stats.total_sd, cv: stats.total_cv, isTotal: true },
                      ].map(row => {
                        const limit = stats.manufacturer_cv * parseFloat(multiplier)
                        const pass = row.cv <= limit
                        return (
                          <tr key={row.comp}>
                            <td className="px-3 py-2 font-medium text-gray-300">{row.comp}</td>
                            <td className="px-3 py-2 font-mono text-gray-300">{row.sd.toFixed(4)}</td>
                            <td className={`px-3 py-2 font-mono font-bold ${row.isTotal ? (pass ? 'text-green-400' : 'text-red-400') : 'text-gray-300'}`}>{row.cv.toFixed(2)}%</td>
                            <td className="px-3 py-2 text-gray-400">{limit.toFixed(2)}%</td>
                            <td className="px-3 py-2">{pass ? <CheckCircle2 size={13} className="text-green-400" /> : <XCircle size={13} className="text-red-400" />}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bar chart comparing components */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="text-sm font-semibold text-white mb-3">CV% Components</div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={[
                    { name: 'Within-Run', cv: parseFloat(stats.within_run_cv.toFixed(2)) },
                    { name: 'Between-Run', cv: parseFloat(stats.between_run_cv.toFixed(2)) },
                    { name: 'Total', cv: parseFloat(stats.total_cv.toFixed(2)) },
                  ]} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                      formatter={(v: any) => [`${v}%`, 'CV']} />
                    <ReferenceLine y={stats.manufacturer_cv * parseFloat(multiplier)} stroke="#EF4444" strokeDasharray="4 4"
                      label={{ value: 'Limit', fill: '#EF4444', fontSize: 11 }} />
                    <Bar dataKey="cv" fill="#9333EA" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex gap-2">
                <button onClick={resetWizard} className={btn}>Start New Study</button>
                <button onClick={() => setTab('history')} className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
                  View History
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
