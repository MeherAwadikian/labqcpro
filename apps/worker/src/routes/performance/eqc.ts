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
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200'), 1000)

  let sql = `
    SELECT e.*, a.name as analyte_name, a.unit
    FROM eqc_peer_comparisons e
    LEFT JOIN analytes a ON e.analyte_id = a.id
    WHERE e.lab_id = ?`
  const binds: unknown[] = [lab_id]
  if (analyte_id) { sql += ' AND e.analyte_id = ?'; binds.push(analyte_id) }
  sql += ` ORDER BY e.created_at DESC LIMIT ?`
  binds.push(limit)

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ data: results })
})

app.post('/', async (c) => {
  const { lab_id } = c.get('user')
  const body = await c.req.json<{
    analyte_id?: string; program_name: string; comparison_period: string
    lab_mean: number; peer_mean: number; peer_sd: number
    peer_group_n?: number; percentile_rank?: number; notes?: string
  }>()

  const sdi = body.peer_sd !== 0
    ? (body.lab_mean - body.peer_mean) / body.peer_sd
    : null
  const bias_from_peer = body.lab_mean - body.peer_mean
  const accepted = sdi != null ? (Math.abs(sdi) <= 2.0 ? 1 : 0) : 1

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await c.env.DB.prepare(`
    INSERT INTO eqc_peer_comparisons
    (id, lab_id, analyte_id, program_name, comparison_period, lab_mean, peer_mean, peer_sd,
     sdi, peer_group_n, percentile_rank, bias_from_peer, accepted, notes, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    id, lab_id, body.analyte_id ?? null, body.program_name, body.comparison_period,
    body.lab_mean, body.peer_mean, body.peer_sd, sdi,
    body.peer_group_n ?? null, body.percentile_rank ?? null,
    bias_from_peer, accepted, body.notes ?? null, now
  ).run()

  return c.json({ ok: true, id, sdi, bias_from_peer })
})

app.delete('/:id', async (c) => {
  const { lab_id, role } = c.get('user')
  if (!['admin', 'director'].includes(role)) return c.json({ error: 'Insufficient permissions' }, 403)
  await c.env.DB.prepare('DELETE FROM eqc_peer_comparisons WHERE id = ? AND lab_id = ?')
    .bind(c.req.param('id'), lab_id).run()
  return c.json({ ok: true })
})

export default app
