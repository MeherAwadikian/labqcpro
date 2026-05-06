import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware } from '../../middleware/auth'
import { subscriptionMiddleware, requireWriteAccess } from '../../middleware/subscription'

type Bindings = { DB: D1Database; R2: R2Bucket }

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', authMiddleware, subscriptionMiddleware)

// GET /iqcp/cap/library?section=
app.get('/library', async (c) => {
  const { section } = c.req.query()
  let query = 'SELECT * FROM cap_standards_library'
  const params: unknown[] = []
  if (section) { query += ' WHERE section = ?'; params.push(section) }
  query += ' ORDER BY section, cap_question_id'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  const parsed = (results as any[]).map(r => ({ ...r, applicable_tests: JSON.parse(r.applicable_tests || '[]') }))
  return c.json({ data: parsed })
})

// GET /iqcp/cap/checklist?section=&analyte_id=
app.get('/checklist', async (c) => {
  const user = c.get('user')
  const { section, analyte_id } = c.req.query()

  let query = `
    SELECT ci.*, sl.section, sl.subsection, sl.requirement_text, sl.clia_reference
    FROM cap_checklist_items ci
    JOIN cap_standards_library sl ON ci.cap_question_id = sl.cap_question_id
    WHERE ci.lab_id = ?`
  const params: unknown[] = [user.lab_id]
  if (section)    { query += ' AND sl.section = ?';    params.push(section) }
  if (analyte_id) { query += ' AND ci.analyte_id = ?'; params.push(analyte_id) }
  query += ' ORDER BY sl.section, sl.cap_question_id'

  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ data: results })
})

// POST /iqcp/cap/checklist/initialize — seed lab checklist from library
app.post('/checklist/initialize', requireWriteAccess(), async (c) => {
  const user = c.get('user')
  const { results: library } = await c.env.DB.prepare(
    'SELECT cap_question_id FROM cap_standards_library'
  ).all<{ cap_question_id: string }>()

  const now = new Date().toISOString()
  let inserted = 0
  for (const item of library) {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM cap_checklist_items WHERE lab_id = ? AND cap_question_id = ?'
    ).bind(user.lab_id, item.cap_question_id).first()
    if (!existing) {
      await c.env.DB.prepare(
        `INSERT INTO cap_checklist_items (id, lab_id, cap_question_id, compliance_status, created_at)
         VALUES (?, ?, ?, 'pending', ?)`
      ).bind(crypto.randomUUID(), user.lab_id, item.cap_question_id, now).run()
      inserted++
    }
  }
  return c.json({ data: { initialized: inserted } })
})

const updateSchema = z.object({
  compliance_status: z.enum(['compliant', 'non-compliant', 'na', 'pending']),
  evidence:          z.string().default(''),
  deficiency_note:   z.string().default(''),
  inspector_note:    z.string().default(''),
  corrected_at:      z.string().optional(),
})

// PUT /iqcp/cap/checklist/:id
app.put('/checklist/:id', requireWriteAccess(), zValidator('json', updateSchema), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const body = c.req.valid('json')

  const existing = await c.env.DB.prepare(
    'SELECT id FROM cap_checklist_items WHERE id = ? AND lab_id = ?'
  ).bind(id, user.lab_id).first()
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `UPDATE cap_checklist_items SET
       compliance_status = ?, evidence = ?, deficiency_note = ?,
       inspector_note = ?, corrected_at = ?, last_reviewed = ?
     WHERE id = ?`
  ).bind(body.compliance_status, body.evidence, body.deficiency_note,
    body.inspector_note, body.corrected_at ?? null, now, id).run()

  return c.json({ data: { id, ...body, last_reviewed: now } })
})

// POST /iqcp/cap/checklist/:id/upload-evidence
app.post('/checklist/:id/upload-evidence', requireWriteAccess(), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()

  const item = await c.env.DB.prepare(
    'SELECT id FROM cap_checklist_items WHERE id = ? AND lab_id = ?'
  ).bind(id, user.lab_id).first()
  if (!item) return c.json({ error: 'Not found' }, 404)

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'file required' }, 400)

  const key = `${user.lab_id}/cap-evidence/${id}-${crypto.randomUUID()}.pdf`
  const buffer = await file.arrayBuffer()
  await c.env.R2.put(key, buffer, { httpMetadata: { contentType: 'application/pdf' } })

  await c.env.DB.prepare(
    'UPDATE cap_checklist_items SET r2_evidence_key = ? WHERE id = ?'
  ).bind(key, id).run()

  return c.json({ data: { r2_evidence_key: key } })
})

// GET /iqcp/cap/score — inspection readiness score
app.get('/score', async (c) => {
  const user = c.get('user')

  const [checklistRes, reagentsRes, plansRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN compliance_status = 'compliant' THEN 1 ELSE 0 END) as compliant,
        SUM(CASE WHEN compliance_status = 'non-compliant' THEN 1 ELSE 0 END) as non_compliant,
        SUM(CASE WHEN compliance_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN compliance_status = 'na' THEN 1 ELSE 0 END) as na
      FROM cap_checklist_items WHERE lab_id = ?
    `).bind(user.lab_id).first(),

    c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN verification_status = 'passed' THEN 1 ELSE 0 END) as verified
       FROM reagent_lots WHERE lab_id = ? AND status = 'active'`
    ).bind(user.lab_id).first<{ total: number; verified: number }>(),

    c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as approved
       FROM iqcp_qc_plans WHERE lab_id = ?`
    ).bind(user.lab_id).first<{ total: number; approved: number }>(),
  ])

  const cl = checklistRes as any
  const total = cl?.total || 0
  const applicable = total - (cl?.na || 0)
  const checklistScore = applicable > 0 ? ((cl?.compliant || 0) / applicable) * 100 : 100
  const reagentScore = reagentsRes && reagentsRes.total > 0
    ? (reagentsRes.verified / reagentsRes.total) * 100 : 100
  const planScore = plansRes && plansRes.total > 0
    ? (plansRes.approved / plansRes.total) * 100 : 100

  const overallScore = Math.round((checklistScore * 0.5) + (reagentScore * 0.25) + (planScore * 0.25))

  return c.json({
    data: {
      overall_score: overallScore,
      checklist: { ...cl, applicable, score: Math.round(checklistScore) },
      reagents: { ...reagentsRes, score: Math.round(reagentScore) },
      plans: { ...plansRes, score: Math.round(planScore) },
    },
  })
})

// GET /iqcp/cap/alerts
app.get('/alerts', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM compliance_alerts WHERE lab_id = ? AND resolved_at IS NULL ORDER BY severity DESC, created_at DESC`
  ).bind(user.lab_id).all()
  return c.json({ data: results })
})

// POST /iqcp/cap/alerts/:id/resolve
app.post('/alerts/:id/resolve', requireWriteAccess(), async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    'UPDATE compliance_alerts SET resolved_at = ? WHERE id = ? AND lab_id = ?'
  ).bind(now, id, user.lab_id).run()
  return c.json({ data: { resolved: true } })
})

export default app
