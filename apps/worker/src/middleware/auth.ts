import { createMiddleware } from 'hono/factory'
import { verify } from 'jose'

export interface JWTPayload {
  sub: string       // user id
  lab_id: string
  role: string
  exp: number
}

export const authMiddleware = createMiddleware<{
  Bindings: { JWT_SECRET: string }
  Variables: { user: JWTPayload }
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '').trim()

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const secret = new TextEncoder().encode(c.env.JWT_SECRET)
    const { payload } = await verify(token, secret)
    c.set('user', payload as unknown as JWTPayload)
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
})
