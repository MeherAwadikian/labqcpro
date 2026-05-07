import { Hono } from 'hono'
import { authMiddleware, type JWTPayload } from '../../middleware/auth'

type Bindings = { DB: D1Database }
type Variables = { user: JWTPayload }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', authMiddleware)

function computeANOVA(grid: (number | null)[][], mfrCv: number, multiplier: number) {
  const dayData: number[][] = grid.map(day =>
    day.filter((v): v is number => v !== null && isFinite(v))
  )
  const valid = dayData.filter(d => d.length >= 2)
  if (valid.length < 2) return null

  const n_reps = valid[0].length
  const n_days = valid.length
  const n_total = n_days * n_reps
  const grand_mean = valid.flat().reduce((a, b) => a + b, 0) / n_total
  const day_means = valid.map(d => d.reduce((a, b) => a + b, 0) / d.length)

  const SS_between = n_reps * day_means.reduce((s, m) => s + (m - grand_mean) ** 2, 0)
  const MS_between = SS_between / (n_days - 1)

  let SS_within = 0
  for (let i = 0; i < n_days; i++)
    for (const v of valid[i]) SS_within += (v - day_means[i]) ** 2
  const MS_within = SS_within / (n_days * (n_reps - 1))

  const SD_within = Math.sqrt(MS_within)
  const SD_between_sq = Math.max(0, (MS_between - MS_within) / n_reps)
  const SD_between = Math.sqrt(SD_between_sq)
  const SD_total = Math.sqrt(SD_within ** 2 + SD_between_sq)

  const CV_within  = grand_mean !== 0 ? (SD_within  / grand_mean) * 100 : 0
  const CV_between = grand_mean !== 0 ? (SD_between / grand_mean) * 100 : 0
  const CV_total   = grand_mean !== 0 ? (SD_total   / grand_mean) * 100 : 0

  return {
    n: n_total, grand_mean,
    within_run_sd: SD_within,   within_run_cv: CV_within,
    between_run_sd: SD_between, between_run_cv: CV_between,
    total_sd: SD_total, total_cv: CV_total,
    manufacturer_cv: mfrCv, passed: CV_total <= mfrCv * multiplier,
  }
}

app.get('/', async (c) => {
  const { lab_id } = c.get('user')
  const { results } = await c.env.DB.prepare(`
    SELECT ps.*, a.name as analyte_name, a.unit, st.total_cv, st.passed as stats_passed
    FROM precision_studies ps
    LEFT JOIN analytes a ON ps.analyte_id = a.id
    LEFT JOIN precision_stats st ON st.study_id = ps.id
    WHERE ps.lab_id = ?
    ORDER BY ps.created_at DESC LIMIT 100
  `).bind(lab_id).all()
  return c.json({ data: results })
})

