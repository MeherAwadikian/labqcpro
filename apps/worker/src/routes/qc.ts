import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { subscriptionMiddleware, requireWriteAccess } from '../middleware/subscription'
import { checkWestgardRules } from '../lib/westgard'
import { mean, sd, cv } from '../lib/stats'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', authMiddleware, subscriptionMiddleware)

const qcRunSchema = z.object({
  analyte_id: z.string().uuid(),
  level: z.enum(['normal', 'abnormal']),
  value: z.number(),
  run_date: z.string(),
  operator: z.string().min(1),
  lot_number: z.string().min(1),
})

// GET /qc/runs?analyte_id=&level=&from=&to=
app.get('/runs', async (c) => {
  const user = c.get('user')
  const { analyte_id, level, from, to } = c.req.query()

  let query = `SELECT qr.* FROM qc_runs qr
    JOIN analytes a ON qr.analyte_id = a.id
    WHERE a.lab_id = ?`
  const params: unknown[] = [user.lab_id]

  if (analyte_id) { query += ' AND qr.analyte_id = ?'; params.push(analyte_id) }
  if (level)      { query += ' AND qr.level = ?';      params.push(level) }
  if (from)       { query += ' AND qr.run_date >= ?';  params.push(from) }
  if (to)         { query += ' AND qr.run_date <= ?';  params.push(to) }
  query += ' ORDER BY qr.run_date ASC, qr.created_at ASC'

  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ data: results })
})

// POST /qc/runs
app.post('/runs', requireWriteAccess(), zValidator('json', qcRunSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')

  // Verify analyte belongs to this lab
  const analyte = await c.env.DB.prepare('SELECT id, lab_id FROM analytes WHERE id = ? AND lab_id = ?')
    .bind(body.analyte_id, user.lab_id).first()
  if (!analyte) return c.json({ error: 'Analyte not found' }, 404)

  // Insert QC run
  const runId = crypto.randomUUID()
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    'INSERT INTO qc_runs (id, analyte_id, level, value, run_date, operator, lot_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(runId, body.analyte_id, body.level, body.value, body.run_date, body.operator, body.lot_number, now).run()

  // Get existing stats for this analyte+level
  const stats = await c.env.DB.prepare(
    'SELECT mean, sd FROM control_stats WHERE analyte_id = ? AND level = ?'
  ).bind(body.analyte_id, body.level).first<{ mean: number; sd: number }>()

  // Check Westgard rules if stats exist
  let violations: ReturnType<typeof checkWestgardRules> = []
  if (stats && stats.sd > 0) {
    // Get last 10 values for this analyte+level
    const { results: recentRuns } = await c.env.DB.prepare(
      'SELECT value FROM qc_runs WHERE analyte_id = ? AND level = ? ORDER BY run_date DESC, created_at DESC LIMIT 10'
    ).bind(body.analyte_id, body.level).all<{ value: number }>()
    const values = recentRuns.map(r => r.value).reverse()
    violations = checkWestgardRules(values, stats.mean, stats.sd)

    // Store violations
    for (const v of violations) {
      await c.env.DB.prepare(
        'INSERT INTO westgard_violations (id, qc_run_id, rule, severity, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), runId, v.rule, v.severity, now).run()
    }
  }

  // Recalculate stats (after every 5 runs or first 20)
  const { results: allRuns } = await c.env.DB.prepare(
    'SELECT value FROM qc_runs WHERE analyte_id = ? AND level = ? ORDER BY created_at ASC'
  ).bind(body.analyte_id, body.level).all<{ value: number }>()

  if (allRuns.length >= 5) {
    const values = allRuns.map(r => r.value)
    const m = mean(values)
    const s = sd(values, m)
    const c_val = cv(s, m)
    await c.env.DB.prepare(
      `INSERT INTO control_stats (id, analyte_id, level, mean, sd, cv, n, calculated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(analyte_id, level) DO UPDATE SET mean=excluded.mean, sd=excluded.sd, cv=excluded.cv, n=excluded.n, calculated_at=excluded.calculated_at`
    ).bind(crypto.randomUUID(), body.analyte_id, body.level, m, s, c_val, values.length, now).run()
  }

  return c.json({ data: { id: runId, ...body, violations } }, 201)
})

// GET /qc/violations?analyte_id=&days=7
app.get('/violations', async (c) => {
  const user = c.get('user')
  const { analyte_id, days } = c.req.query()
  const since = new Date(Date.now() - (parseInt(days ?? '7')) * 86400000).toISOString()

  let query = `SELECT wv.*, qr.value, qr.run_date, qr.operator, a.name as analyte_name
    FROM westgard_violations wv
    JOIN qc_runs qr ON wv.qc_run_id = qr.id
    JOIN analytes a ON qr.analyte_id = a.id
    WHERE a.lab_id = ? AND wv.created_at >= ?`
  const params: unknown[] = [user.lab_id, since]
  if (analyte_id) { query += ' AND qr.analyte_id = ?'; params.push(analyte_id) }
  query += ' ORDER BY wv.created_at DESC'

  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ data: results })
})

// POST /qc/batch — bulk CSV entry
app.post('/batch', requireWriteAccess(), async (c) => {
  const user = c.get('user')
  const { analyte_id, level, operator, lot_number, rows } = await c.req.json()
  // rows: [{ value: number, run_date: string }]
  const analyte = await c.env.DB.prepare('SELECT id FROM analytes WHERE id = ? AND lab_id = ?')
    .bind(analyte_id, user.lab_id).first()
  if (!analyte) return c.json({ error: 'Analyte not found' }, 404)

  const now = new Date().toISOString()
  const ids: string[] = []
  for (const row of rows) {
    const runId = crypto.randomUUID()
    ids.push(runId)
    await c.env.DB.prepare(
      'INSERT INTO qc_runs (id, analyte_id, level, value, run_date, operator, lot_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(runId, analyte_id, level, row.value, row.run_date, operator, lot_number, now).run()
  }
  return c.json({ data: { inserted: ids.length } }, 201)
})

export default app
