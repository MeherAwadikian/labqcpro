import { Hono } from 'hono'
import { authMiddleware, type JWTPayload } from '../../middleware/auth'

type Bindings = { DB: D1Database }
type Variables = { user: JWTPayload }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', authMiddleware)

// ─── Statistical Helpers ──────────────────────────────────────────────────────
function meanOf(v: number[]) { return v.reduce((a, b) => a + b, 0) / v.length }
function sdOf(v: number[]) {
  const m = meanOf(v)
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1))
}
function skewOf(v: number[]) {
  const n = v.length, m = meanOf(v), s = sdOf(v)
  if (s === 0 || n < 3) return 0
  return (n / ((n - 1) * (n - 2))) * v.reduce((a, x) => a + ((x - m) / s) ** 3, 0)
}

// CLSI EP28-A3c rank-based percentile
function pctile(sorted: number[], p: number) {
  const rank = p / 100 * (sorted.length + 1)
  const lo = Math.max(0, Math.floor(rank) - 1)
  const hi = Math.min(sorted.length - 1, Math.ceil(rank) - 1)
  return sorted[lo] + (rank - Math.floor(rank)) * (sorted[hi] - sorted[lo])
}

// Grubbs test (iterative single outlier removal, α=0.05)
const GRUBBS_CRIT: Record<number, number> = {
  10: 2.29, 15: 2.55, 20: 2.71, 25: 2.82, 30: 2.91,
  40: 3.04, 50: 3.13, 60: 3.20, 80: 3.31, 100: 3.38,
  120: 3.44, 150: 3.51, 200: 3.60,
}
function grubbsCrit(n: number) {
  const keys = Object.keys(GRUBBS_CRIT).map(Number).sort((a, b) => a - b)
  let c = 3.0
  for (const k of keys) { if (n >= k) c = GRUBBS_CRIT[k] }
  return c
}
function grubbsOutlier(sorted: number[]): number {
  const m = meanOf(sorted), s = sdOf(sorted), n = sorted.length
  const crit = grubbsCrit(n)
  const Gmax = (sorted[n - 1] - m) / s
  const Gmin = (m - sorted[0]) / s
  if (Gmax >= Gmin && Gmax > crit) return n - 1
  if (Gmin > Gmax && Gmin > crit) return 0
  return -1
}

// Simple LCG RNG for reproducible bootstrap in Worker
function makeLcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function bootstrap90CI(sorted: number[], nBoot = 500) {
  const n = sorted.length
  const lows: number[] = [], highs: number[] = []
  const rng = makeLcg(20240101)
  for (let b = 0; b < nBoot; b++) {
    const samp = Array.from({ length: n }, () => sorted[Math.floor(rng() * n)]).sort((a, b) => a - b)
    lows.push(pctile(samp, 2.5))
    highs.push(pctile(samp, 97.5))
  }
  lows.sort((a, b) => a - b); highs.sort((a, b) => a - b)
  const p5 = Math.floor(0.05 * nBoot), p95 = Math.floor(0.95 * nBoot)
  return { lower_ci_lo: lows[p5], lower_ci_hi: lows[p95], upper_ci_lo: highs[p5], upper_ci_hi: highs[p95] }
}

