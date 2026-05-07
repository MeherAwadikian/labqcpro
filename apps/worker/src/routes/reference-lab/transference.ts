import { Hono } from 'hono'
import { authMiddleware, type JWTPayload } from '../../middleware/auth'

type Bindings = { DB: D1Database }
type Variables = { user: JWTPayload }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', authMiddleware)

function scoreResult(pctWithin: number): string {
  if (pctWithin >= 90) return 'pass'
  if (pctWithin >= 85) return 'borderline'
  return 'fail'
}

// GET /reference-lab/transference
app.get('/', async (c) => {
  const { lab_id } = c.get('user')
  const { results } = await c.env.DB.prepare(
    `SELECT id, analyte_name, source_name, lower_limit, upper_limit, unit,
            n_samples, n_within, pct_within, result, created_at
     FROM ri_transference_studies WHERE lab_id = ? ORDER BY created_at DESC`
  ).bind(lab_id).all()
  return c.json({ data: results })
})

// POST /reference-lab/transference  — create study
app.post('/', async (c) => {
  const { lab_id } = c.get('user')
  const body = await c.req.json<{
    analyte_name: string; source_name: string
    lower_limit: number; upper_limit: number; unit: string
    sample_type?: string; notes?: string
  }>()
  if (!body.analyte_name || !body.source_name || body.lower_limit == null || body.upper_limit == null)
    return c.json({ error: 'analyte_name, source_name, lower_limit, upper_limit required' }, 400)

  const id = crypto.randomUUID(), now = new Date().toISOString()
  await c.env.DB.prepare(
    `INSERT INTO ri_transference_studies
      (id,lab_id,analyte_name,source_name,lower_limit,upper_limit,unit,sample_type,notes,status,result,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,'in_progress','pending',?,?)`
  ).bind(
    id, lab_id, body.analyte_name, body.source_name,
    body.lower_limit, body.upper_limit, body.unit,
    body.sample_type ?? 'serum', body.notes ?? '', now, now
  ).run()
  return c.json({ id })
})

// GET /reference-lab/transference/:id
app.get('/:id', async (c) => {
  const { lab_id } = c.get('user')
  const id = c.req.param('id')
  const study = await c.env.DB.prepare(
    'SELECT * FROM ri_transference_studies WHERE id = ? AND lab_id = ?'
  ).bind(id, lab_id).first()
  if (!study) return c.json({ error: 'Not found' }, 404)
  const { results: samples } = await c.env.DB.prepare(
    'SELECT id, sample_number, measured_value, within_ri FROM ri_transference_samples WHERE study_id = ? ORDER BY sample_number'
  ).bind(id).all()
  return c.json({ data: { ...study, samples } })
})

// PUT /reference-lab/transference/:id/samples  — save/replace all samples
app.put('/:id/samples', async (c) => {
  const { lab_id } = c.get('user')
  const id = c.req.param('id')
  const study = await c.env.DB.prepare(
    'SELECT lower_limit, upper_limit FROM ri_transference_studies WHERE id = ? AND lab_id = ?'
  ).bind(id, lab_id).first<{ lower_limit: number; upper_limit: number }>()
  if (!study) return c.json({ error: 'Not found' }, 404)

  const { samples } = await c.req.json<{ samples: number[] }>()
  if (!Array.isArray(samples) || samples.length < 1)
    return c.json({ error: 'samples array required' }, 400)

  const now = new Date().toISOString()
  const withinList = samples.map(v => v >= study.lower_limit && v <= study.upper_limit ? 1 : 0)
  const n_within = withinList.reduce((a, b) => a + b, 0)
  const pct = (n_within / samples.length) * 100
  const result = scoreResult(pct)

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM ri_transference_samples WHERE study_id = ?').bind(id),
    ...samples.map((v, i) =>
      c.env.DB.prepare(
        'INSERT INTO ri_transference_samples (id, study_id, lab_id, sample_number, measured_value, within_ri, created_at) VALUES (?,?,?,?,?,?,?)'
      ).bind(crypto.randomUUID(), id, lab_id, i + 1, v, withinList[i], now)
    ),
    c.env.DB.prepare(
      `UPDATE ri_transference_studies SET n_samples=?, n_within=?, pct_within=?, result=?, status='complete', updated_at=? WHERE id=?`
    ).bind(samples.length, n_within, pct, result, now, id),
  ])

  return c.json({ ok: true, n_samples: samples.length, n_within, pct_within: pct, result })
})

// DELETE /reference-lab/transference/:id
app.delete('/:id', async (c) => {
  const { lab_id } = c.get('user')
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM ri_transference_studies WHERE id = ? AND lab_id = ?').bind(id, lab_id).run()
  return c.json({ ok: true })
})

export default app
