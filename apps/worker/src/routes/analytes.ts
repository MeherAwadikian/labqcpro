import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth'
import { subscriptionMiddleware, requireWriteAccess } from '../middleware/subscription'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', authMiddleware, subscriptionMiddleware)

const analyteSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  method: z.string().default(''),
  instrument: z.string().default(''),
  amr_lower: z.number().optional(),
  amr_upper: z.number().optional(),
  tea: z.number().optional(),
})

// GET /analytes
app.get('/', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM analytes WHERE lab_id = ? ORDER BY name'
  ).bind(user.lab_id).all()
  return c.json({ data: results })
})

// POST /analytes
app.post('/', requireWriteAccess(), zValidator('json', analyteSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    'INSERT INTO analytes (id, lab_id, name, unit, method, instrument, amr_lower, amr_upper, tea, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, user.lab_id, body.name, body.unit, body.method, body.instrument, body.amr_lower ?? null, body.amr_upper ?? null, body.tea ?? null, now).run()
  return c.json({ data: { id, ...body } }, 201)
})

// PUT /analytes/:id
app.put('/:id', requireWriteAccess(), zValidator('json', analyteSchema.partial()), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const body = c.req.valid('json')
  // Verify ownership
  const existing = await c.env.DB.prepare('SELECT id FROM analytes WHERE id = ? AND lab_id = ?').bind(id, user.lab_id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const fields = Object.entries(body).map(([k]) => `${k} = ?`).join(', ')
  const values = [...Object.values(body), id]
  await c.env.DB.prepare(`UPDATE analytes SET ${fields} WHERE id = ?`).bind(...values).run()
  return c.json({ data: { id, ...body } })
})

// DELETE /analytes/:id
app.delete('/:id', requireWriteAccess(), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const existing = await c.env.DB.prepare('SELECT id FROM analytes WHERE id = ? AND lab_id = ?').bind(id, user.lab_id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  await c.env.DB.prepare('DELETE FROM analytes WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// GET /analytes/:id/stats
app.get('/:id/stats', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const existing = await c.env.DB.prepare('SELECT id FROM analytes WHERE id = ? AND lab_id = ?').bind(id, user.lab_id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const { results } = await c.env.DB.prepare('SELECT * FROM control_stats WHERE analyte_id = ?').bind(id).all()
  return c.json({ data: results })
})

// POST /analytes/:id/reference-ranges
app.post('/:id/reference-ranges', requireWriteAccess(), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const existing = await c.env.DB.prepare('SELECT id FROM analytes WHERE id = ? AND lab_id = ?').bind(id, user.lab_id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.json()
  const rrId = crypto.randomUUID()
  await c.env.DB.prepare(
    'INSERT INTO reference_ranges (id, analyte_id, age_group, sex, lower_limit, upper_limit, source) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(rrId, id, body.age_group, body.sex, body.lower_limit, body.upper_limit, body.source ?? 'Lab').run()
  return c.json({ data: { id: rrId, ...body } }, 201)
})

export default app
