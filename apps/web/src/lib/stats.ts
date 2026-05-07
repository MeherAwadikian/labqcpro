// Client-side validation statistics — mirrors backend validation-stats.ts

export function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

export function sd(values: number[], mu?: number): number {
  if (values.length < 2) return 0
  const m = mu ?? mean(values)
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1))
}

export function cv(values: number[]): number {
  const m = mean(values)
  if (m === 0) return 0
  return (sd(values, m) / Math.abs(m)) * 100
}

export function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 2) return 0
  const mx = mean(xs), my = mean(ys)
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
  const den = Math.sqrt(
    xs.reduce((s, x) => s + (x - mx) ** 2, 0) *
    ys.reduce((s, y) => s + (y - my) ** 2, 0)
  )
  return den === 0 ? 0 : num / den
}

export function linearRegression(xs: number[], ys: number[]) {
  if (xs.length < 2) return { slope: 1, intercept: 0, r: 0, r2: 0 }
  const mx = mean(xs), my = mean(ys)
  const ssxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
  const ssxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const slope = ssxx === 0 ? 1 : ssxy / ssxx
  const intercept = my - slope * mx
  const r = pearsonR(xs, ys)
  return { slope, intercept, r, r2: r * r }
}

function medianSorted(sorted: number[]): number {
  const n = sorted.length
  if (!n) return 0
  return n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)]
}

export function passingBablok(xs: number[], ys: number[]) {
  const n = xs.length
  if (n < 4) {
    const lr = linearRegression(xs, ys)
    return { slope: lr.slope, intercept: lr.intercept, slopeCILow: lr.slope, slopeCIHigh: lr.slope }
  }
  const slopes: number[] = []
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const dx = xs[j] - xs[i]
      if (Math.abs(dx) > 1e-10) slopes.push((ys[j] - ys[i]) / dx)
    }
  slopes.sort((a, b) => a - b)
  const k = slopes.length
  const slope = medianSorted(slopes)
  const medX = medianSorted([...xs].sort((a, b) => a - b))
  const medY = medianSorted([...ys].sort((a, b) => a - b))
  const intercept = medY - slope * medX
  const W = 1.96 * Math.sqrt((n * (n - 1) * (2 * n + 5)) / 18)
  const M1 = Math.max(0, Math.round((k - W) / 2))
  const M2 = Math.min(k - 1, k - M1 - 1)
  return {
    slope, intercept,
    slopeCILow: slopes[M1] ?? slopes[0],
    slopeCIHigh: slopes[M2] ?? slopes[k - 1],
  }
}

export function blandAltman(as: number[], bs: number[]) {
  const diffs = bs.map((b, i) => b - as[i])
  const avgs  = bs.map((b, i) => (b + as[i]) / 2)
  const meanD = mean(diffs)
  const sdD   = sd(diffs)
  return {
    points: avgs.map((avg, i) => ({ avg, diff: diffs[i] })),
    meanDiff: meanD, sdDiff: sdD,
    loaUpper: meanD + 1.96 * sdD,
    loaLower: meanD - 1.96 * sdD,
  }
}

export function pctDiff(a: number, b: number): number {
  if (a === 0) return 0
  return ((b - a) / Math.abs(a)) * 100
}

export interface ComputedStats {
  n: number; meanA: number; meanB: number; sdA: number; sdB: number
  cvA: number; cvB: number; meanDiff: number; sdDiff: number
  biasPct: number; r: number; r2: number; loaUpper: number; loaLower: number
  slope: number; intercept: number; slopeCILow: number; slopeCIHigh: number
  nExceeding: number; passed: boolean
}

export function computeStats(
  pairs: { a: number; b: number }[], tea: number, limit?: number
): ComputedStats {
  const valid = pairs.filter(p => isFinite(p.a) && isFinite(p.b))
  const n = valid.length
  if (n < 2) return {
    n, meanA: 0, meanB: 0, sdA: 0, sdB: 0, cvA: 0, cvB: 0,
    meanDiff: 0, sdDiff: 0, biasPct: 0, r: 0, r2: 0,
    loaUpper: 0, loaLower: 0, slope: 1, intercept: 0,
    slopeCILow: 1, slopeCIHigh: 1, nExceeding: 0, passed: false,
  }
  const as = valid.map(p => p.a), bs = valid.map(p => p.b)
  const meanA = mean(as), meanB = mean(bs)
  const sdA = sd(as, meanA), sdB = sd(bs, meanB)
  const ba = blandAltman(as, bs)
  const pb = passingBablok(as, bs)
  const r = pearsonR(as, bs)
  const rej = limit ?? tea / 2
  const nExceeding = valid.filter(p => Math.abs(pctDiff(p.a, p.b)) > rej).length
  const biasPct = meanA !== 0 ? ((meanB - meanA) / Math.abs(meanA)) * 100 : 0
  const passed = Math.abs(biasPct) + 2 * (meanB !== 0 ? (sdB / Math.abs(meanB)) * 100 : 0) <= tea
  return {
    n, meanA, meanB, sdA, sdB,
    cvA: meanA !== 0 ? (sdA / Math.abs(meanA)) * 100 : 0,
    cvB: meanB !== 0 ? (sdB / Math.abs(meanB)) * 100 : 0,
    meanDiff: ba.meanDiff, sdDiff: ba.sdDiff,
    biasPct, r, r2: r * r,
    loaUpper: ba.loaUpper, loaLower: ba.loaLower,
    slope: pb.slope, intercept: pb.intercept,
    slopeCILow: pb.slopeCILow, slopeCIHigh: pb.slopeCIHigh,
    nExceeding, passed,
  }
}
