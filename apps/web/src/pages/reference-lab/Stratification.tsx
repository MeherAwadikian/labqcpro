import { useState, useMemo } from 'react'
import { GitBranch, Info } from 'lucide-react'

const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full'
const lbl = 'text-xs text-gray-400 mb-1 block'

// ─── F-test critical value approximation (α=0.05) ─────────────────────────────
function fCritApprox(df1: number, df2: number): number {
  // Simplified approximation; good enough for guidance
  if (df1 >= 100 && df2 >= 100) return 1.25
  if (df1 >= 60 && df2 >= 60)   return 1.40
  if (df1 >= 30 && df2 >= 30)   return 1.65
  if (df1 >= 20 && df2 >= 20)   return 1.84
  if (df1 >= 10 && df2 >= 10)   return 2.35
  return 2.70
}

// ─── Harris-Boyd Criterion ────────────────────────────────────────────────────
function harrisBoydon(mean1: number, sd1: number, mean2: number, sd2: number): number {
  return Math.abs(mean1 - mean2) / ((sd1 + sd2) / 2)
}

export default function Stratification() {
  const [analyte, setAnalyte] = useState('')
  const [unit, setUnit]       = useState('')
  const [g1name, setG1name]   = useState('Male')
  const [g2name, setG2name]   = useState('Female')
  const [g1mean, setG1mean]   = useState('')
  const [g1sd, setG1sd]       = useState('')
  const [g1n, setG1n]         = useState('')
  const [g2mean, setG2mean]   = useState('')
  const [g2sd, setG2sd]       = useState('')
  const [g2n, setG2n]         = useState('')

  const result = useMemo(() => {
    const m1 = parseFloat(g1mean), s1 = parseFloat(g1sd), n1 = parseInt(g1n)
    const m2 = parseFloat(g2mean), s2 = parseFloat(g2sd), n2 = parseInt(g2n)
    if ([m1, s1, n1, m2, s2, n2].some(isNaN)) return null
    if (s1 <= 0 || s2 <= 0 || n1 < 2 || n2 < 2) return null

    const bc = harrisBoydon(m1, s1, m2, s2)
    const recommend = bc > 0.3

    // F-test for SD equality
    const larger = s1 >= s2 ? s1 : s2
    const smaller = s1 < s2 ? s1 : s2
    const dfLarger = (s1 >= s2 ? n1 : n2) - 1
    const dfSmaller = (s1 < s2 ? n1 : n2) - 1
    const F = (larger / smaller) ** 2
    const fCrit = fCritApprox(dfLarger, dfSmaller)
    const sdDifferent = F > fCrit

    // 95% CI for the difference in means (approximate)
    const seDiff = Math.sqrt(s1 * s1 / n1 + s2 * s2 / n2)
    const diff = Math.abs(m1 - m2)
    const ci95 = 1.96 * seDiff

    return { bc: Math.round(bc * 1000) / 1000, recommend, F: Math.round(F * 100) / 100, fCrit, sdDifferent, diff: Math.round(diff * 1000) / 1000, ci95: Math.round(ci95 * 1000) / 1000 }
  }, [g1mean, g1sd, g1n, g2mean, g2sd, g2n])

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <GitBranch size={18} className="text-cyan-400" />
        Stratification Analysis
      </h1>

      <div className="bg-cyan-900/10 border border-cyan-800 rounded-xl p-4 text-xs text-cyan-300 space-y-2">
        <div className="font-semibold">Harris-Boyd Criterion — Should you partition this RI?</div>
        <div>
          Enter the mean and SD from two groups (e.g., male vs female, or two age groups).
          The <strong>Harris-Boyd BC</strong> quantifies whether the groups are sufficiently different to warrant separate reference intervals.
          BC &gt; 0.3 indicates partitioning is recommended.
        </div>
        <div className="text-gray-400">Formula: BC = |mean₁ − mean₂| / [(SD₁ + SD₂) / 2]</div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Analyte</label>
            <input value={analyte} onChange={e => setAnalyte(e.target.value)} className={inp} placeholder="e.g. Hemoglobin" />
          </div>
          <div>
            <label className={lbl}>Unit</label>
            <input value={unit} onChange={e => setUnit(e.target.value)} className={inp} placeholder="e.g. g/dL" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* Group 1 */}
          <div className="bg-gray-800 rounded-xl p-4 space-y-3">
            <input value={g1name} onChange={e => setG1name(e.target.value)}
              className="text-sm font-semibold text-blue-300 bg-transparent border-none outline-none w-full" />
            <div>
              <label className={lbl}>Mean</label>
              <input type="number" step="any" value={g1mean} onChange={e => setG1mean(e.target.value)} className={inp} placeholder="15.5" />
            </div>
            <div>
              <label className={lbl}>SD</label>
              <input type="number" step="any" value={g1sd} onChange={e => setG1sd(e.target.value)} className={inp} placeholder="1.2" />
            </div>
            <div>
              <label className={lbl}>n (sample size)</label>
              <input type="number" value={g1n} onChange={e => setG1n(e.target.value)} className={inp} placeholder="120" />
            </div>
          </div>

          {/* Group 2 */}
          <div className="bg-gray-800 rounded-xl p-4 space-y-3">
            <input value={g2name} onChange={e => setG2name(e.target.value)}
              className="text-sm font-semibold text-pink-300 bg-transparent border-none outline-none w-full" />
            <div>
              <label className={lbl}>Mean</label>
              <input type="number" step="any" value={g2mean} onChange={e => setG2mean(e.target.value)} className={inp} placeholder="13.5" />
            </div>
            <div>
              <label className={lbl}>SD</label>
              <input type="number" step="any" value={g2sd} onChange={e => setG2sd(e.target.value)} className={inp} placeholder="1.0" />
            </div>
            <div>
              <label className={lbl}>n (sample size)</label>
              <input type="number" value={g2n} onChange={e => setG2n(e.target.value)} className={inp} placeholder="120" />
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          {/* BC result */}
          <div className={`rounded-xl p-5 border ${result.recommend ? 'bg-green-900/15 border-green-700' : 'bg-amber-900/15 border-amber-700'}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`text-4xl font-bold ${result.recommend ? 'text-green-300' : 'text-amber-300'}`}>
                BC = {result.bc}
              </div>
              <div>
                <div className={`text-sm font-semibold ${result.recommend ? 'text-green-300' : 'text-amber-300'}`}>
                  {result.recommend ? '✅ Partition Recommended' : '⚠️ Partition Not Warranted'}
                </div>
                <div className="text-xs text-gray-400">
                  {result.recommend
                    ? 'BC > 0.3 — groups are significantly different. Use separate RIs.'
                    : 'BC ≤ 0.3 — groups are not different enough. A combined RI is acceptable.'}
                </div>
              </div>
            </div>

            {/* BC visual */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>0</span><span className="text-amber-500">0.3 (threshold)</span><span>1.0+</span>
              </div>
              <div className="h-4 bg-gray-700 rounded-full overflow-hidden relative">
                <div
                  className={`h-full rounded-full ${result.recommend ? 'bg-green-500' : 'bg-amber-500'}`}
                  style={{ width: `${Math.min(result.bc / 1.5 * 100, 100)}%` }}
                />
                <div className="absolute top-0 h-full w-0.5 bg-white/40" style={{ left: `${0.3 / 1.5 * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Detailed stats */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Statistical Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              {[
                ['Mean difference', `${result.diff} ${unit}`],
                ['95% CI of diff.', `±${result.ci95} ${unit}`],
                ['F-statistic', result.F],
                ['F critical (α=0.05)', result.fCrit],
                ['SD equality', result.sdDifferent ? '❌ SDs differ significantly' : '✅ SDs comparable'],
                ['Partition BC', `${result.bc} (threshold: 0.3)`],
              ].map(([k, v]) => (
                <div key={k as string} className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-500">{k}</div>
                  <div className="text-sm text-white font-medium">{v}</div>
                </div>
              ))}
            </div>

            {result.sdDifferent && (
              <div className="text-xs text-amber-300 bg-amber-900/10 border border-amber-800 rounded px-3 py-2 flex gap-2">
                <Info size={11} className="flex-shrink-0 mt-0.5" />
                The SDs of the two groups differ significantly (F = {result.F} &gt; {result.fCrit}). This may indicate different biological variability between groups and further supports partitioning.
              </div>
            )}
          </div>

          {/* Interpretation guide */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-400 space-y-2">
            <div className="font-semibold text-gray-300">Harris-Boyd Partitioning Criteria</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-2 bg-gray-800 rounded">
                <div className="font-medium text-amber-300">BC ≤ 0.3</div>
                <div>Groups are similar. A single combined RI is statistically justified.</div>
              </div>
              <div className="p-2 bg-gray-800 rounded">
                <div className="font-medium text-orange-300">BC 0.3 – 0.5</div>
                <div>Borderline — consider clinical relevance. Partitioning may be appropriate.</div>
              </div>
              <div className="p-2 bg-gray-800 rounded">
                <div className="font-medium text-green-300">BC &gt; 0.5</div>
                <div>Clearly different. Separate RIs are strongly recommended.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
