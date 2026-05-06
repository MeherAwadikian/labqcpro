import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../../middleware/auth'
import { subscriptionMiddleware, requireWriteAccess } from '../../middleware/subscription'
import { mean, sd, cv } from '../../lib/stats'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', authMiddleware, subscriptionMiddleware)

const reagentSchema = z.object({
  analyte_id:   z.string().uuid().optional(),
  reagent_name: z.string().min(1),
  manufacturer: z.string().min(1),
  lot_number:   z.string().min(1),
  received_date: z.string(),
  open_date:    z.string().optional(),
  expiry_date:  z.string(),
})

// GET /iqcp/reagents
app.get('/', async (c) => {
  const user = c.get('user')
  const { status } = c.req.query()

  let query = `SELECT r.*, a.name as analyte_name
    FROM reagent_lots r
    LEFT JOIN analytes a ON r.analyte_id = a.id
    WHERE r.lab_id = ?`
  const params: unknown[] = [user.lab_id]
  if (status) { query += ' AND r.status = ?'; params.push(status) }
  query += ' ORDER BY r.expiry_date ASC'

  const { results } = await c.env.DB.prepare(query).bind(...params).all()

  // Enrich with days-to-expiry
  const now = new Date()
  const enriched = (results as any[]).map(r => {
    const expiry = new Date(r.extended_expiry_date || r.expiry_date)
    const daysToExpiry = Math.ceil((expiry.getTime() - now.getTime()) / 86400000)
    return { ...r, days_to_expiry: daysToExpiry }
  })

  return c.json({ data: enriched })
})

// POST /iqcp/reagents
app.post('/', requireWriteAccess(), zValidator('json', reagentSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(
    `INSERT INTO reagent_lots (id, lab_id, analyte_id, reagent_name, manufacturer, lot_number,
       received_date, open_date, expiry_date, status, verification_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'pending', ?)`
  ).bind(id, user.lab_id, body.analyte_id ?? null, body.reagent_name, body.manufacturer,
    body.lot_number, body.received_date, body.open_date ?? null, body.expiry_date, now).run()

  // Create compliance alert if expiry < 14 days
  const daysToExpiry = Math.ceil((new Date(body.expiry_date).getTime() - Date.now()) / 86400000)
  if (daysToExpiry < 14) {
    await c.env.DB.prepare(
      `INSERT INTO compliance_alerts (id, lab_id, alert_type, severity, description, entity_type, entity_id, due_date, created_at)
       VALUES (?, ?, 'reagent_expiry', ?, ?, 'reagent_lot', ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), user.lab_id,
      daysToExpiry <= 0 ? 'critical' : daysToExpiry < 7 ? 'major' : 'minor',
      `Reagent "${body.reagent_name}" lot ${body.lot_number} expires on ${body.expiry_date}`,
      id, body.expiry_date, now
    ).run()
  }

  return c.json({ data: { id, ...body } }, 201)
})

// PUT /iqcp/reagents/:id
app.put('/:id', requireWriteAccess(), zValidator('json', reagentSchema.partial().extend({
  status: z.enum(['active', 'expired', 'extended', 'quarantine']).optional(),
  verification_status: z.enum(['pending', 'passed', 'failed']).optional(),
})), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const body = c.req.valid('json')

  const existing = await c.env.DB.prepare(
    'SELECT id FROM reagent_lots WHERE id = ? AND lab_id = ?'
  ).bind(id, user.lab_id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const fields = Object.keys(body).map(k => `${k} = ?`).join(', ')
  const values = [...Object.values(body), id]
  await c.env.DB.prepare(`UPDATE reagent_lots SET ${fields} WHERE id = ?`).bind(...values).run()
  return c.json({ data: { id, ...body } })
})

// POST /iqcp/reagents/:id/verify
app.post('/:id/verify', requireWriteAccess(), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const { results: verifyResults, acceptance_pct = 10, tested_by } = await c.req.json()
  // verifyResults: [{ test_performed, result_value }]

  const lot = await c.env.DB.prepare(
    'SELECT r.*, cs.mean, cs.sd FROM reagent_lots r LEFT JOIN control_stats cs ON cs.analyte_id = r.analyte_id AND cs.level = \'normal\' WHERE r.id = ? AND r.lab_id = ?'
  ).bind(id, user.lab_id).first<{ id: string; analyte_id: string; mean: number; sd: number }>()
  if (!lot) return c.json({ error: 'Not found' }, 404)

  const now = new Date().toISOString()
  const insertedResults = []
  let allPassed = true

  for (const r of verifyResults) {
    const criteria = `Within ±${acceptance_pct}% of current lot mean`
    const pctDiff = lot.mean ? Math.abs((r.result_value - lot.mean) / lot.mean * 100) : 0
    const passed = pctDiff <= acceptance_pct

    if (!passed) allPassed = false

    const resId = crypto.randomUUID()
    await c.env.DB.prepare(
      `INSERT INTO reagent_verification_results (id, reagent_lot_id, test_performed, result_value, acceptance_criteria, passed, tested_by, tested_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(resId, id, r.test_performed, r.result_value, criteria, passed ? 1 : 0, tested_by, now, r.notes ?? '').run()

    insertedResults.push({ id: resId, passed, pct_difference: pctDiff })
  }

  // Update lot verification status
  const newStatus = allPassed ? 'passed' : 'failed'
  await c.env.DB.prepare(
    'UPDATE reagent_lots SET verification_status = ?, status = ? WHERE id = ?'
  ).bind(newStatus, allPassed ? 'active' : 'quarantine', id).run()

  // If failed, generate compliance alert
  if (!allPassed) {
    await c.env.DB.prepare(
      `INSERT INTO compliance_alerts (id, lab_id, alert_type, severity, description, entity_type, entity_id, created_at)
       VALUES (?, ?, 'reagent_verification_failed', 'critical', ?, 'reagent_lot', ?, ?)`
    ).bind(
      crypto.randomUUID(), user.lab_id,
      `Reagent lot ID ${id} failed verification. Lot has been quarantined.`,
      id, now
    ).run()
  }

  return c.json({ data: { verification_status: newStatus, results: insertedResults } })
})

// GET /iqcp/reagents/:id/verification-results
app.get('/:id/verification-results', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const lot = await c.env.DB.prepare(
    'SELECT id FROM reagent_lots WHERE id = ? AND lab_id = ?'
  ).bind(id, user.lab_id).first()
  if (!lot) return c.json({ error: 'Not found' }, 404)

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM reagent_verification_results WHERE reagent_lot_id = ? ORDER BY tested_at ASC'
  ).bind(id).all()
  return c.json({ data: results })
})

export default app
