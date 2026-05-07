import { Hono } from 'hono'
import { authMiddleware, type JWTPayload } from '../middleware/auth'
import { SignJWT } from 'jose'

type Bindings = { DB: D1Database; JWT_SECRET: string }
type Variables = { user: JWTPayload }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', authMiddleware)

async function hashPassword(pw: string): Promise<string> {
  const data = new TextEncoder().encode(pw)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─── Lab profile ──────────────────────────────────────────────────────────────
app.get('/lab', async (c) => {
  const { lab_id } = c.get('user')
  const lab = await c.env.DB.prepare('SELECT id, name, country, created_at FROM labs WHERE id = ?')
    .bind(lab_id).first()
  return c.json({ data: lab })
})

app.put('/lab', async (c) => {
  const { lab_id, role } = c.get('user')
  if (!['admin', 'director'].includes(role)) return c.json({ error: 'Insufficient permissions' }, 403)
  const { name, country } = await c.req.json<{ name: string; country: string }>()
  await c.env.DB.prepare('UPDATE labs SET name = ?, country = ? WHERE id = ?')
    .bind(name, country, lab_id).run()
  return c.json({ ok: true })
})

// ─── Users ────────────────────────────────────────────────────────────────────
app.get('/users', async (c) => {
  const { lab_id } = c.get('user')
  const { results } = await c.env.DB.prepare(
    'SELECT id, email, role, created_at FROM users WHERE lab_id = ? ORDER BY created_at ASC'
  ).bind(lab_id).all()
  return c.json({ data: results })
})

app.post('/users', async (c) => {
  const { lab_id, role } = c.get('user')
  if (!['admin', 'director'].includes(role)) return c.json({ error: 'Insufficient permissions' }, 403)
  const { email, password, newRole } = await c.req.json<{ email: string; password: string; newRole: string }>()

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (existing) return c.json({ error: 'Email already in use' }, 409)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const hash = await hashPassword(password)
  const validRole = ['admin', 'director', 'tech', 'viewer'].includes(newRole) ? newRole : 'tech'

  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, lab_id, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, email, hash, lab_id, validRole, now).run()

  return c.json({ ok: true, id })
})

app.put('/users/:id/role', async (c) => {
  const { lab_id, role, sub } = c.get('user')
  if (!['admin', 'director'].includes(role)) return c.json({ error: 'Insufficient permissions' }, 403)
  const targetId = c.req.param('id')
  if (targetId === sub) return c.json({ error: 'Cannot change your own role' }, 400)

  const { newRole } = await c.req.json<{ newRole: string }>()
  const validRole = ['admin', 'director', 'tech', 'viewer'].includes(newRole) ? newRole : 'tech'
  await c.env.DB.prepare(
    'UPDATE users SET role = ? WHERE id = ? AND lab_id = ?'
  ).bind(validRole, targetId, lab_id).run()
  return c.json({ ok: true })
})

app.delete('/users/:id', async (c) => {
  const { lab_id, role, sub } = c.get('user')
  if (!['admin', 'director'].includes(role)) return c.json({ error: 'Insufficient permissions' }, 403)
  const targetId = c.req.param('id')
  if (targetId === sub) return c.json({ error: 'Cannot remove yourself' }, 400)

  await c.env.DB.prepare('DELETE FROM users WHERE id = ? AND lab_id = ?')
    .bind(targetId, lab_id).run()
  return c.json({ ok: true })
})

// ─── Change own password ──────────────────────────────────────────────────────
app.put('/password', async (c) => {
  const { sub: userId } = c.get('user')
  const { currentPassword, newPassword } = await c.req.json<{ currentPassword: string; newPassword: string }>()

  if (newPassword.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400)

  const currentHash = await hashPassword(currentPassword)
  const user = await c.env.DB.prepare(
    'SELECT id FROM users WHERE id = ? AND password_hash = ?'
  ).bind(userId, currentHash).first()
  if (!user) return c.json({ error: 'Current password is incorrect' }, 401)

  const newHash = await hashPassword(newPassword)
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(newHash, userId).run()
  return c.json({ ok: true })
})

// ─── QC run history ───────────────────────────────────────────────────────────
app.get('/qc-history', async (c) => {
  const { lab_id } = c.get('user')
  const url = new URL(c.req.url)
  const analyte_id = url.searchParams.get('analyte_id')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 500)
  const offset = parseInt(url.searchParams.get('offset') ?? '0')

  let sql = `
    SELECT r.id, r.value, r.run_date, r.operator, r.lot_number, r.level,
           a.name as analyte_name, a.unit,
           GROUP_CONCAT(v.rule || ':' || v.severity) as violations
    FROM qc_runs r
    JOIN analytes a ON r.analyte_id = a.id
    LEFT JOIN westgard_violations v ON v.qc_run_id = r.id
    WHERE a.lab_id = ?
  `
  const bindings: unknown[] = [lab_id]
  if (analyte_id) { sql += ' AND r.analyte_id = ?'; bindings.push(analyte_id) }
  sql += ` GROUP BY r.id ORDER BY r.run_date DESC, r.created_at DESC LIMIT ? OFFSET ?`
  bindings.push(limit, offset)

  const { results } = await c.env.DB.prepare(sql).bind(...bindings).all()
  return c.json({ data: results })
})

app.delete('/qc-history/:id', async (c) => {
  const { lab_id, role } = c.get('user')
  if (!['admin', 'director'].includes(role)) return c.json({ error: 'Insufficient permissions' }, 403)
  await c.env.DB.prepare(
    `DELETE FROM qc_runs WHERE id = ? AND analyte_id IN (SELECT id FROM analytes WHERE lab_id = ?)`
  ).bind(c.req.param('id'), lab_id).run()
  return c.json({ ok: true })
})

export default app
