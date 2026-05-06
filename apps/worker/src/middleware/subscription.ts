import { createMiddleware } from 'hono/factory'
import type { JWTPayload } from './auth'

type Bindings = { DB: D1Database }
type Variables = { user: JWTPayload; readOnly: boolean }

export const subscriptionMiddleware = createMiddleware<{
  Bindings: Bindings
  Variables: Variables
}>(async (c, next) => {
  const user = c.get('user')
  const sub = await c.env.DB.prepare(
    'SELECT * FROM subscriptions WHERE lab_id = ?'
  ).bind(user.lab_id).first<{ status: string; trial_end: string; paid_until: string | null }>()

  if (!sub) {
    return c.json({ error: 'No subscription found' }, 403)
  }

  const now = new Date()
  const trialEnd = new Date(sub.trial_end)
  const paidUntil = sub.paid_until ? new Date(sub.paid_until) : null
  const gracePeriodEnd = paidUntil ? new Date(paidUntil.getTime() + 3 * 86400000) : null

  const isActive =
    sub.status === 'active' ||
    (sub.status === 'trial' && now < trialEnd) ||
    (paidUntil && now < paidUntil)

  const isGrace = gracePeriodEnd && now < gracePeriodEnd

  if (!isActive && !isGrace) {
    // Fully expired — read only enforced at route level
    c.set('readOnly', true)
  } else {
    c.set('readOnly', false)
  }

  await next()
})

export function requireWriteAccess() {
  return createMiddleware<{ Variables: Variables }>(async (c, next) => {
    if (c.get('readOnly')) {
      return c.json({ error: 'Subscription expired. Upgrade to add new data.' }, 403)
    }
    await next()
  })
}
