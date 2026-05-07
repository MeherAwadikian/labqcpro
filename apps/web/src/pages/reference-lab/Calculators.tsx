import { useState, useMemo } from 'react'
import { Calculator, ChevronDown, ChevronUp } from 'lucide-react'

const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full'
const lbl = 'text-xs text-gray-400 mb-1 block'

// ─── Statistical functions ────────────────────────────────────────────────────
function meanOf(v: number[]) { return v.reduce((a, b) => a + b, 0) / v.length }
function sdOf(v: number[]) {
  const m = meanOf(v)
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1))
}
function sortAsc(v: number[]) { return [...v].sort((a, b) => a - b) }
function pctileClsi(sorted: number[], p: number) {
  const rank = p / 100 * (sorted.length + 1)
  const lo = Math.max(0, Math.floor(rank) - 1)
  const hi = Math.min(sorted.length - 1, Math.ceil(rank) - 1)
  return sorted[lo] + (rank - Math.floor(rank)) * (sorted[hi] - sorted[lo])
}

// Dixon Q test (n = 3–25)
const DIXON_Q_CRIT: Record<number, number> = {
  3:0.970,4:0.829,5:0.710,6:0.625,7:0.568,8:0.526,9:0.493,
  10:0.466,11:0.444,12:0.426,13:0.410,14:0.396,15:0.384,
  16:0.374,17:0.365,18:0.356,19:0.349,20:0.342,
  21:0.337,22:0.331,23:0.326,24:0.321,25:0.317,
}
function dixonQ(sorted: number[]): { Q: number; crit: number; isOutlier: boolean; which: 'max' | 'min' } {
  const n = sorted.length
  const range = sorted[n - 1] - sorted[0]
  const Qmax = range === 0 ? 0 : (sorted[n - 1] - sorted[n - 2]) / range
  const Qmin = range === 0 ? 0 : (sorted[1] - sorted[0]) / range
  const Q = Math.max(Qmax, Qmin)
  const which: 'max' | 'min' = Qmax >= Qmin ? 'max' : 'min'
  const crit = DIXON_Q_CRIT[n] ?? 0.25
  return { Q: Math.round(Q * 10000) / 10000, crit, isOutlier: Q > crit, which }
}

// Grubbs test (α=0.05)
const GRUBBS_CRIT: Record<number, number> = {
  10:2.29,15:2.55,20:2.71,25:2.82,30:2.91,
  40:3.04,50:3.13,60:3.20,80:3.31,100:3.38,120:3.44,150:3.51,200:3.60,
}
function grubbsTest(sorted: number[]): { G: number; crit: number; isOutlier: boolean; value: number } {
  const n = sorted.length, m = meanOf(sorted), s = sdOf(sorted)
  const Gmax = (sorted[n - 1] - m) / s
  const Gmin = (m - sorted[0]) / s
  const G = Math.max(Gmax, Gmin)
  const keys = Object.keys(GRUBBS_CRIT).map(Number).sort((a, b) => a - b)
  let crit = 3.0
  for (const k of keys) { if (n >= k) crit = GRUBBS_CRIT[k] }
  return { G: Math.round(G * 10000) / 10000, crit, isOutlier: G > crit, value: Gmax >= Gmin ? sorted[n - 1] : sorted[0] }
}

// Box-Cox: find lambda that minimizes Shapiro-Wilk-like criterion (simplified)
function boxCoxTransform(v: number[], lambda: number) {
  if (v.some(x => x <= 0)) return null
  if (Math.abs(lambda) < 0.01) return v.map(x => Math.log(x))
  return v.map(x => (Math.pow(x, lambda) - 1) / lambda)
}
function skewOf(v: number[]) {
  const n = v.length, m = meanOf(v), s = sdOf(v)
  if (s === 0) return 0
  return (n / ((n - 1) * (n - 2))) * v.reduce((a, x) => a + ((x - m) / s) ** 3, 0)
}
function findBoxCoxLambda(v: number[]) {
  if (v.some(x => x <= 0)) return null
  const lambdas = Array.from({ length: 41 }, (_, i) => -2 + i * 0.1)
  let best = { lambda: 1, skew: Math.abs(skewOf(v)) }
  for (const lam of lambdas) {
    const t = boxCoxTransform(v, lam)
    if (!t) continue
    const sk = Math.abs(skewOf(t))
    if (sk < best.skew) best = { lambda: Math.round(lam * 10) / 10, skew: sk }
  }
  return best
}

// ─── Section components ───────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors">
        {title}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="px-5 pb-5 pt-2 space-y-4 border-t border-gray-800">{children}</div>}
    </div>
  )
}

