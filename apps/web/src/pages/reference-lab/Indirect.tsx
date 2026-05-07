import { useState, useMemo } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Line, ComposedChart } from 'recharts'
import { Layers, Calculator } from 'lucide-react'

const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full'

// ─── Inverse normal CDF (Beasley-Springer-Moro approximation) ─────────────────
function normInv(p: number): number {
  if (p <= 0) return -8; if (p >= 1) return 8
  const c = [2.515517, 0.802853, 0.010328]
  const d = [1.432788, 0.189269, 0.001308]
  const t = p < 0.5 ? Math.sqrt(-2 * Math.log(p)) : Math.sqrt(-2 * Math.log(1 - p))
  const num = c[0] + c[1] * t + c[2] * t * t
  const den = 1 + d[0] * t + d[1] * t * t + d[2] * t * t * t
  const x = t - num / den
  return p < 0.5 ? -x : x
}

// ─── Hoffmann Indirect Method ─────────────────────────────────────────────────
function runHoffmann(rawValues: number[], trimPct: number) {
  if (rawValues.length < 50) return null
  const sorted = [...rawValues].sort((a, b) => a - b)
  const n = sorted.length
  const trimN = Math.max(0, Math.floor(n * trimPct / 100))
  const trimmed = sorted.slice(trimN, n - trimN)
  const nt = trimmed.length
  if (nt < 30) return null

  // Assign probit values: y = Phi^-1((i+1-0.5)/nt)
  const points = trimmed.map((v, i) => ({ x: v, y: normInv((i + 1 - 0.5) / nt) }))

  // Use middle 50% for regression
  const midStart = Math.floor(nt * 0.25)
  const midEnd = Math.ceil(nt * 0.75)
  const mid = points.slice(midStart, midEnd)
  const nm = mid.length

  // Linear regression: x = a + b*y (value as function of probit score)
  const sumX = mid.reduce((s, p) => s + p.x, 0)
  const sumY = mid.reduce((s, p) => s + p.y, 0)
  const sumXY = mid.reduce((s, p) => s + p.x * p.y, 0)
  const sumY2 = mid.reduce((s, p) => s + p.y * p.y, 0)
  const meanX = sumX / nm, meanY = sumY / nm

  const b = (sumXY - sumX * sumY / nm) / (sumY2 - sumY * sumY / nm)
  const a = meanX - b * meanY

  // R² (Pearson on mid points)
  const ssXX = mid.reduce((s, p) => s + (p.x - meanX) ** 2, 0)
  const ssYY = mid.reduce((s, p) => s + (p.y - meanY) ** 2, 0)
  const ssXY = mid.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0)
  const r2 = ssXY * ssXY / (ssXX * ssYY)

  const lower = a + b * (-1.96)  // value at 2.5th percentile
  const upper = a + b * 1.96     // value at 97.5th percentile

  // Regression line for chart (probit from -2.5 to 2.5)
  const line = Array.from({ length: 30 }, (_, i) => {
    const y = -2.5 + i * (5 / 29)
    return { y, x: a + b * y }
  })

  return {
    lower: Math.round(lower * 1000) / 1000,
    upper: Math.round(upper * 1000) / 1000,
    r2: Math.round(r2 * 10000) / 10000,
    a: Math.round(a * 1000) / 1000,
    b: Math.round(b * 1000) / 1000,
    n, nt,
    points: points.filter((_, i) => i % Math.max(1, Math.floor(nt / 200)) === 0), // thin for chart
    line,
    midPoints: mid,
  }
}

