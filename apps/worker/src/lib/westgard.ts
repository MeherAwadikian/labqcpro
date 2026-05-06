import type { WestgardResult, WestgardRule } from '@labqcpro/shared'

const DESCRIPTIONS: Record<WestgardRule, string> = {
  '1_2s': 'One value exceeded ±2SD — warning, investigate before proceeding.',
  '1_3s': 'One value exceeded ±3SD — reject run, check instrument and reagents.',
  '2_2s': 'Two consecutive values exceeded ±2SD on the same side — systematic error, reject run.',
  'R_4s': 'Range between two consecutive values exceeded 4SD — random error, reject run.',
  '4_1s': 'Four consecutive values exceeded ±1SD on the same side — systematic shift, reject run.',
  '10x':  'Ten consecutive values on the same side of the mean — systematic drift, reject run.',
}

export function checkWestgardRules(values: number[], mean: number, sd: number): WestgardResult[] {
  const violations: WestgardResult[] = []
  if (!values.length || sd === 0) return violations

  const z = (v: number) => (v - mean) / sd
  const last = values[values.length - 1]

  // 1_2s: Warning — 1 value > ±2SD
  if (Math.abs(z(last)) > 2)
    violations.push({ rule: '1_2s', severity: 'warning', description: DESCRIPTIONS['1_2s'] })

  // 1_3s: Reject — 1 value > ±3SD
  if (Math.abs(z(last)) > 3)
    violations.push({ rule: '1_3s', severity: 'reject', description: DESCRIPTIONS['1_3s'] })

  // 2_2s: Reject — 2 consecutive > ±2SD same side
  if (values.length >= 2) {
    const prev = values[values.length - 2]
    if ((z(last) > 2 && z(prev) > 2) || (z(last) < -2 && z(prev) < -2))
      violations.push({ rule: '2_2s', severity: 'reject', description: DESCRIPTIONS['2_2s'] })
  }

  // R_4s: Reject — range > 4SD between consecutive values
  if (values.length >= 2) {
    const prev = values[values.length - 2]
    if (Math.abs(z(last) - z(prev)) > 4)
      violations.push({ rule: 'R_4s', severity: 'reject', description: DESCRIPTIONS['R_4s'] })
  }

  // 4_1s: Reject — 4 consecutive > ±1SD same side
  if (values.length >= 4) {
    const last4 = values.slice(-4).map(z)
    if (last4.every(v => v > 1) || last4.every(v => v < -1))
      violations.push({ rule: '4_1s', severity: 'reject', description: DESCRIPTIONS['4_1s'] })
  }

  // 10x: Reject — 10 consecutive same side of mean
  if (values.length >= 10) {
    const last10 = values.slice(-10).map(z)
    if (last10.every(v => v > 0) || last10.every(v => v < 0))
      violations.push({ rule: '10x', severity: 'reject', description: DESCRIPTIONS['10x'] })
  }

  return violations
}
