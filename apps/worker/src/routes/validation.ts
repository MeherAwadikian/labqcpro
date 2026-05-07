import { Hono } from 'hono'
import { authMiddleware, type JWTPayload } from '../middleware/auth'
import { computeStats } from '../lib/validation-stats'

type Bindings = { DB: D1Database; JWT_SECRET: string }
type Variables = { user: JWTPayload }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', authMiddleware)

// ─── List studies ─────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const { lab_id } = c.get('user')
  const { results } = await c.env.DB.prepare(`
    SELECT vs.*, a.name as analyte_name, a.unit as analyte_unit
    FROM validation_studies vs
    LEFT JOIN analytes a ON vs.analyte_id = a.id
    WHERE vs.lab_id = ?
    ORDER BY vs.created_at DESC
  `).bind(lab_id).all()
  return c.json(results)
})

// ─── Create study ─────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const { lab_id } = c.get('user')
  const body = await c.req.json<{
    study_type: string; title: string; analyte_id?: string; metadata?: object
  }>()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await c.env.DB.prepare(`
    INSERT INTO validation_studies
      (id, lab_id, analyte_id, study_type, title, status, metadata, start_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?)
  `).bind(id, lab_id, body.analyte_id ?? null, body.study_type, body.title,
    JSON.stringify(body.metadata ?? {}), now.split('T')[0], now, now).run()
  return c.json({ id })
})

// ─── Get study ────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const { lab_id } = c.get('user')
  const study = await c.env.DB.prepare(
    `SELECT vs.*, a.name as analyte_name, a.unit as analyte_unit, a.tea as analyte_tea
     FROM validation_studies vs LEFT JOIN analytes a ON vs.analyte_id = a.id
     WHERE vs.id = ? AND vs.lab_id = ?`
  ).bind(c.req.param('id'), lab_id).first()
  if (!study) return c.json({ error: 'Not found' }, 404)

  const { results: samples } = await c.env.DB.prepare(
    `SELECT * FROM validation_samples WHERE study_id = ? ORDER BY sort_order, id`
  ).bind(c.req.param('id')).all()

  const stats = await c.env.DB.prepare(
    `SELECT * FROM validation_stats WHERE study_id = ?`
  ).bind(c.req.param('id')).first()

  const { results: linearity } = await c.env.DB.prepare(
    `SELECT * FROM linearity_points WHERE study_id = ? ORDER BY concentration_level`
  ).bind(c.req.param('id')).all()

  return c.json({ ...study, samples, stats, linearity })
})

// ─── Update study ─────────────────────────────────────────────────────────────
app.put('/:id', async (c) => {
  const { lab_id } = c.get('user')
  const body = await c.req.json<{
    title?: string; status?: string; metadata?: object; conclusion?: string; end_date?: string
  }>()
  const now = new Date().toISOString()
  const parts: string[] = ['updated_at = ?']
  const vals: unknown[] = [now]
  if (body.title      !== undefined) { parts.push('title = ?');      vals.push(body.title) }
  if (body.status     !== undefined) { parts.push('status = ?');     vals.push(body.status) }
  if (body.metadata   !== undefined) { parts.push('metadata = ?');   vals.push(JSON.stringify(body.metadata)) }
  if (body.conclusion !== undefined) { parts.push('conclusion = ?'); vals.push(body.conclusion) }
  if (body.end_date   !== undefined) { parts.push('end_date = ?');   vals.push(body.end_date) }
  vals.push(c.req.param('id'), lab_id)
  await c.env.DB.prepare(
    `UPDATE validation_studies SET ${parts.join(', ')} WHERE id = ? AND lab_id = ?`
  ).bind(...vals).run()
  return c.json({ ok: true })
})

// ─── Delete study ─────────────────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const { lab_id } = c.get('user')
  await c.env.DB.prepare(
    `DELETE FROM validation_studies WHERE id = ? AND lab_id = ?`
  ).bind(c.req.param('id'), lab_id).run()
  return c.json({ ok: true })
})

