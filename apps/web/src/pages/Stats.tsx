import { useEffect, useState, useMemo } from 'react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { Select, FormField, PageHeader, Spinner, Badge } from '../components/ui'
import { Trash2 } from 'lucide-react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts'

type Analyte       = { id: string; name: string; unit: string; tea?: number }
type ControlStats  = { level: string; mean: number; sd: number; cv: number; n: number; calculated_at: string }
type QCRun = {
  id: string; analyte_name: string; unit: string; value: number; run_date: string
  operator: string; lot_number: string; level: string; violations: string | null
}

const TABS = ['Statistics', 'Sigma Metrics', 'QC History'] as const
type TabId = typeof TABS[number]

function sigmaColor(s: number) {
  if (s >= 6) return 'text-green-400'
  if (s >= 4) return 'text-blue-400'
  if (s >= 3) return 'text-amber-400'
  return 'text-red-400'
}

function sigmaLabel(s: number) {
  if (s >= 6) return 'World-class — minimal QC needed'
  if (s >= 4) return 'Good — standard Westgard rules adequate'
  if (s >= 3) return 'Marginal — intensify QC, investigate method'
  return 'Poor — urgent method review required'
}

export default function Stats() {
  const { role } = useAuthStore()
  const canDelete = ['admin', 'director'].includes(role ?? '')

  const [analytes, setAnalytes]   = useState<Analyte[]>([])
  const [analyteId, setAnalyteId] = useState('')
  const [stats, setStats]         = useState<ControlStats[]>([])
  const [history, setHistory]     = useState<QCRun[]>([])
  const [loading, setLoading]     = useState(false)
  const [histLoading, setHistLoading] = useState(false)
  const [tab, setTab]             = useState<TabId>('Statistics')

  // Sigma inputs
  const [bias, setBias] = useState('')
  const [tea, setTea]   = useState('')

  useEffect(() => {
    api.get<{ data: Analyte[] }>('/analytes').then(r => setAnalytes(r.data))
  }, [])

  useEffect(() => {
    if (!analyteId) return
    setLoading(true)
    api.get<{ data: ControlStats[] }>(`/analytes/${analyteId}/stats`)
      .then(r => {
        setStats(r.data)
        // pre-fill TEa from analyte
        const a = analytes.find(x => x.id === analyteId)
        if (a?.tea) setTea(String(a.tea))
      })
      .finally(() => setLoading(false))
    loadHistory()
  }, [analyteId])

  function loadHistory() {
    if (!analyteId) return
    setHistLoading(true)
    api.get<{ data: QCRun[] }>(`/settings/qc-history?analyte_id=${analyteId}&limit=200`)
      .then(r => setHistory(r.data))
      .finally(() => setHistLoading(false))
  }

  async function deleteRun(id: string) {
    if (!confirm('Delete this QC run? This cannot be undone.')) return
    await api.delete(`/settings/qc-history/${id}`)
    setHistory(h => h.filter(r => r.id !== id))
  }

  const selectedAnalyte = analytes.find(a => a.id === analyteId)

  // Sigma calculations per level
  const sigmaData = useMemo(() =>
    stats.map(s => {
      const biasNum = bias !== '' ? parseFloat(bias) : 0
      const teaNum  = tea  !== '' ? parseFloat(tea)  : (selectedAnalyte?.tea ?? 10)
      const sigma   = s.cv > 0 ? (teaNum - Math.abs(biasNum)) / s.cv : 0
      return { level: s.level, mean: s.mean, sd: s.sd, cv: s.cv, n: s.n, sigma: +sigma.toFixed(2), tea: teaNum, bias: biasNum }
    }),
    [stats, bias, tea, selectedAnalyte]
  )

  return (
    <div>
      <PageHeader title="Control Statistics" subtitle="Statistics, sigma metrics, and QC run history" />

      <div className="flex gap-4 mb-5 flex-wrap items-end">
        <div className="w-56">
          <FormField label="Analyte">
            <Select value={analyteId} onChange={e => setAnalyteId(e.target.value)}>
              <option value="">Select…</option>
              {analytes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </FormField>
        </div>
      </div>

      {loading && <div className="flex justify-center py-16"><Spinner size={32} /></div>}

      {!loading && analyteId && (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-5 w-fit">
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  tab === t ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}>
                {t}
              </button>
            ))}
          </div>

          {/* ── Statistics tab ── */}
          {tab === 'Statistics' && (
            <>
              {stats.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center text-gray-500">
                  No statistics yet — add at least 5 QC runs for this analyte
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {stats.map(s => (
                    <div key={s.level} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Badge variant={s.level === 'normal' ? 'info' : 'warning'} className="capitalize">{s.level}</Badge>
                        <span className="text-sm text-gray-400">{selectedAnalyte?.unit}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Mean',    value: `${s.mean.toFixed(4)} ${selectedAnalyte?.unit ?? ''}` },
                          { label: 'SD (1σ)', value: `±${s.sd.toFixed(4)}` },
                          { label: '2SD',     value: `±${(s.sd * 2).toFixed(4)}` },
                          { label: '3SD',     value: `±${(s.sd * 3).toFixed(4)}` },
                          { label: 'CV%',     value: `${s.cv.toFixed(2)}%` },
                          { label: 'n',       value: s.n },
                        ].map(row => (
                          <div key={row.label} className="bg-gray-800/50 rounded-lg px-3 py-2">
                            <div className="text-xs text-gray-500 mb-1">{row.label}</div>
                            <div className="text-sm font-semibold text-brand-300">{row.value}</div>
                          </div>
                        ))}
                      </div>
                      <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${
                        s.cv < 2 ? 'bg-green-900/30 text-green-400' :
                        s.cv < 5 ? 'bg-blue-900/30 text-blue-400' :
                        s.cv < 10 ? 'bg-amber-900/30 text-amber-400' :
                        'bg-red-900/30 text-red-400'
                      }`}>
                        CV {s.cv < 2 ? '< 2% — Excellent precision' :
                            s.cv < 5 ? '2–5% — Good precision' :
                            s.cv < 10 ? '5–10% — Acceptable (verify)' :
                            '> 10% — Poor precision — investigate'}
                      </div>
                      <p className="text-xs text-gray-600 mt-2">Calculated: {new Date(s.calculated_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Sigma Metrics tab ── */}
          {tab === 'Sigma Metrics' && (
            <div className="space-y-5">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="font-semibold text-white text-sm mb-4">Sigma Parameters</h3>
                <p className="text-xs text-gray-400 mb-4">
                  σ = (TEa% − |Bias%|) / CV%  · σ ≥ 6: world-class · σ 4–6: good · σ 3–4: marginal · σ &lt; 3: poor
                </p>
                <div className="grid grid-cols-2 gap-4 max-w-xs">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">TEa (%)</label>
                    <input type="number" value={tea} onChange={e => setTea(e.target.value)} step="0.1"
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                      placeholder={selectedAnalyte?.tea ? String(selectedAnalyte.tea) : '10'} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Bias (% from mean)</label>
                    <input type="number" value={bias} onChange={e => setBias(e.target.value)} step="0.1"
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"
                      placeholder="0" />
                  </div>
                </div>
              </div>

              {sigmaData.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm">
                  No control statistics available — run QC first.
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {sigmaData.map(s => (
                    <div key={s.level} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <Badge variant={s.level === 'normal' ? 'info' : 'warning'} className="capitalize">{s.level}</Badge>
                        <div className="text-right">
                          <span className={`text-3xl font-bold ${sigmaColor(s.sigma)}`}>{s.sigma}σ</span>
                        </div>
                      </div>
                      <p className={`text-xs mb-4 ${sigmaColor(s.sigma)}`}>{sigmaLabel(s.sigma)}</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-gray-800 rounded-lg py-2 px-1">
                          <div className="text-xs text-gray-500">TEa</div>
                          <div className="text-sm font-semibold text-gray-200">{s.tea}%</div>
                        </div>
                        <div className="bg-gray-800 rounded-lg py-2 px-1">
                          <div className="text-xs text-gray-500">|Bias|</div>
                          <div className="text-sm font-semibold text-gray-200">{Math.abs(s.bias).toFixed(1)}%</div>
                        </div>
                        <div className="bg-gray-800 rounded-lg py-2 px-1">
                          <div className="text-xs text-gray-500">CV</div>
                          <div className="text-sm font-semibold text-gray-200">{s.cv.toFixed(2)}%</div>
                        </div>
                      </div>
                      <div className="mt-4 text-xs text-gray-500 space-y-1">
                        {s.sigma >= 6 && <p>✓ 1 QC level, once daily adequate</p>}
                        {s.sigma >= 4 && s.sigma < 6 && <p>↑ 2 QC levels, Westgard multirules recommended</p>}
                        {s.sigma >= 3 && s.sigma < 4 && <p>⚠ Intensify QC — 3 levels, every run</p>}
                        {s.sigma < 3 && <p>✗ Method performance unacceptable — investigate before reporting</p>}
                        <p>OPSpecs: N = {s.sigma >= 6 ? 'N=1, R=1' : s.sigma >= 4 ? 'N=2, 1₃s/2₂s/R₄s' : 'N=4, all rules'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── QC History tab ── */}
          {tab === 'QC History' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <h3 className="font-semibold text-white text-sm">QC Run History</h3>
                <button onClick={loadHistory} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Refresh</button>
              </div>
              {histLoading ? (
                <div className="flex justify-center py-10"><Spinner size={24} /></div>
              ) : history.length === 0 ? (
                <div className="p-10 text-center text-gray-500 text-sm">No QC runs found for this analyte.</div>
              ) : (
                <div className="overflow-auto max-h-[520px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-900">
                      <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-4 py-2">Level</th>
                        <th className="text-left px-4 py-2">Value</th>
                        <th className="text-left px-4 py-2">Lot #</th>
                        <th className="text-left px-4 py-2">Operator</th>
                        <th className="text-left px-4 py-2">Violations</th>
                        {canDelete && <th className="text-right px-4 py-2"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(r => {
                        const viols = r.violations ? r.violations.split(',').map(v => v.trim()).filter(Boolean) : []
                        const isReject = viols.some(v => v.includes(':reject'))
                        return (
                          <tr key={r.id} className={`border-b border-gray-800/50 ${isReject ? 'bg-red-900/10' : ''}`}>
                            <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">{r.run_date}</td>
                            <td className="px-4 py-2.5">
                              <Badge variant={r.level === 'normal' ? 'info' : 'warning'}>{r.level}</Badge>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-gray-200">{r.value} {r.unit}</td>
                            <td className="px-4 py-2.5 text-gray-400">{r.lot_number}</td>
                            <td className="px-4 py-2.5 text-gray-400">{r.operator}</td>
                            <td className="px-4 py-2.5">
                              {viols.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {viols.map(v => {
                                    const [rule, sev] = v.split(':')
                                    return (
                                      <span key={v} className={`text-xs px-1.5 py-0.5 rounded font-medium ${sev === 'reject' ? 'bg-red-900/40 text-red-400' : 'bg-amber-900/40 text-amber-400'}`}>
                                        {rule}
                                      </span>
                                    )
                                  })}
                                </div>
                              ) : <span className="text-xs text-green-400">✓</span>}
                            </td>
                            {canDelete && (
                              <td className="px-4 py-2.5 text-right">
                                <button onClick={() => deleteRun(r.id)}
                                  className="p-1 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-600">
                Showing up to 200 most recent runs · {canDelete ? 'Admin/Director can delete individual runs' : 'Contact admin to delete runs'}
              </div>
            </div>
          )}
        </>
      )}

      {!analyteId && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-center h-48 text-gray-500">
          Select an analyte to view statistics
        </div>
      )}
    </div>
  )
}
