import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import authRoutes         from './routes/auth'
import analyteRoutes      from './routes/analytes'
import qcRoutes           from './routes/qc'
import aiRoutes           from './routes/ai'
import subscriptionRoutes from './routes/subscription'
import reportRoutes       from './routes/reports'

// IQCP routes
import iqcpRiskRoutes        from './routes/iqcp/risk'
import iqcpPlanRoutes        from './routes/iqcp/plans'
import iqcpReagentRoutes     from './routes/iqcp/reagents'
import iqcpCalibratorRoutes  from './routes/iqcp/calibrators'
import iqcpExtensionRoutes   from './routes/iqcp/extensions'
import iqcpCapRoutes         from './routes/iqcp/cap'
import iqcpAiRoutes          from './routes/iqcp/ai'

// Validation routes
import validationRoutes      from './routes/validation'
import validationAiRoutes    from './routes/validation-ai'

type Bindings = {
  DB: D1Database
  R2: R2Bucket
  JWT_SECRET: string
  ANTHROPIC_API_KEY: string
  NOWPAYMENTS_API_KEY: string
  NOWPAYMENTS_IPN_SECRET: string
  CORS_ORIGIN: string
  RESEND_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', logger())
app.use('*', async (c, next) => {
  const origin = c.env.CORS_ORIGIN || '*'
  return cors({
    origin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })(c, next)
})

app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

app.route('/auth',         authRoutes)
app.route('/analytes',     analyteRoutes)
app.route('/qc',           qcRoutes)
app.route('/ai',           aiRoutes)
app.route('/subscription', subscriptionRoutes)
app.route('/reports',      reportRoutes)

// IQCP routes
app.route('/iqcp/risk',        iqcpRiskRoutes)
app.route('/iqcp/plans',       iqcpPlanRoutes)
app.route('/iqcp/reagents',    iqcpReagentRoutes)
app.route('/iqcp/calibrators', iqcpCalibratorRoutes)
app.route('/iqcp/extensions',  iqcpExtensionRoutes)
app.route('/iqcp/cap',         iqcpCapRoutes)
app.route('/iqcp/ai',          iqcpAiRoutes)

// Validation routes
app.route('/validation',       validationRoutes)
app.route('/validation/ai',    validationAiRoutes)

app.notFound((c) => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

// ─── Cloudflare Cron Trigger (every Monday 6 AM UTC) ─────────────────────────
export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runWeeklyTasks(env))
  },
}

