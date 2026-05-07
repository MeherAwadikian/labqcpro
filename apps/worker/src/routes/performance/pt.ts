import { Hono } from 'hono'
import { authMiddleware, type JWTPayload } from '../../middleware/auth'

type Bindings = { DB: D1Database }
type Variables = { user: JWTPayload }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', authMiddleware)

app.get('/', async (c) => {
  const { lab_id } = c.get('user')
  const { results } = await c.env.DB.prepare(`
    SELECT e.*,
      COUNT(DISTINCT s.id) as analyte_count,
      SUM(s.overall_pass) as analytes_passed
    FROM pt_events e
    LEFT JOIN pt_event_summary s ON s.event_id = e.id
    WHERE e.lab_id = ?
    GROUP BY e.id
    ORDER BY e.created_at DESC LIMIT 100
  `).bind(lab_id).all()
  return c.json({ data: results })
})

app.post('/', async (c) => {
  const { lab_id } = c.get('user')
  const body = await c.req.json<{
    provider: string; program_name: string; event_code?: string
    shipment_date?: string; due_date?: string
  }>()

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO pt_events (id, lab_id, provider, program_name, event_code, shipment_date, due_date, status, created_at)
    VALUES (?,?,?,?,?,?,?,'pending',?)
  `).bind(id, lab_id, body.provider, body.program_name,
    body.event_code ?? null, body.shipment_date ?? null, body.due_date ?? null, now).run()

  return c.json({ ok: true, id })
})

app.get('/:id', async (c) => {
  const { lab_id } = c.get('user')
  const eventId = c.req.param('id')

  const event = await c.env.DB.prepare('SELECT * FROM pt_events WHERE id = ? AND lab_id = ?')
    .bind(eventId, lab_id).first()
  if (!event) return c.json({ error: 'Not found' }, 404)

  const { results: results_data } = await c.env.DB.prepare(`
    SELECT r.*, a.name as analyte_name, a.unit
    FROM pt_results r
    LEFT JOIN analytes a ON r.analyte_id = a.id
    WHERE r.event_id = ?
    ORDER BY a.name, r.sample_number
  `).bind(eventId).all()

  const { results: summaries } = await c.env.DB.prepare(`
    SELECT s.*, a.name as analyte_name
    FROM pt_event_summary s
    LEFT JOIN analytes a ON s.analyte_id = a.id
    WHERE s.event_id = ?
  `).bind(eventId).all()

  const { results: actions } = await c.env.DB.prepare(
    'SELECT * FROM pt_corrective_actions WHERE event_id = ? ORDER BY created_at DESC'
  ).bind(eventId).all()

  return c.json({ data: { ...(event as object), results: results_data, summaries, actions } })
})

app.put('/:id', async (c) => {
  const { lab_id } = c.get('user')
  const body = await c.req.json<{ status?: string; submission_date?: string }>()
  await c.env.DB.prepare(
    'UPDATE pt_events SET status = COALESCE(?, status), submission_date = COALESCE(?, submission_date) WHERE id = ? AND lab_id = ?'
  ).bind(body.status ?? null, body.submission_date ?? null, c.req.param('id'), lab_id).run()
  return c.json({ ok: true })
})

app.delete('/:id', async (c) => {
  const { lab_id, role } = c.get('user')
  if (!['admin', 'director'].includes(role)) return c.json({ error: 'Insufficient permissions' }, 403)
  await c.env.DB.prepare('DELETE FROM pt_events WHERE id = ? AND lab_id = ?')
    .bind(c.req.param('id'), lab_id).run()
  return c.json({ ok: true })
})

app.put('/:id/results', async (c) => {
  const { lab_id } = c.get('user')
  const eventId = c.req.param('id')

  const event = await c.env.DB.prepare('SELECT id FROM pt_events WHERE id = ? AND lab_id = ?')
    .bind(eventId, lab_id).first()
  if (!event) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{
    analyte_id: string
    results: Array<{
      sample_number: number; lab_result: number | null
      peer_mean?: number | null; peer_sd?: number | null
      target_value?: number | null; tea_limit?: number | null; notes?: string
    }>
  }>()

  await c.env.DB.prepare('DELETE FROM pt_results WHERE event_id = ? AND analyte_id = ?')
    .bind(eventId, body.analyte_id).run()

  const stmts = body.results.map(r => {
    const sdi = (r.peer_sd != null && r.peer_sd !== 0 && r.lab_result != null && r.peer_mean != null)
      ? (r.lab_result - r.peer_mean) / r.peer_sd : null
    const dev = (r.target_value != null && r.target_value !== 0 && r.lab_result != null)
      ? ((r.lab_result - r.target_value) / r.target_value) * 100 : null
    const score = (dev != null && r.tea_limit != null)
      ? (Math.abs(dev) <= r.tea_limit ? 'pass' : 'fail') : 'pending'

    return c.env.DB.prepare(`
      INSERT INTO pt_results (id, event_id, analyte_id, sample_number, lab_result,
        peer_mean, peer_sd, sdi_value, target_value, tea_limit, deviation_percent, score, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(), eventId, body.analyte_id, r.sample_number,
      r.lab_result ?? null, r.peer_mean ?? null, r.peer_sd ?? null, sdi,
      r.target_value ?? null, r.tea_limit ?? null, dev, score, r.notes ?? null
    )
  })
  if (stmts.length) await c.env.DB.batch(stmts)

  return c.json({ ok: true })
})