app.post('/', async (c) => {
  const { lab_id } = c.get('user')
  const body = await c.req.json<{
    analyte_id?: string; study_name?: string; instrument: string; operator: string
    level: string; study_start_date: string
    manufacturer_cv_within?: number; manufacturer_cv_total?: number; acceptance_multiplier?: number
  }>()

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO precision_studies
    (id, lab_id, analyte_id, study_name, instrument, operator, level, study_start_date,
     manufacturer_cv_within, manufacturer_cv_total, acceptance_multiplier, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'in_progress',?)
  `).bind(
    id, lab_id, body.analyte_id ?? null, body.study_name ?? null,
    body.instrument, body.operator, body.level, body.study_start_date,
    body.manufacturer_cv_within ?? null, body.manufacturer_cv_total ?? null,
    body.acceptance_multiplier ?? 1.5, now
  ).run()

  return c.json({ ok: true, id })
})

app.get('/:id', async (c) => {
  const { lab_id } = c.get('user')
  const study = await c.env.DB.prepare(
    'SELECT * FROM precision_studies WHERE id = ? AND lab_id = ?'
  ).bind(c.req.param('id'), lab_id).first()
  if (!study) return c.json({ error: 'Not found' }, 404)

  const { results: reps } = await c.env.DB.prepare(
    'SELECT * FROM precision_replicates WHERE study_id = ? ORDER BY day_number, replicate_number'
  ).bind(c.req.param('id')).all()

  const stats = await c.env.DB.prepare(
    'SELECT * FROM precision_stats WHERE study_id = ?'
  ).bind(c.req.param('id')).first()

  return c.json({ data: { ...(study as object), replicates: reps, stats } })
})

app.put('/:id/replicates', async (c) => {
  const { lab_id } = c.get('user')
  const studyId = c.req.param('id')
  const study = await c.env.DB.prepare('SELECT id FROM precision_studies WHERE id = ? AND lab_id = ?')
    .bind(studyId, lab_id).first()
  if (!study) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{ day: number; values: (number | null)[]; run_date?: string; operator?: string }>()

  await c.env.DB.prepare('DELETE FROM precision_replicates WHERE study_id = ? AND day_number = ?')
    .bind(studyId, body.day).run()

  const stmts = body.values.map((val, idx) =>
    c.env.DB.prepare(
      'INSERT INTO precision_replicates (id, study_id, day_number, replicate_number, value, run_date, operator) VALUES (?,?,?,?,?,?,?)'
    ).bind(crypto.randomUUID(), studyId, body.day, idx + 1, val ?? null, body.run_date ?? null, body.operator ?? null)
  )
  if (stmts.length) await c.env.DB.batch(stmts)

  return c.json({ ok: true })
})

app.post('/:id/calculate', async (c) => {
  const { lab_id } = c.get('user')
  const studyId = c.req.param('id')
  const study = await c.env.DB.prepare('SELECT * FROM precision_studies WHERE id = ? AND lab_id = ?')
    .bind(studyId, lab_id).first<any>()
  if (!study) return c.json({ error: 'Not found' }, 404)

  const { results: reps } = await c.env.DB.prepare(
    'SELECT * FROM precision_replicates WHERE study_id = ? AND value IS NOT NULL ORDER BY day_number, replicate_number'
  ).bind(studyId).all<{ day_number: number; replicate_number: number; value: number }>()

  const grid: (number | null)[][] = Array.from({ length: 5 }, () => Array(5).fill(null))
  for (const r of reps) {
    const di = r.day_number - 1; const ri = r.replicate_number - 1
    if (di >= 0 && di < 5 && ri >= 0 && ri < 5) grid[di][ri] = r.value
  }

  const mfrCv = study.manufacturer_cv_total ?? study.manufacturer_cv_within ?? 5
  const multiplier = study.acceptance_multiplier ?? 1.5
  const result = computeANOVA(grid, mfrCv, multiplier)
  if (!result) return c.json({ error: 'Insufficient data (need ≥ 2 days with ≥ 2 replicates each)' }, 400)

  const now = new Date().toISOString()
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM precision_stats WHERE study_id = ?').bind(studyId),
    c.env.DB.prepare(`
      INSERT INTO precision_stats (id, study_id, n, grand_mean, within_run_sd, within_run_cv,
        between_run_sd, between_run_cv, total_sd, total_cv, manufacturer_cv, passed, calculated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(), studyId, result.n, result.grand_mean,
      result.within_run_sd, result.within_run_cv, result.between_run_sd, result.between_run_cv,
      result.total_sd, result.total_cv, result.manufacturer_cv, result.passed ? 1 : 0, now
    ),
    c.env.DB.prepare("UPDATE precision_studies SET status = 'complete' WHERE id = ?").bind(studyId),
  ])

  return c.json({ ok: true, stats: result })
})

app.delete('/:id', async (c) => {
  const { lab_id, role } = c.get('user')
  if (!['admin', 'director'].includes(role)) return c.json({ error: 'Insufficient permissions' }, 403)
  await c.env.DB.prepare('DELETE FROM precision_studies WHERE id = ? AND lab_id = ?')
    .bind(c.req.param('id'), lab_id).run()
  return c.json({ ok: true })
})

export default app
