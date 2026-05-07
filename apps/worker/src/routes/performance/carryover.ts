import { Hono } from 'hono'
import { authMiddleware, type JWTPayload } from '../../middleware/auth'

type Bindings = { DB: D1Database }
type Variables = { user: JWTPayload }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', authMiddleware)

app.get('/', async (c) => {
  const { lab_id } = c.get('user')
  const url = new URL(c.req.url)
  const analyte_id = url.searchParams.get('analyte_id')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 500)

  let sql = `
    SELECT cs.*, a.name as analyte_name, a.unit
    FROM carryover_studies cs
    LEFT JOIN analytes a ON cs.analyte_id = a.id
    WHERE cs.lab_id = ?`
  const binds: unknown[] = [lab_id]
  if (analyte_id) { sql += ' AND cs.analyte_id = ?'; binds.push(analyte_id) }
  sql += ` ORDER BY cs.study_date DESC LIMIT ?`
  binds.push(limit)

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ data: results })
})

app.post('/', async (c) => {
  const { lab_id } = c.get('user')
  const body = await c.req.json<{
    analyte_id?: string; instrument: string; operator: string; study_date: string
    sample_description?: string; h1: number; h2: number; h3: number
    b1: number; b2: number; b3: number; manufacturer_limit: number; notes?: string
  }>()

  const { h1, h2, h3, b1, b2, b3, manufacturer_limit } = body
  const carryover_percent = isFinite(h3) && h3 !== 0 ? ((b1 - b3) / h3) * 100 : null
  const passed = carryover_percent != null
    ? (Math.abs(carryover_percent) <= manufacturer_limit ? 1 : 0)
    : 0

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO carryover_studies
    (id, lab_id, analyte_id, instrument, operator, study_date, sample_description,
     h1, h2, h3, b1, b2, b3, carryover_percent, manufacturer_limit, passed, notes, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, lab_id, body.analyte_id ?? null, body.instrument, body.operator,
    body.study_date, body.sample_description ?? null,
    h1, h2, h3, b1, b2, b3, carryover_percent,
    manufacturer_limit, passed, body.notes ?? null, now
  ).run()

  return c.json({ ok: true, id, carryover_percent, passed: passed === 1 })
})

app.delete('/:id', async (c) => {
  const { lab_id, role } = c.get('user')
  if (!['admin', 'director'].includes(role)) return c.json({ error: 'Insufficient permissions' }, 403)
  await c.env.DB.prepare('DELETE FROM carryover_studies WHERE id = ? AND lab_id = ?')
    .bind(c.req.param('id'), lab_id).run()
  return c.json({ ok: true })
})

export default app