app.post('/:id/score', async (c) => {
  const { lab_id, sub: userId } = c.get('user')
  const eventId = c.req.param('id')

  const event = await c.env.DB.prepare('SELECT * FROM pt_events WHERE id = ? AND lab_id = ?')
    .bind(eventId, lab_id).first<any>()
  if (!event) return c.json({ error: 'Not found' }, 404)

  const { results: recs } = await c.env.DB.prepare(
    "SELECT analyte_id, score FROM pt_results WHERE event_id = ? AND score IN ('pass','fail')"
  ).bind(eventId).all<{ analyte_id: string; score: string }>()

  const byAnalyte: Record<string, { passed: number; total: number }> = {}
  for (const r of recs) {
    if (!byAnalyte[r.analyte_id]) byAnalyte[r.analyte_id] = { passed: 0, total: 0 }
    byAnalyte[r.analyte_id].total++
    if (r.score === 'pass') byAnalyte[r.analyte_id].passed++
  }

  const now = new Date().toISOString()
  await c.env.DB.prepare('DELETE FROM pt_event_summary WHERE event_id = ?').bind(eventId).run()

  const stmts = Object.entries(byAnalyte).map(([analyte_id, counts]) => {
    const pct = (counts.passed / counts.total) * 100
    return c.env.DB.prepare(`
      INSERT INTO pt_event_summary
      (id, event_id, analyte_id, samples_tested, samples_passed, score_percent, overall_pass, reviewed_by, reviewed_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(crypto.randomUUID(), eventId, analyte_id, counts.total, counts.passed,
      pct, pct >= 80 ? 1 : 0, userId, now)
  })
  if (stmts.length) await c.env.DB.batch(stmts)

  await c.env.DB.prepare(
    "UPDATE pt_events SET status = 'scored', submission_date = COALESCE(submission_date, ?) WHERE id = ?"
  ).bind(now, eventId).run()

  return c.json({ ok: true, analytes: byAnalyte })
})

app.post('/:id/corrective-action', async (c) => {
  const { lab_id, sub: userId } = c.get('user')
  const eventId = c.req.param('id')

  const event = await c.env.DB.prepare('SELECT id FROM pt_events WHERE id = ? AND lab_id = ?')
    .bind(eventId, lab_id).first()
  if (!event) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{
    root_cause: string; corrective_action: string
    implementation_date?: string; effectiveness_check_date?: string
  }>()

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO pt_corrective_actions
    (id, event_id, lab_id, root_cause, corrective_action, implemented_by,
     implementation_date, effectiveness_check_date, resolved, created_at)
    VALUES (?,?,?,?,?,?,?,?,0,?)
  `).bind(id, eventId, lab_id, body.root_cause, body.corrective_action,
    userId, body.implementation_date ?? null, body.effectiveness_check_date ?? null, now).run()

  return c.json({ ok: true, id })
})

app.put('/corrective-action/:actionId/resolve', async (c) => {
  const { lab_id } = c.get('user')
  await c.env.DB.prepare('UPDATE pt_corrective_actions SET resolved = 1 WHERE id = ? AND lab_id = ?')
    .bind(c.req.param('actionId'), lab_id).run()
  return c.json({ ok: true })
})

export default app
