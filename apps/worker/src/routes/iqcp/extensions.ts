import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../../middleware/auth'
import { subscriptionMiddleware, requireWriteAccess } from '../../middleware/subscription'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', authMiddleware, subscriptionMiddleware)

const extensionSchema = z.object({
  reagent_lot_id:           z.string().uuid(),
  requested_extension_date: z.string(),
  justification:            z.string().min(200, 'Justification must be at least 200 characters'),
  supporting_data:          z.string().default(''),
  regulatory_basis:         z.string().min(1),
})

// GET /iqcp/extensions
app.get('/', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(`
    SELECT e.*, r.reagent_name, r.lot_number, r.expiry_date, r.analyte_id, a.name as analyte_name
    FROM expired_reagent_extensions e
    JOIN reagent_lots r ON e.reagent_lot_id = r.id
    LEFT JOIN analytes a ON r.analyte_id = a.id
    WHERE r.lab_id = ?
    ORDER BY e.created_at DESC
  `).bind(user.lab_id).all()
  return c.json({ data: results })
})

// POST /iqcp/extensions
app.post('/', requireWriteAccess(), zValidator('json', extensionSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')

  // Verify reagent lot belongs to this lab
  const lot = await c.env.DB.prepare(
    'SELECT id, expiry_date FROM reagent_lots WHERE id = ? AND lab_id = ?'
  ).bind(body.reagent_lot_id, user.lab_id).first<{ id: string; expiry_date: string }>()
  if (!lot) return c.json({ error: 'Reagent lot not found' }, 404)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(
    `INSERT INTO expired_reagent_extensions
       (id, reagent_lot_id, original_expiry, requested_extension_date, justification, supporting_data, regulatory_basis, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).bind(id, body.reagent_lot_id, lot.expiry_date, body.requested_extension_date,
    body.justification, body.supporting_data, body.regulatory_basis, now).run()

  return c.json({ data: { id, ...body, original_expiry: lot.expiry_date, status: 'pending' } }, 201)
})

// POST /iqcp/extensions/:id/approve — director only
app.post('/:id/approve', requireWriteAccess(), async (c) => {
  const user = c.get('user')
  if (user.role !== 'director' && user.role !== 'admin') {
    return c.json({ error: 'Director or admin role required to approve extensions' }, 403)
  }

  const { id } = c.req.param()
  const { approved_by, decision } = await c.req.json() // decision: 'approved' | 'denied'

  const extension = await c.env.DB.prepare(`
    SELECT e.*, r.lab_id FROM expired_reagent_extensions e
    JOIN reagent_lots r ON e.reagent_lot_id = r.id
    WHERE e.id = ? AND r.lab_id = ?
  `).bind(id, user.lab_id).first<{ id: string; reagent_lot_id: string; requested_extension_date: string }>()
  if (!extension) return c.json({ error: 'Not found' }, 404)

  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE expired_reagent_extensions SET status = ?, approved_by = ?, approval_date = ? WHERE id = ?`
  ).bind(decision, approved_by || user.sub, now, id).run()

  // If approved, update reagent lot
  if (decision === 'approved') {
    await c.env.DB.prepare(
      `UPDATE reagent_lots SET extended_expiry_date = ?, extension_approved_by = ?, status = 'extended' WHERE id = ?`
    ).bind(extension.requested_extension_date, approved_by || user.sub, extension.reagent_lot_id).run()
  }

  return c.json({ data: { id, status: decision, approval_date: now } })
})

export default app
