export function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function sd(values: number[], m?: number): number {
  if (values.length < 2) return 0
  const avg = m ?? mean(values)
  const variance = values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / (values.length - 1)
  return Math.sqrt(variance)
}

export function cv(sdVal: number, meanVal: number): number {
  if (meanVal === 0) return 0
  return (sdVal / meanVal) * 100
}

export function zScore(value: number, meanVal: number, sdVal: number): number {
  if (sdVal === 0) return 0
  return (value - meanVal) / sdVal
}

export function totalError(bias: number, sdVal: number): number {
  return Math.abs(bias) + 2 * sdVal
}

export function carryover(blank1: number, blank3: number, sample2: number): number {
  if (sample2 === 0) return 0
  return ((blank1 - blank3) / sample2) * 100
}

export function removeOutliers(values: number[]): number[] {
  const m = mean(values)
  const s = sd(values, m)
  return values.filter(v => Math.abs((v - m) / s) <= 3)
}
