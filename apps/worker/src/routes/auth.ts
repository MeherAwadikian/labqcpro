import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { SignJWT } from 'jose'

type Bindings = { DB: D1Database; JWT_SECRET: string }

const app = new Hono<{ Bindings: Bindings }>()

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  lab_name: z.string().min(2),
  country: z.string().min(2),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

// Simple password hashing using Web Crypto API (available in Workers)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function issueJWT(payload: object, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret)
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(key)
}

// POST /auth/register
app.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, lab_name, country } = c.req.valid('json')

  // Check duplicate email
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (existing) return c.json({ error: 'Email already registered' }, 409)

  const labId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  const now = new Date().toISOString()
  const trialEnd = new Date(Date.now() + 7 * 86400000).toISOString()

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO labs (id, name, country, created_at) VALUES (?, ?, ?, ?)')
      .bind(labId, lab_name, country, now),
    c.env.DB.prepare('INSERT INTO users (id, email, password_hash, lab_id, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(userId, email, passwordHash, labId, 'admin', now),
    c.env.DB.prepare('INSERT INTO subscriptions (id, lab_id, status, trial_end, paid_until, updated_at) VALUES (?, ?, ?, ?, NULL, ?)')
      .bind(crypto.randomUUID(), labId, 'trial', trialEnd, now),
  ])

  const token = await issueJWT({ sub: userId, lab_id: labId, role: 'admin' }, c.env.JWT_SECRET)
  return c.json({ token, lab_id: labId, user_id: userId })
})

// POST /auth/login
app.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json')
  const passwordHash = await hashPassword(password)

  const user = await c.env.DB.prepare(
    'SELECT id, lab_id, role FROM users WHERE email = ? AND password_hash = ?'
  ).bind(email, passwordHash).first<{ id: string; lab_id: string; role: string }>()

  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const token = await issueJWT({ sub: user.id, lab_id: user.lab_id, role: user.role }, c.env.JWT_SECRET)
  return c.json({ token, lab_id: user.lab_id, user_id: user.id, role: user.role })
})

// GET /auth/me
app.get('/me', async (c) => {
  const auth = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)
  // Token already verified by authMiddleware upstream
  return c.json({ ok: true })
})

export default app