export default function Indirect() {
  const [text, setText]       = useState('')
  const [trimPct, setTrimPct] = useState(2.5)
  const [unit, setUnit]       = useState('')
  const [analyte, setAnalyte] = useState('')
  const [computed, setComputed] = useState(false)

  const values = useMemo(() => {
    return text.replace(/,/g, '\n').split('\n')
      .map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
  }, [text])

  const result = useMemo(() => {
    if (!computed || values.length < 50) return null
    return runHoffmann(values, trimPct)
  }, [computed, values, trimPct])

  function calculate() { setComputed(true) }
  function reset() { setComputed(false); setText('') }

  const n = values.length

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <Layers size={18} className="text-purple-400" />
        Indirect Method — Hoffmann
      </h1>

      <div className="bg-purple-900/10 border border-purple-800 rounded-xl p-4 text-xs text-purple-300 space-y-2">
        <div className="font-semibold">How it works</div>
        <div>The Hoffmann method uses <strong>routine patient data</strong> (100–5,000+ values) to estimate a reference interval without needing a separate reference population. It plots values on a normal probability scale and fits a regression line through the "Gaussian" central portion, then extrapolates to 2.5th and 97.5th percentiles.</div>
        <div>Best for: analytes with high test volume, situations where a healthy reference population is difficult to recruit.</div>
      </div>

      {!computed && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Input Data</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Analyte</label>
              <input value={analyte} onChange={e => setAnalyte(e.target.value)} className={inp} placeholder="e.g. Sodium" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Unit</label>
              <input value={unit} onChange={e => setUnit(e.target.value)} className={inp} placeholder="e.g. mEq/L" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Trim % (remove extremes)</label>
              <select value={trimPct} onChange={e => setTrimPct(parseFloat(e.target.value))} className={inp}>
                <option value={0.5}>0.5% (conservative)</option>
                <option value={1}>1%</option>
                <option value={2.5}>2.5% (standard)</option>
                <option value={5}>5% (aggressive)</option>
              </select>
            </div>
            <div className="flex items-end">
              <div className={`text-sm ${n >= 100 ? 'text-green-400' : n >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {n} values entered {n < 50 && '(min 50)'}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Paste values (comma or newline separated)</label>
            <textarea
              value={text}
              onChange={e => { setText(e.target.value); setComputed(false) }}
              rows={8}
              placeholder="136, 142, 139, 144, 138, 140, 137&#10;or one per line..."
              className={`${inp} font-mono text-xs resize-none`}
            />
          </div>

          <button
            onClick={calculate}
            disabled={n < 50}
            className="bg-purple-700 hover:bg-purple-800 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Calculator size={14} /> Run Hoffmann Analysis
          </button>
        </div>
      )}

      {computed && !result && (
        <div className="text-center py-8 text-red-400">
          Need at least 50 values after trimming. Add more data or reduce trim %.
        </div>
      )}

      {result && (
        <div className="space-y-5">
          {/* Result card */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">{analyte || 'Analyte'} — Hoffmann RI</h2>
              <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-200">← New analysis</button>
            </div>

            <div className="text-3xl font-bold text-purple-300">
              {result.lower} – {result.upper} <span className="text-lg font-normal text-gray-500">{unit}</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
              {[
                ['n (total)', result.n],
                ['n (trimmed)', result.nt],
                ['R² (regression)', result.r2.toFixed(4)],
                ['Slope (b)', result.b],
              ].map(([k, v]) => (
                <div key={k as string} className="bg-gray-800 rounded-lg p-2">
                  <div className="text-gray-500">{k}</div>
                  <div className="font-semibold text-white">{v}</div>
                </div>
              ))}
            </div>

            <div className={`text-xs rounded-lg px-3 py-2 border ${
              result.r2 >= 0.98 ? 'bg-green-900/10 border-green-800 text-green-300' :
              result.r2 >= 0.95 ? 'bg-amber-900/10 border-amber-800 text-amber-300' :
              'bg-red-900/10 border-red-800 text-red-300'
            }`}>
              {result.r2 >= 0.98 ? '✅ Excellent linearity (R² ≥ 0.98) — result reliable' :
               result.r2 >= 0.95 ? '⚠️ Moderate linearity (R² 0.95-0.98) — interpret cautiously' :
               '❌ Poor linearity (R² < 0.95) — data may be non-Gaussian. Consider a different trimming or method.'}
            </div>
          </div>

          {/* Probability plot */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-2">
            <h3 className="text-sm font-semibold text-white">Normal Probability Plot</h3>
            <p className="text-xs text-gray-500">Each dot = a data value. The regression line through the central portion is extrapolated to ±1.96 probit (2.5th / 97.5th percentiles).</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart margin={{ left: 10, right: 10 }}>
                  <XAxis dataKey="x" type="number" name="Value" domain={['auto', 'auto']}
                    tick={{ fontSize: 10, fill: '#6b7280' }} label={{ value: unit || 'Value', position: 'bottom', fill: '#6b7280', fontSize: 10 }} />
                  <YAxis dataKey="y" type="number" name="Probit" domain={[-3, 3]}
                    tick={{ fontSize: 10, fill: '#6b7280' }} label={{ value: 'Probit (z)', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                    formatter={(v: number) => v.toFixed(3)} />

                  {/* Data points */}
                  <Scatter data={result.points} fill="#7c3aed" opacity={0.4} r={2} />

                  {/* Regression line */}
                  <Line data={result.line} type="linear" dataKey="y" dot={false}
                    stroke="#10b981" strokeWidth={2} />

                  {/* RI reference lines */}
                  <ReferenceLine y={-1.96} stroke="#f59e0b" strokeDasharray="4 2"
                    label={{ value: `2.5th: ${result.lower}`, position: 'right', fill: '#f59e0b', fontSize: 9 }} />
                  <ReferenceLine y={1.96} stroke="#f59e0b" strokeDasharray="4 2"
                    label={{ value: `97.5th: ${result.upper}`, position: 'right', fill: '#f59e0b', fontSize: 9 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-amber-900/10 border border-amber-800 rounded-xl p-4 text-xs text-amber-300">
            <strong>Important:</strong> Indirect methods estimate the RI from a mixed patient population and may include pathological values.
            Results should be compared against direct/transference methods. Per CLSI, indirect methods are supplementary and
            must be validated before clinical use. Pathological outliers can bias the estimate even after trimming.
          </div>
        </div>
      )}
    </div>
  )
}