function parseValues(text: string): number[] {
  return text.replace(/,/g, '\n').split('\n').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
}

// ─── Outlier Tools ────────────────────────────────────────────────────────────
function OutlierTools() {
  const [text, setText] = useState('')
  const values = useMemo(() => parseValues(text), [text])
  const sorted = useMemo(() => sortAsc(values), [values])

  const dixon  = useMemo(() => values.length >= 3 && values.length <= 25 ? dixonQ(sorted) : null, [sorted, values])
  const grubbs = useMemo(() => values.length >= 7 ? grubbsTest(sorted) : null, [sorted, values])
  const m = values.length ? meanOf(values) : null
  const s = values.length > 1 ? sdOf(values) : null

  return (
    <div className="space-y-4">
      <div>
        <label className={lbl}>Enter data values (comma or newline separated)</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
          className={`${inp} font-mono text-xs resize-none`}
          placeholder="5.1, 5.3, 5.2, 12.8, 5.0, 5.4, 5.1" />
      </div>

      {values.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
          {[
            ['n', values.length],
            ['Mean', m != null ? m.toFixed(4) : '—'],
            ['SD', s != null ? s.toFixed(4) : '—'],
            ['Skewness', s ? skewOf(values).toFixed(3) : '—'],
          ].map(([k, v]) => (
            <div key={k as string} className="bg-gray-800 rounded-lg p-2">
              <div className="text-gray-500">{k}</div>
              <div className="font-semibold text-white">{v}</div>
            </div>
          ))}
        </div>
      )}

      {dixon && (
        <div className={`rounded-lg px-4 py-3 border text-sm ${dixon.isOutlier ? 'bg-red-900/20 border-red-700 text-red-300' : 'bg-green-900/20 border-green-700 text-green-300'}`}>
          <div className="font-semibold">Dixon Q Test (n = {values.length})</div>
          <div className="text-xs mt-1">Q = {dixon.Q} | Critical Q₀.₀₅ = {dixon.crit}</div>
          <div className="mt-1">
            {dixon.isOutlier
              ? `⚠️ OUTLIER DETECTED — the ${dixon.which === 'max' ? 'maximum' : 'minimum'} value (${sorted[dixon.which === 'max' ? sorted.length - 1 : 0]}) is a significant outlier at α = 0.05.`
              : '✅ No significant outlier detected (α = 0.05).'}
          </div>
        </div>
      )}

      {!dixon && values.length >= 3 && values.length <= 25 && (
        <div className="text-xs text-gray-500">Dixon Q test applies to n = 3–25.</div>
      )}

      {grubbs && (
        <div className={`rounded-lg px-4 py-3 border text-sm ${grubbs.isOutlier ? 'bg-red-900/20 border-red-700 text-red-300' : 'bg-green-900/20 border-green-700 text-green-300'}`}>
          <div className="font-semibold">Grubbs Test (n = {values.length})</div>
          <div className="text-xs mt-1">G = {grubbs.G} | Critical G₀.₀₅ ≈ {grubbs.crit}</div>
          <div className="mt-1">
            {grubbs.isOutlier
              ? `⚠️ OUTLIER DETECTED — value ${grubbs.value} is a significant outlier (G > critical).`
              : '✅ No significant outlier detected (α = 0.05).'}
          </div>
        </div>
      )}

      {values.length > 0 && (
        <div className="text-xs text-gray-500 font-mono">
          Sorted: [{sorted.slice(0, 5).join(', ')}{sorted.length > 5 ? `, …, ${sorted[sorted.length - 1]}` : ''}]
        </div>
      )}
    </div>
  )
}

