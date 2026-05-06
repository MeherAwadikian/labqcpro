import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { subscriptionMiddleware } from '../middleware/subscription'
import { mean, sd, cv, zScore } from '../lib/stats'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', authMiddleware, subscriptionMiddleware)

// GET /reports/summary?from=&to=
app.get('/summary', async (c) => {
  const user = c.get('user')
  const { from, to } = c.req.query()

  const fromDate = from ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const toDate = to ?? new Date().toISOString().split('T')[0]

  // Total runs per analyte + level
  const { results: runCounts } = await c.env.DB.prepare(`
    SELECT a.id as analyte_id, a.name as analyte_name, a.unit, qr.level,
           COUNT(*) as total_runs,
           SUM(CASE WHEN EXISTS(
             SELECT 1 FROM westgard_violations wv WHERE wv.qc_run_id = qr.id AND wv.severity = 'reject'
           ) THEN 1 ELSE 0 END) as reject_count,
           SUM(CASE WHEN EXISTS(
             SELECT 1 FROM westgard_violations wv WHERE wv.qc_run_id = qr.id AND wv.severity = 'warning'
           ) THEN 1 ELSE 0 END) as warning_count
    FROM qc_runs qr
    JOIN analytes a ON qr.analyte_id = a.id
    WHERE a.lab_id = ? AND qr.run_date BETWEEN ? AND ?
    GROUP BY a.id, qr.level
    ORDER BY a.name, qr.level
  `).bind(user.lab_id, fromDate, toDate).all()

  // Overall violation summary
  const { results: violationBreakdown } = await c.env.DB.prepare(`
    SELECT wv.rule, wv.severity, COUNT(*) as count
    FROM westgard_violations wv
    JOIN qc_runs qr ON wv.qc_run_id = qr.id
    JOIN analytes a ON qr.analyte_id = a.id
    WHERE a.lab_id = ? AND qr.run_date BETWEEN ? AND ?
    GROUP BY wv.rule, wv.severity
    ORDER BY count DESC
  `).bind(user.lab_id, fromDate, toDate).all()

  return c.json({
    data: {
      period: { from: fromDate, to: toDate },
      analyte_summary: runCounts,
      violation_breakdown: violationBreakdown,
    },
  })
})

// GET /reports/levey-jennings?analyte_id=&level=&from=&to=
app.get('/levey-jennings', async (c) => {
  const user = c.get('user')
  const { analyte_id, level, from, to } = c.req.query()

  if (!analyte_id || !level) return c.json({ error: 'analyte_id and level required' }, 400)

  // Verify ownership
  const analyte = await c.env.DB.prepare(
    'SELECT id, name, unit FROM analytes WHERE id = ? AND lab_id = ?'
  ).bind(analyte_id, user.lab_id).first<{ id: string; name: string; unit: string }>()
  if (!analyte) return c.json({ error: 'Analyte not found' }, 404)

  let query = `
    SELECT qr.id, qr.value, qr.run_date, qr.operator, qr.lot_number,
           GROUP_CONCAT(wv.rule) as violation_rules,
           MAX(CASE WHEN wv.severity = 'reject' THEN 1 ELSE 0 END) as has_reject
    FROM qc_runs qr
    LEFT JOIN westgard_violations wv ON wv.qc_run_id = qr.id
    WHERE qr.analyte_id = ? AND qr.level = ?`
  const params: unknown[] = [analyte_id, level]

  if (from) { query += ' AND qr.run_date >= ?'; params.push(from) }
  if (to)   { query += ' AND qr.run_date <= ?'; params.push(to) }
  query += ' GROUP BY qr.id ORDER BY qr.run_date ASC, qr.created_at ASC'

  const { results: runs } = await c.env.DB.prepare(query).bind(...params).all<{
    id: string; value: number; run_date: string; operator: string; lot_number: string;
    violation_rules: string | null; has_reject: number
  }>()

  // Get control stats
  const stats = await c.env.DB.prepare(
    'SELECT mean, sd, cv, n FROM control_stats WHERE analyte_id = ? AND level = ?'
  ).bind(analyte_id, level).first<{ mean: number; sd: number; cv: number; n: number }>()

  // Calculate z-scores for each run
  const chartData = runs.map(r => ({
    ...r,
    z_score: stats ? zScore(r.value, stats.mean, stats.sd) : null,
    violations: r.violation_rules ? r.violation_rules.split(',') : [],
    is_reject: r.has_reject === 1,
  }))

  return c.json({
    data: {
      analyte,
      level,
      stats,
      runs: chartData,
    },
  })
})

// GET /reports/trend?analyte_id=&level=&metric=mean|sd|cv&months=6
app.get('/trend', async (c) => {
  const user = c.get('user')
  const { analyte_id, level, months = '6' } = c.req.query()

  if (!analyte_id || !level) return c.json({ error: 'analyte_id and level required' }, 400)

  const analyte = await c.env.DB.prepare(
    'SELECT id, name FROM analytes WHERE id = ? AND lab_id = ?'
  ).bind(analyte_id, user.lab_id).first()
  if (!analyte) return c.json({ error: 'Analyte not found' }, 404)

  const since = new Date(Date.now() - parseInt(months) * 30 * 86400000).toISOString().split('T')[0]

  // Monthly aggregation
  const { results } = await c.env.DB.prepare(`
    SELECT
      strftime('%Y-%m', run_date) as month,
      AVG(value) as mean,
      COUNT(*) as n
    FROM qc_runs
    WHERE analyte_id = ? AND level = ? AND run_date >= ?
    GROUP BY month
    ORDER BY month ASC
  `).bind(analyte_id, level, since).all<{ month: string; mean: number; n: number }>()

  // Calculate SD per month
  const monthlyData = await Promise.all(
    results.map(async (row) => {
      const { results: vals } = await c.env.DB.prepare(
        `SELECT value FROM qc_runs WHERE analyte_id = ? AND level = ? AND strftime('%Y-%m', run_date) = ?`
      ).bind(analyte_id, level, row.month).all<{ value: number }>()
      const values = vals.map(v => v.value)
      const m = mean(values)
      const s = sd(values, m)
      return { month: row.month, mean: m, sd: s, cv: cv(s, m), n: row.n }
    })
  )

  return c.json({ data: monthlyData })
})

// GET /reports/operator?from=&to=
app.get('/operator', async (c) => {
  const user = c.get('user')
  const { from, to } = c.req.query()
  const fromDate = from ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const toDate = to ?? new Date().toISOString().split('T')[0]

  const { results } = await c.env.DB.prepare(`
    SELECT qr.operator,
           COUNT(*) as total_runs,
           SUM(CASE WHEN EXISTS(
             SELECT 1 FROM westgard_violations wv WHERE wv.qc_run_id = qr.id AND wv.severity = 'reject'
           ) THEN 1 ELSE 0 END) as rejects
    FROM qc_runs qr
    JOIN analytes a ON qr.analyte_id = a.id
    WHERE a.lab_id = ? AND qr.run_date BETWEEN ? AND ?
    GROUP BY qr.operator
    ORDER BY total_runs DESC
  `).bind(user.lab_id, fromDate, toDate).all()

  return c.json({ data: results })
})

export default app
