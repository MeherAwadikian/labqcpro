import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../../middleware/auth'
import { subscriptionMiddleware, requireWriteAccess } from '../../middleware/subscription'

type Bindings = { DB: D1Database; R2: R2Bucket }

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', authMiddleware, subscriptionMiddleware)

const calibratorSchema = z.object({
  analyte_id:             z.string().uuid().optional(),
  calibrator_name:        z.string().min(1),
  manufacturer:           z.string().min(1),
  lot_number:             z.string().min(1),
  received_date:          z.string(),
  open_date:              z.string().optional(),
  expiry_date:            z.string(),
  open_stability_days:    z.number().int().optional(),
  traceability_statement: z.string().default(''),
  si_unit_traceable:      z.boolean().default(false),
})

// GET /iqcp/calibrators
app.get('/', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(`
    SELECT cl.*, a.name as analyte_name
    FROM calibrator_lots cl
    LEFT JOIN analytes a ON cl.analyte_id = a.id
    WHERE cl.lab_id = ?
    ORDER BY cl.expiry_date ASC
  `).bind(user.lab_id).all()

  const now = new Date()
  const enriched = (results as any[]).map(r => {
    const expiry = new Date(r.expiry_date)
    const daysToExpiry = Math.ceil((expiry.getTime() - now.getTime()) / 86400000)
    const openExpiry = r.open_date && r.open_stability_days
      ? new Date(new Date(r.open_date).getTime() + r.open_stability_days * 86400000)
      : null
    const openExpired = openExpiry ? now > openExpiry : false
    return { ...r, days_to_expiry: daysToExpiry, open_vial_expired: openExpired }
  })

  return c.json({ data: enriched })
})

// POST /iqcp/calibrators
app.post('/', requireWriteAccess(), zValidator('json', calibratorSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(
    `INSERT INTO calibrator_lots (id, lab_id, analyte_id, calibrator_name, manufacturer, lot_number,
       received_date, open_date, expiry_date, open_stability_days, traceability_statement,
       si_unit_traceable, verification_status, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'active', ?)`
  ).bind(id, user.lab_id, body.analyte_id ?? null, body.calibrator_name, body.manufacturer,
    body.lot_number, body.received_date, body.open_date ?? null, body.expiry_date,
    body.open_stability_days ?? null, body.traceability_statement, body.si_unit_traceable ? 1 : 0, now).run()

  return c.json({ data: { id, ...body } }, 201)
})

// POST /iqcp/calibrators/:id/verify
app.post('/:id/verify', requireWriteAccess(), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const { analyte_id, expected_value, obtained_values, acceptance_limit = 5.0, verified_by } = await c.req.json()
  // obtained_values: number[] — at least 5 replicates

  const lot = await c.env.DB.prepare(
    'SELECT id FROM calibrator_lots WHERE id = ? AND lab_id = ?'
  ).bind(id, user.lab_id).first()
  if (!lot) return c.json({ error: 'Not found' }, 404)

  const obtained = Array.isArray(obtained_values) ? obtained_values : [obtained_values]
  const obtainedMean = obtained.reduce((a: number, b: number) => a + b, 0) / obtained.length
  const pctDiff = Math.abs((obtainedMean - expected_value) / expected_value * 100)
  const passed = pctDiff <= acceptance_limit
  const now = new Date().toISOString()

  const resId = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO calibrator_verification_results
       (id, calibrator_lot_id, analyte_id, expected_value, obtained_value, percent_difference, acceptance_limit, passed, verified_by, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(resId, id, analyte_id, expected_value, obtainedMean, pctDiff, acceptance_limit, passed ? 1 : 0, verified_by, now).run()

  await c.env.DB.prepare(
    'UPDATE calibrator_lots SET verification_status = ? WHERE id = ?'
  ).bind(passed ? 'passed' : 'failed', id).run()

  if (!passed) {
    await c.env.DB.prepare(
      `INSERT INTO compliance_alerts (id, lab_id, alert_type, severity, description, entity_type, entity_id, created_at)
       VALUES (?, ?, 'calibrator_verification_failed', 'critical', ?, 'calibrator_lot', ?, ?)`
    ).bind(
      crypto.randomUUID(), user.lab_id,
      `Calibrator lot ID ${id} failed verification: ${pctDiff.toFixed(2)}% difference exceeds ±${acceptance_limit}% limit`,
      id, now
    ).run()
  }

  return c.json({ data: { passed, percent_difference: pctDiff, obtained_mean: obtainedMean } })
})

// POST /iqcp/calibrators/:id/upload-coa — upload Certificate of Analysis
app.post('/:id/upload-coa', requireWriteAccess(), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()

  const lot = await c.env.DB.prepare(
    'SELECT id FROM calibrator_lots WHERE id = ? AND lab_id = ?'
  ).bind(id, user.lab_id).first()
  if (!lot) return c.json({ error: 'Not found' }, 404)

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'file required' }, 400)

  const key = `${user.lab_id}/coa/${id}-${crypto.randomUUID()}.pdf`
  const buffer = await file.arrayBuffer()
  await c.env.R2.put(key, buffer, { httpMetadata: { contentType: 'application/pdf' } })

  await c.env.DB.prepare('UPDATE calibrator_lots SET r2_key_coa = ? WHERE id = ?').bind(key, id).run()
  return c.json({ data: { r2_key_coa: key } })
})

// GET /iqcp/calibrators/:id/verification-results
app.get('/:id/verification-results', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const lot = await c.env.DB.prepare(
    'SELECT id FROM calibrator_lots WHERE id = ? AND lab_id = ?'
  ).bind(id, user.lab_id).first()
  if (!lot) return c.json({ error: 'Not found' }, 404)

  const { results } = await c.env.DB.prepare(
    'SELECT cvr.*, a.name as analyte_name FROM calibrator_verification_results cvr JOIN analytes a ON cvr.analyte_id = a.id WHERE cvr.calibrator_lot_id = ? ORDER BY cvr.verified_at DESC'
  ).bind(id).all()
  return c.json({ data: results })
})

export default app
