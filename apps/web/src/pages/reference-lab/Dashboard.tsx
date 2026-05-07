import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { api } from '../../lib/api'
import {
  FlaskConical, ArrowRight, CheckCircle2, Clock, AlertTriangle,
  BarChart3, Calculator, GitBranch, Layers, Search, Loader2,
} from 'lucide-react'

type DirectStudy = { id: string; analyte_name: string; status: string; lower_limit: number | null; upper_limit: number | null; unit: string; n_subjects: number; created_at: string }
type TransStudy = { id: string; analyte_name: string; result: string; pct_within: number | null; n_samples: number; created_at: string }

const RESULT_COLOR: Record<string, string> = {
  pass: 'text-green-400', borderline: 'text-amber-400', fail: 'text-red-400', pending: 'text-gray-500',
}
const STATUS_COLOR: Record<string, string> = {
  complete: 'text-green-400', in_progress: 'text-amber-400',
}

const SECTIONS = [
  { to: '/reference-lab/search',       icon: Search,      label: 'RI Search Engine',   color: 'text-brand-400',  desc: '100+ published reference intervals from WHO, NHANES, ACC/AHA' },
  { to: '/reference-lab/direct',       icon: FlaskConical, label: 'Direct Establishment', color: 'text-blue-400', desc: 'De novo RI from 120+ healthy subjects (CLSI EP28-A3c)' },
  { to: '/reference-lab/transference', icon: CheckCircle2, label: 'Transference Verification', color: 'text-green-400', desc: '20-sample verification against a published RI' },
  { to: '/reference-lab/indirect',     icon: Layers,      label: 'Indirect Method',    color: 'text-purple-400', desc: 'Hoffmann/Bhattacharya from routine patient data' },
  { to: '/reference-lab/qc-ranges',   icon: BarChart3,   label: 'QC Ranges from RI',  color: 'text-orange-400', desc: 'Derive Westgard QC target and SD limits from your RI' },
  { to: '/reference-lab/stratification', icon: GitBranch, label: 'Stratification',     color: 'text-cyan-400',   desc: 'Harris-Boyd criterion — should you split RI by sex or age?' },
  { to: '/reference-lab/calculators',  icon: Calculator,  label: 'Statistical Tools',  color: 'text-pink-400',   desc: 'Dixon Q, Grubbs, Box-Cox, outlier detection, percentile calc' },
]

export default function RefLabDashboard() {
  const [direct, setDirect]   = useState<DirectStudy[]>([])
  const [trans, setTrans]     = useState<TransStudy[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<{ data: DirectStudy[] }>('/reference-lab/direct').catch(() => ({ data: [] })),
      api.get<{ data: TransStudy[] }>('/reference-lab/transference').catch(() => ({ data: [] })),
    ]).then(([d, t]) => {
      setDirect((d as any).data ?? [])
      setTrans((t as any).data ?? [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={28} className="animate-spin text-brand-400" />
    </div>
  )

  const completeStudies = direct.filter(d => d.status === 'complete').length
  const passedTrans = trans.filter(t => t.result === 'pass').length

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <FlaskConical size={20} className="text-teal-400" /> Reference Lab
      </h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Direct Studies', value: direct.length, sub: `${completeStudies} complete`, color: 'text-blue-400' },
          { label: 'Transference', value: trans.length, sub: `${passedTrans} passed`, color: 'text-green-400' },
          { label: 'Published RIs', value: '100+', sub: 'searchable entries', color: 'text-brand-400' },
          { label: 'CLSI Standard', value: 'EP28-A3c', sub: 'compliant workflow', color: 'text-teal-400' },
        ].map(c => (
          <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs font-medium text-gray-300 mt-1">{c.label}</div>
            <div className="text-xs text-gray-500">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map(s => (
          <NavLink
            key={s.to}
            to={s.to}
            className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-4 flex flex-col gap-2 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <s.icon size={18} className={s.color} />
              <ArrowRight size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
            </div>
            <div className="font-semibold text-white text-sm">{s.label}</div>
            <div className="text-xs text-gray-500 leading-relaxed">{s.desc}</div>
          </NavLink>
        ))}
      </div>

      {/* Recent activities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent direct studies */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-white">Recent Direct Studies</span>
            <NavLink to="/reference-lab/direct" className="text-xs text-brand-400 hover:text-brand-300">View all</NavLink>
          </div>
          {direct.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-600">No studies yet</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {direct.slice(0, 4).map(d => (
                <NavLink key={d.id} to={`/reference-lab/direct/${d.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-800 transition-colors">
                  <div>
                    <div className="text-sm text-gray-200">{d.analyte_name}</div>
                    <div className="text-xs text-gray-500">n={d.n_subjects}</div>
                  </div>
                  <div className="text-right">
                    {d.lower_limit != null ? (
                      <div className="text-xs text-brand-300">{d.lower_limit}–{d.upper_limit} {d.unit}</div>
                    ) : null}
                    <div className={`text-xs ${STATUS_COLOR[d.status] ?? 'text-gray-500'} capitalize`}>{d.status.replace('_', ' ')}</div>
                  </div>
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {/* Recent transference studies */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-white">Recent Transference</span>
            <NavLink to="/reference-lab/transference" className="text-xs text-brand-400 hover:text-brand-300">View all</NavLink>
          </div>
          {trans.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-gray-600">No studies yet</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {trans.slice(0, 4).map(t => (
                <NavLink key={t.id} to={`/reference-lab/transference/${t.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-800 transition-colors">
                  <div>
                    <div className="text-sm text-gray-200">{t.analyte_name}</div>
                    <div className="text-xs text-gray-500">n={t.n_samples} samples</div>
                  </div>
                  <div className="text-right">
                    {t.pct_within != null && (
                      <div className="text-xs text-gray-400">{t.pct_within.toFixed(0)}% within RI</div>
                    )}
                    <div className={`text-xs font-medium capitalize ${RESULT_COLOR[t.result] ?? 'text-gray-500'}`}>
                      {t.result}
                    </div>
                  </div>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CLSI Quick Guide */}
      <div className="bg-blue-900/10 border border-blue-800 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-blue-300 flex items-center gap-2">
          <Clock size={14} /> CLSI EP28-A3c Quick Reference
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-400">
          <div className="space-y-1">
            <div className="font-semibold text-gray-300">De Novo Establishment</div>
            <div>• Minimum 120 healthy reference individuals</div>
            <div>• Apply strict inclusion/exclusion criteria</div>
            <div>• Use nonparametric (2.5th–97.5th) or parametric method</div>
            <div>• Report 90% CI for each limit</div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-gray-300">Transference Verification</div>
            <div>• Minimum 20 samples from healthy individuals</div>
            <div>• ≥18/20 within RI → PASS (adopt RI as-is)</div>
            <div>• 17/20 → expand to 60 samples</div>
            <div>• ≤16/20 → FAIL (establish own RI)</div>
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-gray-300">Indirect Methods</div>
            <div>• Use routine patient data (100-1000+ values)</div>
            <div>• Hoffmann: normal probability plot regression</div>
            <div>• Bhattacharya: distribution decomposition</div>
            <div>• Useful for analytes requiring large datasets</div>
          </div>
        </div>
      </div>
    </div>
  )
}