// ─── Box-Cox ──────────────────────────────────────────────────────────────────
function BoxCox() {
  const [text, setText] = useState('')
  const values = useMemo(() => parseValues(text), [text])
  const result = useMemo(() => values.length >= 10 ? findBoxCoxLambda(values) : null, [values])
  const hasNeg = values.some(x => x <= 0)

  const lambdaLabel: Record<number, string> = { 0: 'log', 0.5: 'square root', 1: 'no transform', 2: 'square', '-1': 'reciprocal' }

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-500">Find the Box-Cox λ that minimizes skewness (normalizes distribution). Values must be positive.</div>
      <div>
        <label className={lbl}>Data values</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
          className={`${inp} font-mono text-xs resize-none`}
          placeholder="All values must be > 0&#10;e.g. ferritin values: 24, 36, 12, 89, 45..." />
      </div>

      {hasNeg && <div className="text-xs text-red-400">⚠️ All values must be positive (&gt; 0) for Box-Cox.</div>}

      {result && !hasNeg && (
        <div className="space-y-3">
          <div className="bg-gray-800 rounded-xl p-4 space-y-2">
            <div className="text-xs text-gray-500">Optimal lambda</div>
            <div className="text-3xl font-bold text-brand-300">λ = {result.lambda}</div>
            <div className="text-sm text-gray-300">
              Transform: <strong>{lambdaLabel[result.lambda] ?? `x^${result.lambda}`}</strong>
            </div>
            <div className="text-xs text-gray-400">Residual |skewness| after transform: {result.skew.toFixed(4)}</div>
          </div>

          <div className="text-xs text-gray-400 space-y-1 bg-gray-800 rounded-lg p-3">
            <div className="font-semibold text-gray-300">Interpreting λ</div>
            <div>λ = 0 → log transform (right-skewed data like ferritin, CRP)</div>
            <div>λ = 0.5 → square root transform</div>
            <div>λ = 1 → data is already normal (no transform needed)</div>
            <div>λ = −1 → reciprocal transform (heavily skewed)</div>
          </div>

          {Math.abs(skewOf(values)) > 0.5 && (
            <div className="text-xs text-amber-300 bg-amber-900/10 border border-amber-800 rounded px-3 py-2">
              Original skewness: {skewOf(values).toFixed(3)} — transformation recommended before applying parametric RI methods.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Percentile Calculator ────────────────────────────────────────────────────
function PercentileCalc() {
  const [text, setText] = useState('')
  const [pValue, setPValue] = useState('2.5')
  const values = useMemo(() => parseValues(text), [text])
  const sorted = useMemo(() => sortAsc(values), [values])

  const p = parseFloat(pValue)
  const result = !isNaN(p) && sorted.length > 0 ? pctileClsi(sorted, p) : null
  const ri = sorted.length > 0 ? { lo: pctileClsi(sorted, 2.5), hi: pctileClsi(sorted, 97.5) } : null

  return (
    <div className="space-y-4">
      <div>
        <label className={lbl}>Data values</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
          className={`${inp} font-mono text-xs resize-none`}
          placeholder="Enter values to compute any percentile&#10;13.2, 14.5, 12.8, 15.1, ..." />
      </div>

      <div className="flex items-end gap-4">
        <div className="w-32">
          <label className={lbl}>Percentile</label>
          <input type="number" step="0.5" min="0.1" max="99.9" value={pValue} onChange={e => setPValue(e.target.value)} className={inp} />
        </div>
        <div className="text-xs text-gray-500 pb-2">n = {values.length} values</div>
      </div>

      {result != null && (
        <div className="space-y-3">
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500">{pValue}th percentile (CLSI EP28 rank method)</div>
            <div className="text-3xl font-bold text-brand-300">{Math.round(result * 10000) / 10000}</div>
          </div>

          {ri && (
            <div className="flex gap-3">
              <div className="flex-1 bg-gray-800 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">2.5th (lower RI)</div>
                <div className="text-lg font-bold text-blue-300">{Math.round(ri.lo * 10000) / 10000}</div>
              </div>
              <div className="flex-1 bg-gray-800 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">97.5th (upper RI)</div>
                <div className="text-lg font-bold text-blue-300">{Math.round(ri.hi * 10000) / 10000}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Calculators() {
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <Calculator size={18} className="text-pink-400" />
        Statistical Calculators
      </h1>

      <div className="bg-gray-800/50 rounded-xl px-4 py-3 text-xs text-gray-400">
        Pure client-side calculators — no data leaves your browser. Use these to support your reference interval establishment and data analysis workflow.
      </div>

      <Section title="🔍 Outlier Detection — Dixon Q & Grubbs Tests">
        <OutlierTools />
      </Section>

      <Section title="📐 Box-Cox Transformation — Normalize Skewed Data">
        <BoxCox />
      </Section>

      <Section title="📊 Percentile Calculator (CLSI EP28 Rank Method)">
        <PercentileCalc />
      </Section>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <div className="font-semibold text-gray-400">Statistical references</div>
        <div>• Dixon Q critical values: α = 0.05 (two-tailed), from Dean & Dixon (1951)</div>
        <div>• Grubbs critical values: α = 0.05 (two-tailed), from Grubbs (1969)</div>
        <div>• Percentile method: CLSI EP28-A3c rank-based interpolation, rank = p/100 × (n+1)</div>
        <div>• Box-Cox: searches λ in [−2, 2] minimizing |skewness| of transformed data</div>
      </div>
    </div>
  )
}
