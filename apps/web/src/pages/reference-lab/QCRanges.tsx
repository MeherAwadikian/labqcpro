import { useState, useMemo } from 'react'
import { BarChart3, Info } from 'lucide-react'

const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full'
const lbl = 'text-xs text-gray-400 mb-1 block'

export default function QCRanges() {
  const [lower, setLower] = useState('')
  const [upper, setUpper] = useState('')
  const [unit, setUnit]   = useState('')
  const [cvPct, setCvPct] = useState('')  // optional override
  const [analyte, setAnalyte] = useState('')
  const [mode, setMode]   = useState<'ri' | 'cv'>('ri')

  const result = useMemo(() => {
    const lo = parseFloat(lower), hi = parseFloat(upper)
    if (isNaN(lo) || isNaN(hi) || hi <= lo) return null

    const target = (lo + hi) / 2
    let sd: number

    if (mode === 'cv' && !isNaN(parseFloat(cvPct))) {
      sd = target * parseFloat(cvPct) / 100
    } else {
      // RI spans ±1.96 SD → SD = range / (2 × 1.96)
      sd = (hi - lo) / 3.92
    }

    const r = (x: number) => Math.round(x * 1000) / 1000
    return {
      target: r(target), sd: r(sd), cv: r((sd / target) * 100),
      p1lo: r(target - sd),   p1hi: r(target + sd),
      p2lo: r(target - 2*sd), p2hi: r(target + 2*sd),
      p3lo: r(target - 3*sd), p3hi: r(target + 3*sd),
    }
  }, [lower, upper, cvPct, mode])

  const BAR_MAX = result ? result.p3hi + (result.sd * 0.5) : 1
  const BAR_MIN = result ? result.p3lo - (result.sd * 0.5) : 0
  const BAR_RANGE = BAR_MAX - BAR_MIN

  function pct(v: number) { return ((v - BAR_MIN) / BAR_RANGE) * 100 }
  function width(lo: number, hi: number) { return ((hi - lo) / BAR_RANGE) * 100 }

  const BANDS = result ? [
    { label: '±3 SD (Action)', lo: result.p3lo, hi: result.p3hi, color: 'bg-red-500/20 border-red-700' },
    { label: '±2 SD (Warning)', lo: result.p2lo, hi: result.p2hi, color: 'bg-amber-500/20 border-amber-700' },
    { label: '±1 SD', lo: result.p1lo, hi: result.p1hi, color: 'bg-green-500/30 border-green-700' },
  ] : []

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <BarChart3 size={18} className="text-orange-400" />
        QC Ranges from Reference Interval
      </h1>

      <div className="bg-orange-900/10 border border-orange-800 rounded-xl p-4 text-xs text-orange-300 space-y-1">
        <div className="font-semibold">Derive Westgard QC Limits from Your Established RI</div>
        <div>Enter your reference interval (2.5th–97.5th percentile). The calculator derives the expected QC target (midpoint) and SD limits, assuming normal distribution. Use these to set initial Westgard control limits for a new analyte.</div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Input</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Analyte</label>
            <input value={analyte} onChange={e => setAnalyte(e.target.value)} className={inp} placeholder="e.g. Glucose" />
          </div>
          <div>
            <label className={lbl}>Unit</label>
            <input value={unit} onChange={e => setUnit(e.target.value)} className={inp} placeholder="e.g. mg/dL" />
          </div>
          <div>
            <label className={lbl}>RI Lower Limit (2.5th %ile)</label>
            <input type="number" step="any" value={lower} onChange={e => setLower(e.target.value)} className={inp} placeholder="70" />
          </div>
          <div>
            <label className={lbl}>RI Upper Limit (97.5th %ile)</label>
            <input type="number" step="any" value={upper} onChange={e => setUpper(e.target.value)} className={inp} placeholder="99" />
          </div>
        </div>

        <div className="border-t border-gray-800 pt-4">
          <div className="flex gap-4 mb-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
              <input type="radio" checked={mode === 'ri'} onChange={() => setMode('ri')} className="text-brand-500" />
              Derive SD from RI (range / 3.92)
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
              <input type="radio" checked={mode === 'cv'} onChange={() => setMode('cv')} className="text-brand-500" />
              Use known CV%
            </label>
          </div>
          {mode === 'cv' && (
            <div className="w-40">
              <label className={lbl}>CV% (from precision study)</label>
              <input type="number" step="any" value={cvPct} onChange={e => setCvPct(e.target.value)} className={inp} placeholder="3.5" />
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          {/* QC limits table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">
              {analyte || 'Analyte'} QC Limits
              {unit && <span className="text-gray-400 font-normal ml-2">({unit})</span>}
            </h2>

            <div className="space-y-1 text-sm">
              <div className="grid grid-cols-4 gap-2 text-xs text-gray-500 pb-1 border-b border-gray-800">
                <span>Rule</span><span className="text-right">Lower</span><span className="text-center">Target</span><span className="text-right">Upper</span>
              </div>
              {[
                { rule: '±3 SD (13S action)', lo: result.p3lo, hi: result.p3hi, color: 'text-red-400' },
                { rule: '±2 SD (22S warning)', lo: result.p2lo, hi: result.p2hi, color: 'text-amber-400' },
                { rule: '±1 SD', lo: result.p1lo, hi: result.p1hi, color: 'text-green-400' },
              ].map(row => (
                <div key={row.rule} className="grid grid-cols-4 gap-2 py-2 border-b border-gray-800/50">
                  <span className={`text-xs ${row.color}`}>{row.rule}</span>
                  <span className="text-right font-mono text-gray-200">{row.lo}</span>
                  <span className="text-center font-mono text-brand-300">{result.target}</span>
                  <span className="text-right font-mono text-gray-200">{row.hi}</span>
                </div>
              ))}
              <div className="grid grid-cols-4 gap-2 pt-2 text-xs text-gray-400">
                <span>SD =</span><span className="text-right text-white font-semibold">{result.sd} {unit}</span>
                <span>CV% =</span><span className="text-right text-white font-semibold">{result.cv}%</span>
              </div>
            </div>

            {/* Visual band chart */}
            <div className="space-y-2 pt-2">
              <div className="text-xs text-gray-500">Visual — Westgard SD bands</div>
              <div className="relative h-20 bg-gray-800 rounded-lg overflow-hidden">
                {BANDS.map(b => (
                  <div
                    key={b.label}
                    className={`absolute top-0 h-full border-l border-r ${b.color}`}
                    style={{ left: `${pct(b.lo)}%`, width: `${width(b.lo, b.hi)}%` }}
                  />
                ))}
                {/* Target line */}
                <div className="absolute top-0 h-full w-0.5 bg-brand-400/80" style={{ left: `${pct(result.target)}%` }} />
                {/* RI limits */}
                <div className="absolute top-0 h-full w-px bg-white/20" style={{ left: `${pct(parseFloat(lower))}%` }} />
                <div className="absolute top-0 h-full w-px bg-white/20" style={{ left: `${pct(parseFloat(upper))}%` }} />
                {/* Labels */}
                <div className="absolute bottom-1 text-xs text-gray-500 w-full flex justify-between px-1">
                  <span>{result.p3lo}</span>
                  <span className="text-brand-400">{result.target}</span>
                  <span>{result.p3hi}</span>
                </div>
              </div>
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500/30 border border-green-700 rounded-sm inline-block" /> ±1 SD (68%)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500/20 border border-amber-700 rounded-sm inline-block" /> ±2 SD (95%) — Warning</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500/20 border border-red-700 rounded-sm inline-block" /> ±3 SD (99.7%) — Action</span>
              </div>
            </div>
          </div>

          {/* Westgard rules quick reference */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs space-y-2">
            <div className="flex items-center gap-2 text-gray-300 font-semibold">
              <Info size={12} className="text-brand-400" /> Westgard Multirule Quick Reference
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-400">
              {[
                ['12S Warning', 'One control exceeds ±2 SD — investigate'],
                ['13S Reject', 'One control exceeds ±3 SD — reject run'],
                ['22S Reject', 'Two consecutive controls exceed +2 SD or −2 SD'],
                ['R4S Reject', 'One control >+2 SD and another <−2 SD in same run'],
                ['41S Reject', 'Four consecutive controls on same side of ±1 SD'],
                ['10X Reject', 'Ten consecutive controls on same side of mean'],
              ].map(([rule, desc]) => (
                <div key={rule} className="flex gap-2">
                  <span className="font-mono text-brand-300 flex-shrink-0">{rule}</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-600 flex items-start gap-2">
            <Info size={11} className="flex-shrink-0 mt-0.5" />
            <span>
              These limits are estimates from the reference interval. For precision control materials,
              it's better to derive SD from actual QC measurements over 20+ days (CLSI EP5-A3).
              Use these as starting limits only — adjust based on observed QC performance.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