function computeRI(rawValues: number[]) {
  const sorted = [...rawValues].sort((a, b) => a - b)
  const maxRemove = Math.max(0, Math.floor(sorted.length * 0.05))
  const removedValues: number[] = []
  let clean = sorted

  for (let i = 0; i < maxRemove && clean.length >= 20; i++) {
    const idx = grubbsOutlier(clean)
    if (idx === -1) break
    removedValues.push(clean[idx])
    clean = clean.filter((_, j) => j !== idx)
  }

  const n = clean.length
  const m = meanOf(clean), s = sdOf(clean)
  const med = pctile(clean, 50), sk = skewOf(clean)
  const nonparam = Math.abs(sk) > 0.5 || n < 40

  const lower = nonparam ? pctile(clean, 2.5) : m - 1.96 * s
  const upper = nonparam ? pctile(clean, 97.5) : m + 1.96 * s
  const ci = bootstrap90CI(clean, 500)
  const round = (x: number) => Math.round(x * 10000) / 10000

  return {
    n, n_outliers: removedValues.length,
    mean_val: round(m), sd_val: round(s), cv_pct: round((s / Math.abs(m)) * 100),
    median_val: round(med), skewness: round(sk),
    distribution_type: Math.abs(sk) < 0.5 ? 'normal' : 'non-normal',
    method_used: nonparam ? 'nonparametric' : 'parametric',
    lower_limit: round(lower), upper_limit: round(upper),
    lower_ci_lo: round(ci.lower_ci_lo), lower_ci_hi: round(ci.lower_ci_hi),
    upper_ci_lo: round(ci.upper_ci_lo), upper_ci_hi: round(ci.upper_ci_hi),
    outliers_removed: removedValues,
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /reference-lab/direct
app.get('/', async (c) => {
  const { lab_id } = c.get('user')
  const { results } = await c.env.DB.prepare(
    `SELECT id, analyte_name, population_group, sex, unit, n_subjects, lower_limit, upper_limit,
            distribution_type, method_used, status, created_at
     FROM ri_direct_studies WHERE lab_id = ? ORDER BY created_at DESC`
  ).bind(lab_id).all()
  return c.json({ data: results })
})

// POST /reference-lab/direct  — create study
app.post('/', async (c) => {
  const { lab_id } = c.get('user')
  const body = await c.req.json<{
    analyte_name: string; population_group?: string; sex?: string
    age_min?: number; age_max?: number; sample_type?: string; unit: string
    method?: string; instrument?: string; notes?: string
  }>()
  if (!body.analyte_name || !body.unit) return c.json({ error: 'analyte_name and unit required' }, 400)
  const id = crypto.randomUUID(), now = new Date().toISOString()
  await c.env.DB.prepare(
    `INSERT INTO ri_direct_studies
      (id,lab_id,analyte_name,population_group,sex,age_min,age_max,sample_type,unit,method,instrument,notes,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'in_progress',?,?)`
  ).bind(
    id, lab_id, body.analyte_name,
    body.population_group ?? 'adult', body.sex ?? 'both',
    body.age_min ?? null, body.age_max ?? null,
    body.sample_type ?? 'serum', body.unit,
    body.method ?? '', body.instrument ?? '',
    body.notes ?? '', now, now
  ).run()
  return c.json({ id })
})

// GET /reference-lab/direct/:id  — full study with data
app.get('/:id', async (c) => {
  const { lab_id } = c.get('user')
  const id = c.req.param('id')
  const study = await c.env.DB.prepare(
    'SELECT * FROM ri_direct_studies WHERE id = ? AND lab_id = ?'
  ).bind(id, lab_id).first()
  if (!study) return c.json({ error: 'Not found' }, 404)
  const { results: dataPoints } = await c.env.DB.prepare(
    'SELECT id, value, excluded, exclude_reason FROM ri_study_data WHERE study_id = ? ORDER BY value'
  ).bind(id).all()
  return c.json({ data: { ...study, data_points: dataPoints } })
})

// POST /reference-lab/direct/:id/data  — bulk add values
app.post('/:id/data', async (c) => {
  const { lab_id } = c.get('user')
  const id = c.req.param('id')
  const study = await c.env.DB.prepare(
    'SELECT id FROM ri_direct_studies WHERE id = ? AND lab_id = ?'
  ).bind(id, lab_id).first()
  if (!study) return c.json({ error: 'Not found' }, 404)

  const { values } = await c.req.json<{ values: number[] }>()
  if (!Array.isArray(values) || values.length === 0) return c.json({ error: 'values array required' }, 400)

  const now = new Date().toISOString()
  const stmts = values.map(v =>
    c.env.DB.prepare(
      'INSERT INTO ri_study_data (id, study_id, lab_id, value, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), id, lab_id, v, now)
  )
  await c.env.DB.batch(stmts)

  const { results: all } = await c.env.DB.prepare(
    'SELECT value FROM ri_study_data WHERE study_id = ? AND excluded = 0'
  ).bind(id).all<{ value: number }>()
  await c.env.DB.prepare(
    'UPDATE ri_direct_studies SET n_subjects = ?, updated_at = ? WHERE id = ?'
  ).bind(all.length, now, id).run()

  return c.json({ ok: true, n: all.length })
})

// DELETE /reference-lab/direct/:id/data  — clear all data
app.delete('/:id/data', async (c) => {
  const { lab_id } = c.get('user')
  const id = c.req.param('id')
  await c.env.DB.prepare(
    'DELETE FROM ri_study_data WHERE study_id = ? AND lab_id = ?'
  ).bind(id, lab_id).run()
  await c.env.DB.prepare(
    'UPDATE ri_direct_studies SET n_subjects = 0, updated_at = ? WHERE id = ? AND lab_id = ?'
  ).bind(new Date().toISOString(), id, lab_id).run()
  return c.json({ ok: true })
})

// POST /reference-lab/direct/:id/calculate
app.post('/:id/calculate', async (c) => {
  const { lab_id } = c.get('user')
  const id = c.req.param('id')
  const { results } = await c.env.DB.prepare(
    'SELECT value FROM ri_study_data WHERE study_id = ? AND excluded = 0'
  ).bind(id).all<{ value: number }>()

  if (results.length < 20) return c.json({ error: 'At least 20 data points required (120 recommended per CLSI EP28-A3c).' }, 400)

  const ri = computeRI(results.map(r => r.value))
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    UPDATE ri_direct_studies SET
      n_subjects=?, lower_limit=?, upper_limit=?,
      lower_ci_lo=?, lower_ci_hi=?, upper_ci_lo=?, upper_ci_hi=?,
      mean_val=?, sd_val=?, cv_pct=?, median_val=?, skewness=?,
      distribution_type=?, method_used=?, outliers_removed=?,
      status='complete', updated_at=?
    WHERE id=? AND lab_id=?`
  ).bind(
    ri.n, ri.lower_limit, ri.upper_limit,
    ri.lower_ci_lo, ri.lower_ci_hi, ri.upper_ci_lo, ri.upper_ci_hi,
    ri.mean_val, ri.sd_val, ri.cv_pct, ri.median_val, ri.skewness,
    ri.distribution_type, ri.method_used, ri.n_outliers,
    now, id, lab_id
  ).run()

  return c.json({ data: ri })
})

// DELETE /reference-lab/direct/:id
app.delete('/:id', async (c) => {
  const { lab_id } = c.get('user')
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM ri_direct_studies WHERE id = ? AND lab_id = ?').bind(id, lab_id).run()
  return c.json({ ok: true })
})

export default app
