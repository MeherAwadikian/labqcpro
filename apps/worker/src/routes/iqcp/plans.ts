import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../../middleware/auth'
import { subscriptionMiddleware, requireWriteAccess } from '../../middleware/subscription'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', authMiddleware, subscriptionMiddleware)

const planSchema = z.object({
  analyte_id:            z.string().uuid(),
  qc_frequency:          z.enum(['per_run', 'daily', 'per_shift', 'weekly']),
  qc_levels:             z.number().int().min(1).max(3).default(2),
  acceptance_criteria:   z.array(z.string()).default([]),
  tea_source:            z.enum(['CLIA', 'CAP', 'manufacturer', 'lab']).default('CLIA'),
  tea_value:             z.number().optional(),
  corrective_action_plan: z.string().default(''),
  review_cycle:          z.number().int().default(12),
  review_date:           z.string(),
})

// GET /iqcp/plans?analyte_id=
app.get('/', async (c) => {
  const user = c.get('user')
  const { analyte_id } = c.req.query()

  let query = `SELECT p.*, a.name as analyte_name, a.unit
    FROM iqcp_qc_plans p
    JOIN analytes a ON p.analyte_id = a.id
    WHERE p.lab_id = ?`
  const params: unknown[] = [user.lab_id]
  if (analyte_id) { query += ' AND p.analyte_id = ?'; params.push(analyte_id) }
  query += ' ORDER BY a.name'

  const { results } = await c.env.DB.prepare(query).bind(...params).all()

  // Auto-flag plans due for review
  const now = new Date().toISOString().split('T')[0]
  const enriched = results.map((r: any) => ({
    ...r,
    acceptance_criteria: JSON.parse(r.acceptance_criteria || '[]'),
    is_overdue: r.review_date < now && r.status === 'active',
  }))

  return c.json({ data: enriched })
})

// POST /iqcp/plans
app.post('/', requireWriteAccess(), zValidator('json', planSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')

  const analyte = await c.env.DB.prepare(
    'SELECT id FROM analytes WHERE id = ? AND lab_id = ?'
  ).bind(body.analyte_id, user.lab_id).first()
  if (!analyte) return c.json({ error: 'Analyte not found' }, 404)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(
    `INSERT INTO iqcp_qc_plans
       (id, lab_id, analyte_id, qc_frequency, qc_levels, acceptance_criteria, tea_source, tea_value,
        corrective_action_plan, review_cycle, review_date, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
     ON CONFLICT(lab_id, analyte_id) DO UPDATE SET
       qc_frequency=excluded.qc_frequency, qc_levels=excluded.qc_levels,
       acceptance_criteria=excluded.acceptance_criteria, tea_source=excluded.tea_source,
       tea_value=excluded.tea_value, corrective_action_plan=excluded.corrective_action_plan,
       review_cycle=excluded.review_cycle, review_date=excluded.review_date, updated_at=excluded.updated_at`
  ).bind(id, user.lab_id, body.analyte_id, body.qc_frequency, body.qc_levels,
    JSON.stringify(body.acceptance_criteria), body.tea_source, body.tea_value ?? null,
    body.corrective_action_plan, body.review_cycle, body.review_date, now, now).run()

  return c.json({ data: { id, ...body, status: 'draft' } }, 201)
})

// POST /iqcp/plans/:id/approve — requires director role
app.post('/:id/approve', requireWriteAccess(), async (c) => {
  const user = c.get('user')
  if (user.role !== 'director' && user.role !== 'admin') {
    return c.json({ error: 'Director or admin role required to approve plans' }, 403)
  }

  const { id } = c.req.param()
  const { approved_by } = await c.req.json()

  const existing = await c.env.DB.prepare(
    'SELECT id FROM iqcp_qc_plans WHERE id = ? AND lab_id = ?'
  ).bind(id, user.lab_id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE iqcp_qc_plans SET status = 'active', approved_by = ?, approval_date = ?, updated_at = ? WHERE id = ?`
  ).bind(approved_by || user.sub, now, now, id).run()

  return c.json({ data: { approved: true, approval_date: now } })
})

// PUT /iqcp/plans/:id
app.put('/:id', requireWriteAccess(), zValidator('json', planSchema.partial()), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const body = c.req.valid('json')

  const existing = await c.env.DB.prepare(
    'SELECT id FROM iqcp_qc_plans WHERE id = ? AND lab_id = ?'
  ).bind(id, user.lab_id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const now = new Date().toISOString()
  const updateBody = {
    ...body,
    acceptance_criteria: body.acceptance_criteria ? JSON.stringify(body.acceptance_criteria) : undefined,
    updated_at: now,
  }
  const fields = Object.entries(updateBody).filter(([, v]) => v !== undefined).map(([k]) => `${k} = ?`).join(', ')
  const values = [...Object.entries(updateBody).filter(([, v]) => v !== undefined).map(([, v]) => v), id]

  await c.env.DB.prepare(`UPDATE iqcp_qc_plans SET ${fields} WHERE id = ?`).bind(...values).run()
  return c.json({ data: { id, ...body } })
})

export default app
