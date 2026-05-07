import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import {
  Droplets, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  Trash2, RefreshCw, Plus, BookOpen,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'

const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'
const lbl = 'text-xs text-gray-400 mb-1 block'
const btn = 'bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50'

type Analyte  = { id: string; name: string; unit: string }
type Study    = {
  id: string; analyte_name?: string; instrument: string; operator: string
  study_date: string; h1: number; h2: number; h3: number
  b1: number; b2: number; b3: number; carryover_percent: number | null
  manufacturer_limit: number; passed: number; notes?: string
}

function sdi(pct: number | null, limit: number) {
  if (pct == null || !isFinite(pct) || !isFinite(limit) || limit === 0) return null
  return Math.abs(pct) / limit
}

export default function Carryover() {
  const { role } = useAuthStore()
  const canDelete = ['admin', 'director'].includes(role ?? '')

  const [educationOpen, setEducationOpen] = useState(false)
  const [showForm, setShowForm]           = useState(false)
  const [analytes, setAnalytes]           = useState<Analyte[]>([])
  const [studies, setStudies]             = useState<Study[]>([])
  const [saving, setSaving]               = useState(false)
  const [msg, setMsg]                     = useState<{ text: string; ok: boolean } | null>(null)

  // Form state
  const [analyteId, setAnalyteId]     = useState('')
  const [instrument, setInstrument]   = useState('')
  const [operator, setOperator]       = useState('')
  const [studyDate, setStudyDate]     = useState(new Date().toISOString().split('T')[0])
  const [sampleDesc, setSampleDesc]   = useState('')
  const [mfrLimit, setMfrLimit]       = useState('')
  const [notes, setNotes]             = useState('')
  const [h1, setH1] = useState(''); const [h2, setH2] = useState(''); const [h3, setH3] = useState('')
  const [b1, setB1] = useState(''); const [b2, setB2] = useState(''); const [b3, setB3] = useState('')

  // Chart analyte filter
  const [chartAnalyte, setChartAnalyte] = useState('')

  function notify(text: string, ok: boolean) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3500)
  }

  useEffect(() => {
    api.get<{ data: Analyte[] }>('/analytes').then(r => setAnalytes(r.data))
    loadStudies()
  }, [])

  function loadStudies() {
    api.get<{ data: Study[] }>('/performance/carryover').then(r => setStudies(r.data))
  }

  // Live carryover calculation
  const carryoverPct = useMemo(() => {
    const H3 = parseFloat(h3); const B1 = parseFloat(b1); const B3 = parseFloat(b3)
    if (!isFinite(H3) || !isFinite(B1) || !isFinite(B3) || H3 === 0) return null
    return ((B1 - B3) / H3) * 100
  }, [h3, b1, b3])

  const mfrLimitNum = parseFloat(mfrLimit)
  const livePassed  = carryoverPct != null && isFinite(mfrLimitNum)
    ? Math.abs(carryoverPct) <= mfrLimitNum
    : null

  async function saveStudy() {
    if (!instrument || !operator || !mfrLimit) { notify('Instrument, operator, and limit are required.', false); return }
    const vals = [h1, h2, h3, b1, b2, b3].map(v => parseFloat(v))
    if (vals.some(v => !isFinite(v))) { notify('All 6 replicate values are required.', false); return }
    setSaving(true)
    try {
      await api.post('/performance/carryover', {
        analyte_id: analyteId || undefined, instrument, operator, study_date: studyDate,
        sample_description: sampleDesc || undefined,
        h1: vals[0], h2: vals[1], h3: vals[2],
        b1: vals[3], b2: vals[4], b3: vals[5],
        manufacturer_limit: mfrLimitNum, notes: notes || undefined,
      })
      notify('Carryover study saved.', true)
      resetForm()
      setShowForm(false)
      loadStudies()
    } catch (e: any) { notify(e.message, false) }
    finally { setSaving(false) }
  }

  function resetForm() {
    setAnalyteId(''); setInstrument(''); setOperator('')
    setStudyDate(new Date().toISOString().split('T')[0])
    setSampleDesc(''); setMfrLimit(''); setNotes('')
    setH1(''); setH2(''); setH3(''); setB1(''); setB2(''); setB3('')
  }

  async function deleteStudy(id: string) {
    if (!confirm('Delete this carryover study?')) return
    try {
      await api.delete(`/performance/carryover/${id}`)
      setStudies(prev => prev.filter(s => s.id !== id))
    } catch (e: any) { notify(e.message, false) }
  }

  // Chart data
  const chartData = useMemo(() => {
    const filtered = chartAnalyte
      ? studies.filter(s => s.analyte_name === chartAnalyte || s.id === chartAnalyte)
      : studies
    return filtered
      .filter(s => s.carryover_percent != null)
      .slice().reverse()
      .map(s => ({
        date: s.study_date,
        pct: parseFloat(s.carryover_percent!.toFixed(4)),
        limit: s.manufacturer_limit,
        passed: s.passed,
      }))
  }, [studies, chartAnalyte])

  const uniqueAnalytes = [...new Set(studies.map(s => s.analyte_name).filter(Boolean))]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Droplets size={20} className="text-cyan-400" /> Carryover Studies
        </h1>
        <div className="flex gap-2">
          <button onClick={loadStudies} className="p-2 text-gray-500 hover:text-gray-300 transition-colors" title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} /> New Study
          </button>
        </div>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${msg.ok ? 'bg-green-900/30 border-green-700 text-green-300' : 'bg-red-900/30 border-red-700 text-red-300'}`}>
          {msg.text}
        </div>
      )}

      {/* Education panel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setEducationOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-300 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2">
            <BookOpen size={15} className="text-cyan-400" /> What is Carryover? (CLSI EP10)
          </span>
          {educationOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {educationOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-gray-800">
            <div className="grid md:grid-cols-2 gap-4 pt-4">
              <div className="space-y-2 text-sm text-gray-400">
                <p><strong className="text-gray-200">Definition:</strong> Contamination of a test result by a preceding high-concentration sample, causing a falsely elevated result for the next patient.</p>
                <p><strong className="text-gray-200">Common causes:</strong> Dirty flow cell or aperture, insufficient wash cycles, viscous or high-protein samples.</p>
                <p><strong className="text-gray-200">Clinical impact:</strong> Can cause false positives in next patient — e.g., high HCG sample followed by a negative.</p>
                <p><strong className="text-gray-200">Regulatory:</strong> CAP COM.01100 — carryover must be documented and within manufacturer limits.</p>
              </div>
              <div className="space-y-3">
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Formula</div>
                  <div className="font-mono text-sm text-cyan-300">
                    Carryover % = (B1 − B3) / H3 × 100
                  </div>
                  <div className="text-xs text-gray-500 mt-2 space-y-0.5">
                    <div>H1, H2, H3 = three replicates of high-concentration sample</div>
                    <div>B1, B2, B3 = three replicates of blank/diluent run immediately after</div>
                  </div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Protocol Steps</div>
                  <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                    <li>Prepare HIGH concentration sample</li>
                    <li>Run high sample 3× consecutively (H1, H2, H3)</li>
                    <li>WITHOUT cleaning, run diluent/blank 3× (B1, B2, B3)</li>
                    <li>Record all 6 values and calculate</li>
                    <li>Compare to manufacturer limit</li>
                    <li>If failed: clean, repeat, document corrective action</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New study form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">New Carryover Study</h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Analyte</label>
              <select value={analyteId} onChange={e => setAnalyteId(e.target.value)} className={inp}>
                <option value="">— Select —</option>
                {analytes.map(a => <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Instrument</label>
              <input value={instrument} onChange={e => setInstrument(e.target.value)} className={inp} placeholder="e.g. Sysmex XN-1000" />
            </div>
            <div>
              <label className={lbl}>Operator</label>
              <input value={operator} onChange={e => setOperator(e.target.value)} className={inp} placeholder="Operator name" />
            </div>
            <div>
              <label className={lbl}>Study Date</label>
              <input type="date" value={studyDate} onChange={e => setStudyDate(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Mfr. Limit (%)</label>
              <input type="number" step="0.1" value={mfrLimit} onChange={e => setMfrLimit(e.target.value)}
                className={inp} placeholder="e.g. 1.5" />
            </div>
            <div>
              <label className={lbl}>High Sample Description</label>
              <input value={sampleDesc} onChange={e => setSampleDesc(e.target.value)} className={inp} placeholder="e.g. 10× normal glucose" />
            </div>
          </div>

          {/* 6-cell value grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-2">
              <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-3">High Sample</div>
              {[['H1', h1, setH1], ['H2', h2, setH2], ['H3', h3, setH3]].map(([label, val, set]) => (
                <div key={label as string} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-400 w-6">{label as string}</span>
                  <input type="number" step="any" value={val as string}
                    onChange={e => (set as (v: string) => void)(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 flex-1" />
                </div>
              ))}
            </div>
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-2">
              <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-3">Blank / Diluent</div>
              {[['B1', b1, setB1], ['B2', b2, setB2], ['B3', b3, setB3]].map(([label, val, set]) => (
                <div key={label as string} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-gray-400 w-6">{label as string}</span>
                  <input type="number" step="any" value={val as string}
                    onChange={e => (set as (v: string) => void)(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 flex-1" />
                </div>
              ))}
            </div>
          </div>

          {/* Live result */}
          {carryoverPct != null && (
            <div className={`rounded-lg p-4 border ${livePassed ? 'bg-green-900/20 border-green-700' : 'bg-red-900/20 border-red-700'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-200">Live Result</span>
                {livePassed != null && (
                  livePassed
                    ? <span className="flex items-center gap-1 text-green-400 text-sm font-bold"><CheckCircle2 size={15} /> PASS</span>
                    : <span className="flex items-center gap-1 text-red-400 text-sm font-bold"><XCircle size={15} /> FAIL</span>
                )}
              </div>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-2xl font-bold font-mono text-white">{carryoverPct.toFixed(4)}%</span>
                {isFinite(mfrLimitNum) && <span className="text-sm text-gray-400">limit: {mfrLimitNum}%</span>}
              </div>
              {isFinite(mfrLimitNum) && mfrLimitNum > 0 && (
                <div className="relative h-4 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all ${livePassed ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, (Math.abs(carryoverPct) / mfrLimitNum) * 100)}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-end pr-2">
                    <span className="text-xs text-white font-medium">
                      {((Math.abs(carryoverPct) / mfrLimitNum) * 100).toFixed(0)}% of limit
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className={lbl}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className={`${inp} resize-none`} placeholder="Optional notes or corrective action…" />
          </div>

          <div className="flex gap-2">
            <button onClick={saveStudy} disabled={saving} className={btn}>
              {saving ? 'Saving…' : 'Save Study'}
            </button>
            <button onClick={() => { setShowForm(false); resetForm() }}
              className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Trend chart */}
      {chartData.length > 1 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Carryover Trend</h2>
            <select
              value={chartAnalyte}
              onChange={e => setChartAnalyte(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
            >
              <option value="">All analytes</option>
              {uniqueAnalytes.map(a => <option key={a} value={a!}>{a}</option>)}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#9CA3AF' }}
                formatter={(v: any) => [`${v.toFixed(4)}%`, 'Carryover']}
              />
              {chartData[0]?.limit != null && (
                <ReferenceLine y={chartData[0].limit} stroke="#EF4444" strokeDasharray="4 4"
                  label={{ value: 'Limit', fill: '#EF4444', fontSize: 11 }} />
              )}
              <Line type="monotone" dataKey="pct" stroke="#22D3EE" strokeWidth={2} dot={{ r: 4, fill: '#22D3EE' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* History table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Study History</h2>
        </div>
        {studies.length === 0
          ? <p className="px-5 py-8 text-sm text-gray-600 text-center">No studies recorded yet</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Date', 'Analyte', 'Instrument', 'Carryover %', 'Limit', 'Result', 'Operator', ''].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {studies.map(s => (
                    <tr key={s.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{s.study_date}</td>
                      <td className="px-4 py-2.5 text-gray-200">{s.analyte_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{s.instrument}</td>
                      <td className="px-4 py-2.5 font-mono text-gray-200">
                        {s.carryover_percent != null ? `${s.carryover_percent.toFixed(4)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{s.manufacturer_limit}%</td>
                      <td className="px-4 py-2.5">
                        {s.carryover_percent != null
                          ? s.passed
                            ? <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle2 size={13} /> Pass</span>
                            : <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle size={13} /> Fail</span>
                          : <span className="text-gray-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{s.operator}</td>
                      <td className="px-4 py-2.5">
                        {canDelete && (
                          <button onClick={() => deleteStudy(s.id)}
                            className="p-1 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded transition-colors">
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
    </div>
  )
}
