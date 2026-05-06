import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../../middleware/auth'
import { subscriptionMiddleware, requireWriteAccess } from '../../middleware/subscription'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', authMiddleware, subscriptionMiddleware)

const riskSchema = z.object({
  analyte_id:       z.string().uuid().optional(),
  risk_category:    z.string().min(1),
  risk_description: z.string().min(1),
  likelihood:       z.number().int().min(1).max(5),
  severity:         z.number().int().min(1).max(5),
  mitigation:       z.string().default(''),
})

// GET /iqcp/risk?analyte_id=
app.get('/', async (c) => {
  const user = c.get('user')
  const { analyte_id } = c.req.query()

  let query = `SELECT r.*, a.name as analyte_name FROM iqcp_risk_assessments r
    LEFT JOIN analytes a ON r.analyte_id = a.id
    WHERE r.lab_id = ?`
  const params: unknown[] = [user.lab_id]

  if (analyte_id) { query += ' AND r.analyte_id = ?'; params.push(analyte_id) }
  query += ' ORDER BY r.risk_score DESC, r.created_at DESC'

  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ data: results })
})

// POST /iqcp/risk
app.post('/', requireWriteAccess(), zValidator('json', riskSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(
    `INSERT INTO iqcp_risk_assessments
       (id, lab_id, analyte_id, risk_category, risk_description, likelihood, severity, mitigation, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user.lab_id, body.analyte_id ?? null, body.risk_category, body.risk_description,
    body.likelihood, body.severity, body.mitigation, now, now).run()

  return c.json({ data: { id, ...body, risk_score: body.likelihood * body.severity } }, 201)
})

// PUT /iqcp/risk/:id
app.put('/:id', requireWriteAccess(), zValidator('json', riskSchema.partial()), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const body = c.req.valid('json')

  const existing = await c.env.DB.prepare(
    'SELECT id FROM iqcp_risk_assessments WHERE id = ? AND lab_id = ?'
  ).bind(id, user.lab_id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const now = new Date().toISOString()
  const fields = [...Object.keys(body).map(k => `${k} = ?`), 'updated_at = ?'].join(', ')
  const values = [...Object.values(body), now, id]
  await c.env.DB.prepare(`UPDATE iqcp_risk_assessments SET ${fields} WHERE id = ?`).bind(...values).run()
  return c.json({ data: { id, ...body } })
})

// DELETE /iqcp/risk/:id
app.delete('/:id', requireWriteAccess(), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const existing = await c.env.DB.prepare(
    'SELECT id FROM iqcp_risk_assessments WHERE id = ? AND lab_id = ?'
  ).bind(id, user.lab_id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await c.env.DB.prepare('DELETE FROM iqcp_risk_assessments WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default app