// ─── Save samples ─────────────────────────────────────────────────────────────
app.put('/:id/samples', async (c) => {
  const { lab_id } = c.get('user')
  const study_id = c.req.param('id')

  // Verify ownership
  const study = await c.env.DB.prepare(
    `SELECT id FROM validation_studies WHERE id = ? AND lab_id = ?`
  ).bind(study_id, lab_id).first()
  if (!study) return c.json({ error: 'Not found' }, 404)

  const { samples } = await c.req.json<{ samples: Array<{
    id?: string; sample_id_label: string; reference_value?: number | null
    method_a_value?: number | null; method_b_value?: number | null
    replicate_number?: number; level_label?: string; run_date?: string
    operator?: string; notes?: string; sort_order?: number
  }> }>()

  // Delete existing + reinsert for simplicity
  await c.env.DB.prepare(`DELETE FROM validation_samples WHERE study_id = ?`).bind(study_id).run()

  const stmts = samples.map((s, i) =>
    c.env.DB.prepare(`
      INSERT INTO validation_samples
        (id, study_id, sample_id_label, reference_value, method_a_value, method_b_value,
         replicate_number, level_label, run_date, operator, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      s.id ?? crypto.randomUUID(), study_id, s.sample_id_label,
      s.reference_value ?? null, s.method_a_value ?? null, s.method_b_value ?? null,
      s.replicate_number ?? 1, s.level_label ?? '',
      s.run_date ?? '', s.operator ?? '', s.notes ?? '', s.sort_order ?? i
    )
  )
  if (stmts.length) await c.env.DB.batch(stmts)
  return c.json({ ok: true })
})

// ─── Calculate & persist stats ────────────────────────────────────────────────
app.post('/:id/calculate', async (c) => {
  const { lab_id } = c.get('user')
  const study_id = c.req.param('id')

  const study = await c.env.DB.prepare(
    `SELECT vs.*, a.tea as analyte_tea FROM validation_studies vs
     LEFT JOIN analytes a ON vs.analyte_id = a.id
     WHERE vs.id = ? AND vs.lab_id = ?`
  ).bind(study_id, lab_id).first<any>()
  if (!study) return c.json({ error: 'Not found' }, 404)

  const { results: samples } = await c.env.DB.prepare(
    `SELECT * FROM validation_samples WHERE study_id = ?`
  ).bind(study_id).all<any>()

  const meta = JSON.parse(study.metadata || '{}')
  const tea = Number(meta.tea ?? study.analyte_tea ?? 10)
  const rejectionLimit = meta.rejectionLimit ? Number(meta.rejectionLimit) : undefined

  const pairs = samples
    .filter((s: any) => s.method_a_value !== null && s.method_b_value !== null)
    .map((s: any) => ({ a: Number(s.method_a_value), b: Number(s.method_b_value) }))

  const st = computeStats(pairs, tea, rejectionLimit)
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO validation_stats
      (id, study_id, n, mean_a, mean_b, sd_a, sd_b, cv_a, cv_b,
       mean_difference, sd_difference, bias_percent, slope, intercept,
       r_value, r_squared, loa_upper, loa_lower, tea_limit, passed,
       extra_json, calculated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(study_id) DO UPDATE SET
      n=excluded.n, mean_a=excluded.mean_a, mean_b=excluded.mean_b,
      sd_a=excluded.sd_a, sd_b=excluded.sd_b, cv_a=excluded.cv_a, cv_b=excluded.cv_b,
      mean_difference=excluded.mean_difference, sd_difference=excluded.sd_difference,
      bias_percent=excluded.bias_percent, slope=excluded.slope, intercept=excluded.intercept,
      r_value=excluded.r_value, r_squared=excluded.r_squared,
      loa_upper=excluded.loa_upper, loa_lower=excluded.loa_lower,
      tea_limit=excluded.tea_limit, passed=excluded.passed,
      extra_json=excluded.extra_json, calculated_at=excluded.calculated_at
  `).bind(
    crypto.randomUUID(), study_id, st.n, st.mean_a, st.mean_b, st.sd_a, st.sd_b, st.cv_a, st.cv_b,
    st.mean_difference, st.sd_difference, st.bias_percent, st.slope, st.intercept,
    st.r_value, st.r_squared, st.loa_upper, st.loa_lower, st.tea_limit,
    st.passed ? 1 : 0,
    JSON.stringify({ n_exceeding: st.n_exceeding, slope_ci: [st.slope_ci_low, st.slope_ci_high],
      intercept_ci: [st.intercept_ci_low, st.intercept_ci_high] }),
    now
  ).run()

  // Update study status
  await c.env.DB.prepare(
    `UPDATE validation_studies SET status = ?, end_date = ?, updated_at = ? WHERE id = ?`
  ).bind('complete', now.split('T')[0], now, study_id).run()

  return c.json({ ok: true, stats: st })
})

// ─── Approve ──────────────────────────────────────────────────────────────────
app.put('/:id/approve', async (c) => {
  const { lab_id, sub: user_id, role } = c.get('user')
  if (!['admin', 'director'].includes(role)) return c.json({ error: 'Director role required' }, 403)
  const { conclusion } = await c.req.json<{ conclusion?: string }>()
  const now = new Date().toISOString()
  const parts = ['status = ?', 'approved_by = ?', 'approval_date = ?', 'updated_at = ?']
  const vals: unknown[] = ['approved', user_id, now, now]
  if (conclusion !== undefined) { parts.push('conclusion = ?'); vals.push(conclusion) }
  vals.push(c.req.param('id'), lab_id)
  await c.env.DB.prepare(
    `UPDATE validation_studies SET ${parts.join(', ')} WHERE id = ? AND lab_id = ?`
  ).bind(...vals).run()
  return c.json({ ok: true })
})

// ─── Save linearity points ────────────────────────────────────────────────────
app.put('/:id/linearity', async (c) => {
  const { lab_id } = c.get('user')
  const study_id = c.req.param('id')
  const study = await c.env.DB.prepare(
    `SELECT id FROM validation_studies WHERE id = ? AND lab_id = ?`
  ).bind(study_id, lab_id).first()
  if (!study) return c.json({ error: 'Not found' }, 404)

  const { points } = await c.req.json<{ points: Array<{
    concentration_level: number; expected_value: number
    observed_value_1: number; observed_value_2?: number
    mean_observed: number; percent_deviation: number; within_limit: boolean
  }> }>()

  await c.env.DB.prepare(`DELETE FROM linearity_points WHERE study_id = ?`).bind(study_id).run()
  const stmts = points.map(p =>
    c.env.DB.prepare(`
      INSERT INTO linearity_points
        (id, study_id, concentration_level, expected_value, observed_value_1,
         observed_value_2, mean_observed, percent_deviation, within_limit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), study_id, p.concentration_level, p.expected_value,
      p.observed_value_1, p.observed_value_2 ?? null,
      p.mean_observed, p.percent_deviation, p.within_limit ? 1 : 0
    )
  )
  if (stmts.length) await c.env.DB.batch(stmts)
  return c.json({ ok: true })
})

export default app
