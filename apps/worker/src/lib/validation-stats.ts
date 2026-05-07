// Validation statistical calculations — CLSI EP5/EP9/EP15/EP26

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
  const n = xs.length
  if (n < 2) return { slope: 1, intercept: 0, r2: 0 }
  const mx = mean(xs), my = mean(ys)
  const ssxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
  const ssxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const slope = ssxx === 0 ? 1 : ssxy / ssxx
  const intercept = my - slope * mx
  const r = pearsonR(xs, ys)
  return { slope, intercept, r2: r * r }
}

function medianSorted(sorted: number[]): number {
  const n = sorted.length
  if (n === 0) return 0
  return n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)]
}

// Passing-Bablok regression (CLSI EP9)
export function passingBablok(xs: number[], ys: number[]) {
  const n = xs.length
  if (n < 4) {
    const lr = linearRegression(xs, ys)
    return {
      slope: lr.slope, intercept: lr.intercept,
      slopeCILow: lr.slope, slopeCIHigh: lr.slope,
      interceptCILow: lr.intercept, interceptCIHigh: lr.intercept,
    }
  }
  const slopes: number[] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = xs[j] - xs[i]
      if (Math.abs(dx) > 1e-10) slopes.push((ys[j] - ys[i]) / dx)
    }
  }
  slopes.sort((a, b) => a - b)
  const k = slopes.length
  const slope = medianSorted(slopes)
  const medX = medianSorted([...xs].sort((a, b) => a - b))
  const medY = medianSorted([...ys].sort((a, b) => a - b))
  const intercept = medY - slope * medX

  // 95% CI using Kendall S approach
  const W = 1.96 * Math.sqrt((n * (n - 1) * (2 * n + 5)) / 18)
  const M1 = Math.max(0, Math.round((k - W) / 2))
  const M2 = Math.min(k - 1, k - M1 - 1)

  const slopeCILow  = slopes[M1]  ?? slopes[0]
  const slopeCIHigh = slopes[M2]  ?? slopes[k - 1]
  return {
    slope, intercept,
    slopeCILow, slopeCIHigh,
    interceptCILow:  medY - slopeCIHigh * medX,
    interceptCIHigh: medY - slopeCILow  * medX,
  }
}

// Bland-Altman analysis
export function blandAltman(as: number[], bs: number[]) {
  const diffs = bs.map((b, i) => b - as[i])
  const avgs  = bs.map((b, i) => (b + as[i]) / 2)
  const meanD = mean(diffs)
  const sdD   = sd(diffs)
  return {
    diffs, avgs,
    meanDiff: meanD,
    sdDiff:   sdD,
    loaUpper: meanD + 1.96 * sdD,
    loaLower: meanD - 1.96 * sdD,
  }
}

export interface ValidationStatsResult {
  n: number
  mean_a: number; mean_b: number
  sd_a: number;   sd_b: number
  cv_a: number;   cv_b: number
  mean_difference: number; sd_difference: number
  bias_percent: number
  slope: number; intercept: number
  r_value: number; r_squared: number
  loa_upper: number; loa_lower: number
  slope_ci_low: number; slope_ci_high: number
  intercept_ci_low: number; intercept_ci_high: number
  passed: boolean
  tea_limit: number
  n_exceeding: number
}

export function computeStats(
  pairs: { a: number; b: number }[],
  tea: number,
  rejectionLimit?: number
): ValidationStatsResult {
  const valid = pairs.filter(p => isFinite(p.a) && isFinite(p.b))
  const n = valid.length
  if (n < 2) {
    return { n, mean_a: 0, mean_b: 0, sd_a: 0, sd_b: 0, cv_a: 0, cv_b: 0,
      mean_difference: 0, sd_difference: 0, bias_percent: 0, slope: 1, intercept: 0,
      r_value: 0, r_squared: 0, loa_upper: 0, loa_lower: 0,
      slope_ci_low: 1, slope_ci_high: 1, intercept_ci_low: 0, intercept_ci_high: 0,
      passed: false, tea_limit: tea, n_exceeding: 0 }
  }
  const as = valid.map(p => p.a)
  const bs = valid.map(p => p.b)
  const ma = mean(as), mb = mean(bs)
  const sda = sd(as, ma), sdb = sd(bs, mb)
  const ba = blandAltman(as, bs)
  const pb = passingBablok(as, bs)
  const r  = pearsonR(as, bs)
  const limit = rejectionLimit ?? tea / 2
  const pctDiffs = valid.map(p => Math.abs((p.b - p.a) / p.a * 100))
  const n_exceeding = pctDiffs.filter(d => d > limit).length
  const biasPercent = ma !== 0 ? ((mb - ma) / ma) * 100 : 0
  const passed = Math.abs(biasPercent) + 2 * (mb !== 0 ? (sdb / Math.abs(mb)) * 100 : 0) <= tea

  return {
    n, mean_a: ma, mean_b: mb, sd_a: sda, sd_b: sdb,
    cv_a: ma !== 0 ? (sda / Math.abs(ma)) * 100 : 0,
    cv_b: mb !== 0 ? (sdb / Math.abs(mb)) * 100 : 0,
    mean_difference: ba.meanDiff, sd_difference: ba.sdDiff,
    bias_percent: biasPercent,
    slope: pb.slope, intercept: pb.intercept,
    r_value: r, r_squared: r * r,
    loa_upper: ba.loaUpper, loa_lower: ba.loaLower,
    slope_ci_low: pb.slopeCILow, slope_ci_high: pb.slopeCIHigh,
    intercept_ci_low: pb.interceptCILow, intercept_ci_high: pb.interceptCIHigh,
    passed, tea_limit: tea, n_exceeding,
  }
}
