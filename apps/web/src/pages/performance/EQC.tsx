import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import {
  Users, Plus, Trash2, RefreshCw, ChevronDown, ChevronUp,
  BookOpen, CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'

const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'
const lbl = 'text-xs text-gray-400 mb-1 block'
const btn = 'bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50'

type Analyte = { id: string; name: string; unit: string }
type Comparison = {
  id: string; analyte_id: string; analyte_name?: string; unit?: string
  program_name: string; comparison_period: string
  lab_mean: number; peer_mean: number; peer_sd: number
  sdi?: number; peer_group_n?: number; percentile_rank?: number
  bias_from_peer?: number; accepted: number; notes?: string; created_at: string
}

function sdiClass(sdi: number | null | undefined) {
  if (sdi == null) return { bg: 'bg-gray-800', text: 'text-gray-400', label: '—' }
  const abs = Math.abs(sdi)
  if (abs > 3) return { bg: 'bg-red-900/40', text: 'text-red-300 font-bold', label: `${sdi.toFixed(2)} ⚠` }
  if (abs > 2) return { bg: 'bg-red-900/20', text: 'text-red-400', label: sdi.toFixed(2) }
  if (abs > 1) return { bg: 'bg-amber-900/20', text: 'text-amber-400', label: sdi.toFixed(2) }
  return { bg: '', text: 'text-green-400', label: sdi.toFixed(2) }
}

export default function EQC() {
  const { role } = useAuthStore()
  const canDelete = ['admin', 'director'].includes(role ?? '')

  const [analytes, setAnalytes]   = useState<Analyte[]>([])
  const [comps, setComps]         = useState<Comparison[]>([])
  const [showForm, setShowForm]   = useState(false)
  const [eduOpen, setEduOpen]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null)
  const [chartAnalyte, setChartA] = useState('')
  const [filterAnalyte, setFilter] = useState('')

  // Form
  const [analyteId, setAnalyteId]   = useState('')
  const [program, setProgram]       = useState('CAP')
  const [period, setPeriod]         = useState('')
  const [labMean, setLabMean]       = useState('')
  const [peerMean, setPeerMean]     = useState('')
  const [peerSd, setPeerSd]         = useState('')
  const [peerN, setPeerN]           = useState('')
  const [percentile, setPercentile] = useState('')
  const [notes, setNotes]           = useState('')

  function notify(text: string, ok: boolean) {
    setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000)
  }

  useEffect(() => {
    api.get<{ data: Analyte[] }>('/analytes').then(r => setAnalytes(r.data))
    loadComps()
  }, [])

  function loadComps() {
    api.get<{ data: Comparison[] }>('/performance/eqc').then(r => setComps(r.data))
  }

  // Live SDI calculation
  const liveSdi = useMemo(() => {
    const lm = parseFloat(labMean)
    const pm = parseFloat(peerMean)
    const ps = parseFloat(peerSd)
    if (!isFinite(lm) || !isFinite(pm) || !isFinite(ps) || ps === 0) return null
    return (lm - pm) / ps
  }, [labMean, peerMean, peerSd])

  async function saveComparison() {
    if (!program || !period || !labMean || !peerMean || !peerSd) {
      notify('Program, period, lab mean, peer mean, and peer SD are required.', false); return
    }
    const lm = parseFloat(labMean), pm = parseFloat(peerMean), ps = parseFloat(peerSd)
    if (!isFinite(lm) || !isFinite(pm) || !isFinite(ps)) {
      notify('Lab mean, peer mean, and peer SD must be numbers.', false); return
    }
    setSaving(true)
    try {
      await api.post('/performance/eqc', {
        analyte_id: analyteId || undefined,
        program_name: program, comparison_period: period,
        lab_mean: lm, peer_mean: pm, peer_sd: ps,
        peer_group_n: parseInt(peerN) || undefined,
        percentile_rank: parseFloat(percentile) || undefined,
        notes: notes || undefined,
      })
      notify('Peer comparison saved.', true)
      setAnalyteId(''); setProgram('CAP'); setPeriod(''); setLabMean('')
      setPeerMean(''); setPeerSd(''); setPeerN(''); setPercentile(''); setNotes('')
      setShowForm(false)
      loadComps()
    } catch (e: any) { notify(e.message, false) }
    finally { setSaving(false) }
  }

  async function deleteComp(id: string) {
    if (!confirm('Delete this peer comparison?')) return
    try {
      await api.delete(`/performance/eqc/${id}`)
      setComps(prev => prev.filter(c => c.id !== id))
    } catch (e: any) { notify(e.message, false) }
  }

  // Chart data for selected analyte
  const chartData = useMemo(() => {
    const name = chartAnalyte || (comps[0]?.analyte_name ?? '')
    return comps
      .filter(c => c.analyte_name === name)
      .slice().reverse()
      .map(c => ({
        period: c.comparison_period,
        sdi: c.sdi != null ? parseFloat(c.sdi.toFixed(3)) : null,
        bias: c.bias_from_peer != null ? parseFloat(c.bias_from_peer.toFixed(4)) : null,
      }))
  }, [comps, chartAnalyte])

  const uniqueAnalytes = [...new Set(comps.map(c => c.analyte_name).filter(Boolean))]
  const filtered = filterAnalyte ? comps.filter(c => c.analyte_name === filterAnalyte) : comps
  const alertCount = comps.filter(c => c.sdi != null && Math.abs(c.sdi) > 2.0).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Users size={20} className="text-blue-400" /> External QC / Peer Comparison
          {alertCount > 0 && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-300 border border-red-700">
              {alertCount} SDI alert{alertCount > 1 ? 's' : ''}
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          <button onClick={loadComps} className="p-2 text-gray-500 hover:text-gray-300 transition-colors"><RefreshCw size={15} /></button>
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} /> Add Comparison
          </button>
        </div>
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
          <span className="flex items-center gap-2"><BookOpen size={15} className="text-blue-400" /> About EQC & Peer Comparisons</span>
          {eduOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {eduOpen && (
          <div className="px-5 pb-5 space-y-3 border-t border-gray-800 pt-4 text-sm text-gray-400">
            <p>External QC programs provide peer group comparison data to assess how your lab's results compare to other laboratories using the same or similar methods.</p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-800 rounded-lg p-3 space-y-2">
                <div className="text-xs font-semibold text-gray-200 uppercase tracking-wide">SDI — Standard Deviation Index</div>
                <div className="font-mono text-xs text-blue-300">SDI = (Lab Mean − Peer Mean) / Peer SD</div>
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex items-center gap-2"><span className="w-20 text-green-400">SDI ≤ ±1.0</span><span>Excellent — within 1 SD of peer</span></div>
                  <div className="flex items-center gap-2"><span className="w-20 text-amber-400">SDI ±1–2</span><span>Acceptable — monitor trend</span></div>
                  <div className="flex items-center gap-2"><span className="w-20 text-red-400">SDI &gt; ±2.0</span><span>Investigate — systematic bias</span></div>
                  <div className="flex items-center gap-2"><span className="w-20 text-red-500 font-bold">SDI &gt; ±3.0</span><span>Critical — out of peer group</span></div>
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 space-y-2 text-xs">
                <div className="text-gray-200 font-semibold">CAP Survey Programs Include:</div>
                <div>• <strong className="text-gray-300">PT Surveys</strong> — blind unknown samples, scored against peer group</div>
                <div>• <strong className="text-gray-300">Peer Comparison</strong> — compare ongoing daily QC to peer labs</div>
                <div>• <strong className="text-gray-300">Accuracy-Based</strong> — compare to SI-traceable target values</div>
                <div>• <strong className="text-gray-300">Z-Score</strong> — similar to SDI, used in some programs</div>
                <div className="mt-1 text-gray-500">Bias from peer = Lab Mean − Peer Mean</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add comparison form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Add Peer Comparison</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Analyte</label>
              <select value={analyteId} onChange={e => setAnalyteId(e.target.value)} className={inp}>
                <option value="">— Select —</option>
                {analytes.map(a => <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Program Name</label>
              <input value={program} onChange={e => setProgram(e.target.value)} className={inp} placeholder="CAP, IQAS, etc." />
            </div>
            <div>
              <label className={lbl}>Comparison Period</label>
              <input value={period} onChange={e => setPeriod(e.target.value)} className={inp} placeholder="e.g. 2025-Q1 or 2025-01" />
            </div>
            <div>
              <label className={lbl}>Lab Mean</label>
              <input type="number" step="any" value={labMean} onChange={e => setLabMean(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Peer Group Mean</label>
              <input type="number" step="any" value={peerMean} onChange={e => setPeerMean(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Peer Group SD</label>
              <input type="number" step="any" value={peerSd} onChange={e => setPeerSd(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Peer Group N (optional)</label>
              <input type="number" value={peerN} onChange={e => setPeerN(e.target.value)} className={inp} placeholder="Number of labs" />
            </div>
            <div>
              <label className={lbl}>Percentile Rank (optional)</label>
              <input type="number" step="0.1" value={percentile} onChange={e => setPercentile(e.target.value)} className={inp} placeholder="e.g. 68.5" />
            </div>
          </div>

          {/* Live SDI display */}
          {liveSdi != null && (() => {
            const { bg, text, label } = sdiClass(liveSdi)
            const abs = Math.abs(liveSdi)
            return (
              <div className={`rounded-lg p-4 border ${abs > 2 ? 'border-red-700 bg-red-900/20' : abs > 1 ? 'border-amber-700 bg-amber-900/20' : 'border-green-700 bg-green-900/20'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-400">Calculated SDI: </span>
                    <span className={`text-xl font-bold font-mono ml-2 ${text}`}>{label}</span>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-gray-400">Bias: <span className="text-gray-200 font-mono">{(parseFloat(labMean) - parseFloat(peerMean)).toFixed(4)}</span></div>
                    {abs > 2 ? <div className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertTriangle size={12} /> Investigate required</div>
                     : abs > 1 ? <div className="text-amber-400 text-xs mt-1">Monitor trend</div>
                     : <div className="text-green-400 text-xs mt-1 flex items-center gap-1"><CheckCircle2 size={12} /> Acceptable</div>}
                  </div>
                </div>
              </div>
            )
          })()}

          <div>
            <label className={lbl}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className={`${inp} resize-none`} />
          </div>

          <div className="flex gap-2">
            <button onClick={saveComparison} disabled={saving} className={btn}>{saving ? 'Saving…' : 'Save Comparison'}</button>
            <button onClick={() => setShowForm(false)} className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* SDI trend chart */}
      {chartData.filter(d => d.sdi != null).length > 1 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">SDI Trend</h2>
            <select value={chartAnalyte} onChange={e => setChartA(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200">
              {uniqueAnalytes.map(a => <option key={a} value={a!}>{a}</option>)}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="period" tick={{ fill: '#6B7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} domain={[-4, 4]} />
              <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#9CA3AF' }} formatter={(v: any) => [v.toFixed(3), 'SDI']} />
              <ReferenceLine y={2}  stroke="#EF4444" strokeDasharray="4 2" label={{ value: '+2', fill: '#EF4444', fontSize: 10 }} />
              <ReferenceLine y={-2} stroke="#EF4444" strokeDasharray="4 2" label={{ value: '-2', fill: '#EF4444', fontSize: 10 }} />
              <ReferenceLine y={1}  stroke="#F59E0B" strokeDasharray="2 2" />
              <ReferenceLine y={-1} stroke="#F59E0B" strokeDasharray="2 2" />
              <ReferenceLine y={0}  stroke="#6B7280" />
              <Line type="monotone" dataKey="sdi" stroke="#60A5FA" strokeWidth={2} dot={{ r: 4, fill: '#60A5FA' }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Comparisons table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Peer Comparison History</h2>
          <select value={filterAnalyte} onChange={e => setFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200">
            <option value="">All analytes</option>
            {uniqueAnalytes.map(a => <option key={a} value={a!}>{a}</option>)}
          </select>
        </div>
        {filtered.length === 0
          ? <p className="px-5 py-8 text-sm text-gray-600 text-center">No peer comparisons recorded yet</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Period', 'Analyte', 'Program', 'Lab Mean', 'Peer Mean', 'Peer SD', 'SDI', 'Bias', 'Status', ''].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.map(c => {
                    const { bg, text, label } = sdiClass(c.sdi)
                    const abs = c.sdi != null ? Math.abs(c.sdi) : 0
                    return (
                      <tr key={c.id} className={`hover:bg-gray-800/30 transition-colors ${abs > 2 ? 'bg-red-900/10' : abs > 1 ? 'bg-amber-900/5' : ''}`}>
                        <td className="px-3 py-2.5 text-gray-400 text-xs">{c.comparison_period}</td>
                        <td className="px-3 py-2.5 text-gray-200">{c.analyte_name ?? '—'}</td>
                        <td className="px-3 py-2.5 text-gray-400 text-xs">{c.program_name}</td>
                        <td className="px-3 py-2.5 font-mono text-gray-200">{c.lab_mean}</td>
                        <td className="px-3 py-2.5 font-mono text-gray-400">{c.peer_mean}</td>
                        <td className="px-3 py-2.5 font-mono text-gray-400">{c.peer_sd}</td>
                        <td className={`px-3 py-2.5 font-mono font-bold ${text}`}>{label}</td>
                        <td className={`px-3 py-2.5 font-mono text-xs ${c.bias_from_peer != null && c.bias_from_peer > 0 ? 'text-amber-400' : 'text-blue-400'}`}>
                          {c.bias_from_peer != null ? (c.bias_from_peer > 0 ? '+' : '') + c.bias_from_peer.toFixed(4) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {c.accepted
                            ? <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle2 size={12} /> OK</span>
                            : <span className="flex items-center gap-1 text-red-400 text-xs"><AlertTriangle size={12} /> Alert</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {canDelete && (
                            <button onClick={() => deleteComp(c.id)}
                              className="p-1 text-gray-600 hover:text-red-400 rounded transition-colors">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Summary stats */}
      {comps.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-white mb-3">SDI Summary by Analyte</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {uniqueAnalytes.map(name => {
              const items = comps.filter(c => c.analyte_name === name && c.sdi != null)
              if (!items.length) return null
              const avgSdi = items.reduce((s, c) => s + Math.abs(c.sdi!), 0) / items.length
              const lastSdi = items[0]?.sdi
              const { text } = sdiClass(lastSdi)
              return (
                <div key={name} className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 truncate">{name}</div>
                  <div className={`text-lg font-bold font-mono mt-1 ${text}`}>
                    {lastSdi != null ? lastSdi.toFixed(2) : '—'}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">Last SDI · Avg {avgSdi.toFixed(2)}</div>
                  <div className="text-xs text-gray-600">{items.length} comparison{items.length > 1 ? 's' : ''}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
