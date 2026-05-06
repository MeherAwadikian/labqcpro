import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'

type Bindings = {
  DB: D1Database
  NOWPAYMENTS_API_KEY: string
  NOWPAYMENTS_IPN_SECRET: string
  CORS_ORIGIN: string
}

const PLANS = {
  monthly: { amount: 29, currency: 'usd', days: 30 },
  yearly:  { amount: 249, currency: 'usd', days: 365 },
} as const

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', authMiddleware)

// GET /subscription/status
app.get('/status', async (c) => {
  const user = c.get('user')
  const sub = await c.env.DB.prepare(
    'SELECT * FROM subscriptions WHERE lab_id = ?'
  ).bind(user.lab_id).first<{
    status: string; trial_end: string; paid_until: string | null; updated_at: string
  }>()

  if (!sub) return c.json({ error: 'No subscription' }, 404)

  const now = new Date()
  const trialEnd = new Date(sub.trial_end)
  const paidUntil = sub.paid_until ? new Date(sub.paid_until) : null

  const daysLeft = paidUntil
    ? Math.max(0, Math.ceil((paidUntil.getTime() - now.getTime()) / 86400000))
    : sub.status === 'trial'
    ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000))
    : 0

  return c.json({
    data: {
      ...sub,
      days_left: daysLeft,
      is_active:
        sub.status === 'active' ||
        (sub.status === 'trial' && now < trialEnd) ||
        (paidUntil && now < paidUntil),
    },
  })
})

// POST /subscription/create-payment
app.post('/create-payment', async (c) => {
  const user = c.get('user')
  const { plan, pay_currency = 'btc' } = await c.req.json()

  if (!(plan in PLANS)) return c.json({ error: 'Invalid plan' }, 400)

  const { amount, currency } = PLANS[plan as keyof typeof PLANS]

  const callbackUrl = `${c.env.CORS_ORIGIN.replace('https://', 'https://worker.')}/subscription/ipn`

  const response = await fetch('https://api.nowpayments.io/v1/payment', {
    method: 'POST',
    headers: {
      'x-api-key': c.env.NOWPAYMENTS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_amount: amount,
      price_currency: currency,
      pay_currency,
      order_id: `${user.lab_id}__${plan}__${Date.now()}`,
      order_description: `LabQC Pro ${plan} subscription`,
      ipn_callback_url: callbackUrl,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return c.json({ error: 'Payment creation failed', detail: err }, 502)
  }

  const payment = await response.json() as {
    payment_id: string
    pay_address: string
    pay_amount: number
    pay_currency: string
    payment_status: string
  }

  // Store pending payment record
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `INSERT INTO payment_records (id, lab_id, nowpayments_id, plan, amount_usd, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), user.lab_id, payment.payment_id,
    plan, amount, 'pending', now
  ).run()

  return c.json({ data: payment })
})

// POST /subscription/ipn — NOWPayments webhook
app.post('/ipn', async (c) => {
  const body = await c.req.text()
  const sig = c.req.header('x-nowpayments-sig')

  // Verify HMAC signature
  const encoder = new TextEncoder()
  const keyData = encoder.encode(c.env.NOWPAYMENTS_IPN_SECRET)
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const computed = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('')

  if (computed !== sig) {
    return c.json({ error: 'Invalid signature' }, 403)
  }

  const data = JSON.parse(body) as {
    payment_id: string
    payment_status: string
    order_id: string
    price_amount: number
  }

  // Extract lab_id and plan from order_id
  const [labId, plan] = data.order_id.split('__')
  if (!labId || !plan) return c.json({ ok: true })

  const now = new Date().toISOString()

  // Update payment record
  await c.env.DB.prepare(
    'UPDATE payment_records SET status = ?, updated_at = ? WHERE nowpayments_id = ?'
  ).bind(data.payment_status, now, data.payment_id).run()

  if (data.payment_status === 'finished' || data.payment_status === 'confirmed') {
    const days = PLANS[plan as keyof typeof PLANS]?.days ?? 30

    // Extend paid_until
    const existing = await c.env.DB.prepare(
      'SELECT paid_until FROM subscriptions WHERE lab_id = ?'
    ).bind(labId).first<{ paid_until: string | null }>()

    const base = existing?.paid_until && new Date(existing.paid_until) > new Date()
      ? new Date(existing.paid_until)
      : new Date()

    const newPaidUntil = new Date(base.getTime() + days * 86400000).toISOString()

    await c.env.DB.prepare(
      `UPDATE subscriptions SET status = 'active', paid_until = ?, updated_at = ? WHERE lab_id = ?`
    ).bind(newPaidUntil, now, labId).run()
  }

  return c.json({ ok: true })
})

// GET /subscription/payments — payment history
app.get('/payments', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM payment_records WHERE lab_id = ? ORDER BY created_at DESC'
  ).bind(user.lab_id).all()
  return c.json({ data: results })
})

export default app