async function runWeeklyTasks(env: Bindings) {
  const now = new Date().toISOString()
  const today = now.split('T')[0]

  // 1. Generate AI regulatory update
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: 'You are a laboratory regulatory expert. Respond with valid JSON only.',
        messages: [{
          role: 'user',
          content: `Today is ${today}. Provide 3-5 important regulatory considerations for clinical labs regarding CLIA, CAP, and IQCP. JSON format: {"updates":[{"category":"CAP|CLIA|CLSI|IQCP","title":"...","summary":"...","impact":"high|medium|low","action_required":"..."}]}`,
        }],
      }),
    })
    if (res.ok) {
      const data = await res.json() as any
      const text = data.content[0].text
      const id = crypto.randomUUID()
      await env.DB.prepare(
        `INSERT INTO iqcp_ai_updates (id, lab_id, update_type, summary, full_content, source_references, generated_at, applied)
         VALUES (?, NULL, 'regulatory', 'Weekly regulatory digest', ?, '[]', ?, 0)`
      ).bind(id, text, now).run()
    }
  } catch (e) {
    console.error('Weekly AI update failed:', e)
  }

  // 2. Check reagent expiries → generate compliance_alerts
  const { results: soonExpiring } = await env.DB.prepare(`
    SELECT r.id, r.lab_id, r.reagent_name, r.lot_number,
           COALESCE(r.extended_expiry_date, r.expiry_date) as effective_expiry
    FROM reagent_lots r
    WHERE r.status IN ('active', 'extended')
    AND julianday(COALESCE(r.extended_expiry_date, r.expiry_date)) - julianday('now') < 14
    AND julianday(COALESCE(r.extended_expiry_date, r.expiry_date)) - julianday('now') > -1
  `).all<{ id: string; lab_id: string; reagent_name: string; lot_number: string; effective_expiry: string }>()

  for (const r of soonExpiring) {
    const daysLeft = Math.ceil((new Date(r.effective_expiry).getTime() - Date.now()) / 86400000)
    const severity = daysLeft <= 3 ? 'critical' : daysLeft <= 7 ? 'major' : 'minor'
    // Avoid duplicate alerts
    const existing = await env.DB.prepare(
      `SELECT id FROM compliance_alerts WHERE entity_id = ? AND resolved_at IS NULL AND alert_type = 'reagent_expiry'`
    ).bind(r.id).first()
    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO compliance_alerts (id, lab_id, alert_type, severity, description, entity_type, entity_id, due_date, created_at)
         VALUES (?, ?, 'reagent_expiry', ?, ?, 'reagent_lot', ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), r.lab_id, severity,
        `Reagent "${r.reagent_name}" lot ${r.lot_number} expires in ${daysLeft} day(s) on ${r.effective_expiry}`,
        r.id, r.effective_expiry, now
      ).run()
    }
  }

  // 3. Check IQCP plan review dates
  const { results: overduePlans } = await env.DB.prepare(`
    SELECT p.id, p.lab_id, p.review_date, a.name as analyte_name
    FROM iqcp_qc_plans p
    JOIN analytes a ON p.analyte_id = a.id
    WHERE p.status = 'active' AND p.review_date < date('now')
  `).all<{ id: string; lab_id: string; review_date: string; analyte_name: string }>()

  for (const plan of overduePlans) {
    const existing = await env.DB.prepare(
      `SELECT id FROM compliance_alerts WHERE entity_id = ? AND resolved_at IS NULL AND alert_type = 'iqcp_plan_overdue'`
    ).bind(plan.id).first()
    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO compliance_alerts (id, lab_id, alert_type, severity, description, entity_type, entity_id, created_at)
         VALUES (?, ?, 'iqcp_plan_overdue', 'major', ?, 'iqcp_plan', ?, ?)`
      ).bind(
        crypto.randomUUID(), plan.lab_id,
        `IQCP QC Plan for "${plan.analyte_name}" is overdue for review (review date: ${plan.review_date})`,
        plan.id, now
      ).run()
      // Update plan status to 'review'
      await env.DB.prepare(
        `UPDATE iqcp_qc_plans SET status = 'review' WHERE id = ?`
      ).bind(plan.id).run()
    }
  }

  // 4. Check calibrator open-vial stability
  const { results: openCalibrators } = await env.DB.prepare(`
    SELECT cl.id, cl.lab_id, cl.calibrator_name, cl.open_date, cl.open_stability_days
    FROM calibrator_lots cl
    WHERE cl.status = 'active' AND cl.open_date IS NOT NULL AND cl.open_stability_days IS NOT NULL
    AND julianday('now') - julianday(cl.open_date) > cl.open_stability_days
  `).all<{ id: string; lab_id: string; calibrator_name: string; open_date: string; open_stability_days: number }>()

  for (const cal of openCalibrators) {
    const existing = await env.DB.prepare(
      `SELECT id FROM compliance_alerts WHERE entity_id = ? AND resolved_at IS NULL AND alert_type = 'calibrator_stability_exceeded'`
    ).bind(cal.id).first()
    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO compliance_alerts (id, lab_id, alert_type, severity, description, entity_type, entity_id, created_at)
         VALUES (?, ?, 'calibrator_stability_exceeded', 'critical', ?, 'calibrator_lot', ?, ?)`
      ).bind(
        crypto.randomUUID(), cal.lab_id,
        `Calibrator "${cal.calibrator_name}" has exceeded open-vial stability of ${cal.open_stability_days} days (opened: ${cal.open_date})`,
        cal.id, now
      ).run()
    }
  }

  console.log(`[Cron] Weekly tasks complete. Reagents checked: ${soonExpiring.length}, Plans overdue: ${overduePlans.length}`)
}
