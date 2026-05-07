import { Hono } from 'hono'
import { authMiddleware, type JWTPayload } from '../middleware/auth'

type Bindings = { DB: D1Database }
type Variables = { user: JWTPayload }

// ─── Constants ────────────────────────────────────────────────────────────────
const WALLET        = '0xc7D81F5992cb570e7487DD78b22A3eB53a438d6e'
const USDT_CONTRACT = '0xdac17f958d2ee523a2206206994597c13d831ec7' // ERC-20 Ethereum mainnet
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const ETH_RPC       = 'https://cloudflare-eth.com/'
// Wallet padded to 32 bytes as it appears in Transfer event topics
const WALLET_TOPIC  = '0x000000000000000000000000' + WALLET.slice(2).toLowerCase()

const PLANS = {
  monthly: { amount_usdt: 29,  days: 30,  label: 'Monthly' },
  yearly:  { amount_usdt: 249, days: 365, label: 'Yearly'  },
} as const

type PlanKey = keyof typeof PLANS

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function ethRpc(method: string, params: unknown[]) {
  const res = await fetch(ETH_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = await res.json() as { result?: any; error?: { message: string } }
  if (json.error) throw new Error(`RPC: ${json.error.message}`)
  return json.result
}

async function verifyUSDTPayment(txHash: string, minUsdt: number) {
  const receipt = await ethRpc('eth_getTransactionReceipt', [txHash])

  if (!receipt) {
    throw new Error('Transaction not found. It may still be pending — wait for at least 6 confirmations.')
  }
  if (receipt.status !== '0x1') {
    throw new Error('Transaction failed on-chain (status 0x0). No funds were transferred.')
  }

  const logs: any[] = receipt.logs ?? []
  const log = logs.find(l =>
    l.address?.toLowerCase() === USDT_CONTRACT &&
    l.topics?.[0] === TRANSFER_TOPIC &&
    l.topics?.[2]?.toLowerCase() === WALLET_TOPIC
  )

  if (!log) {
    throw new Error(
      'No USDT (ERC-20) transfer to the payment address found in this transaction. ' +
      'Make sure you sent USDT on the Ethereum mainnet (not BNB, Polygon, or Tron).'
    )
  }

  // USDT has 6 decimals
  const amountUnits = BigInt(log.data)
  const amountUsdt  = Number(amountUnits) / 1_000_000

  if (amountUsdt < minUsdt - 0.01) { // allow 1 cent tolerance for rounding
    throw new Error(
      `Amount too low: ${amountUsdt.toFixed(2)} USDT received, ${minUsdt} USDT required.`
    )
  }

  return { amount_usdt: amountUsdt }
}

// ─── App ──────────────────────────────────────────────────────────────────────
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', authMiddleware)

// GET /subscription/status
app.get('/status', async (c) => {
  const { lab_id } = c.get('user')
  const sub = await c.env.DB.prepare(
    'SELECT * FROM subscriptions WHERE lab_id = ?'
  ).bind(lab_id).first<{ status: string; trial_end: string; paid_until: string | null; updated_at: string }>()

  if (!sub) return c.json({ error: 'No subscription record' }, 404)

  const now       = new Date()
  const trialEnd  = new Date(sub.trial_end)
  const paidUntil = sub.paid_until ? new Date(sub.paid_until) : null

  const daysLeft = paidUntil
    ? Math.max(0, Math.ceil((paidUntil.getTime() - now.getTime()) / 86400000))
    : sub.status === 'trial'
    ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000))
    : 0

  const is_active =
    sub.status === 'active' ||
    (sub.status === 'trial' && now < trialEnd) ||
    (paidUntil != null && now < paidUntil)

  return c.json({ data: { ...sub, days_left: daysLeft, is_active } })
})

// GET /subscription/info — plan info + wallet address (public, no secret)
app.get('/info', async (c) => {
  return c.json({
    wallet: WALLET,
    network: 'Ethereum Mainnet',
    token: 'USDT (ERC-20)',
    contract: USDT_CONTRACT,
    plans: Object.entries(PLANS).map(([key, p]) => ({
      key, label: p.label, amount_usdt: p.amount_usdt, days: p.days,
    })),
  })
})

// POST /subscription/verify-payment
app.post('/verify-payment', async (c) => {
  const { lab_id } = c.get('user')
  const body = await c.req.json<{ plan: string; tx_hash: string }>()

  const planKey = body.plan as PlanKey
  if (!(planKey in PLANS)) return c.json({ error: 'Invalid plan. Choose monthly or yearly.' }, 400)

  const txHash = (body.tx_hash ?? '').trim().toLowerCase()
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
    return c.json({ error: 'Invalid transaction hash format. Must be 0x followed by 64 hex characters.' }, 400)
  }

  // Prevent reuse of same TX hash
  const existing = await c.env.DB.prepare(
    'SELECT id FROM payment_records WHERE tx_hash = ?'
  ).bind(txHash).first()
  if (existing) {
    return c.json({ error: 'This transaction has already been used to activate a subscription.' }, 409)
  }

  const plan = PLANS[planKey]
  let amount_usdt: number

  try {
    const result = await verifyUSDTPayment(txHash, plan.amount_usdt)
    amount_usdt = result.amount_usdt
  } catch (e: any) {
    return c.json({ error: e.message }, 400)
  }

  const now = new Date().toISOString()

  // Determine new paid_until (extend if already active)
  const currentSub = await c.env.DB.prepare(
    'SELECT paid_until FROM subscriptions WHERE lab_id = ?'
  ).bind(lab_id).first<{ paid_until: string | null }>()

  const base = currentSub?.paid_until && new Date(currentSub.paid_until) > new Date()
    ? new Date(currentSub.paid_until)
    : new Date()

  const newPaidUntil = new Date(base.getTime() + plan.days * 86400000).toISOString()

  await c.env.DB.batch([
    // Record payment
    c.env.DB.prepare(
      `INSERT INTO payment_records (id, lab_id, plan, amount_usd, amount_usdt, tx_hash, network, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ethereum', 'confirmed', ?, ?)`
    ).bind(
      crypto.randomUUID(), lab_id, planKey,
      plan.amount_usdt, amount_usdt, txHash, now, now
    ),
    // Activate subscription
    c.env.DB.prepare(
      `UPDATE subscriptions SET status = 'active', paid_until = ?, updated_at = ? WHERE lab_id = ?`
    ).bind(newPaidUntil, now, lab_id),
  ])

  return c.json({
    ok: true,
    plan: plan.label,
    amount_usdt,
    paid_until: newPaidUntil,
    days_added: plan.days,
  })
})

// GET /subscription/payments — history
app.get('/payments', async (c) => {
  const { lab_id } = c.get('user')
  const { results } = await c.env.DB.prepare(
    'SELECT id, plan, amount_usdt, tx_hash, status, created_at FROM payment_records WHERE lab_id = ? ORDER BY created_at DESC'
  ).bind(lab_id).all()
  return c.json({ data: results })
})

export default app
