import { Hono } from 'hono'
import { authMiddleware, type JWTPayload } from '../../middleware/auth'

type Bindings = { DB: D1Database }
type Variables = { user: JWTPayload }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', authMiddleware)

// ─── GET /reference-lab/search ────────────────────────────────────────────────
app.get('/search', async (c) => {
  const q          = c.req.query('q')?.trim() ?? ''
  const population = c.req.query('population') ?? ''
  const sex        = c.req.query('sex') ?? ''
  const source_type  = c.req.query('source_type') ?? ''
  const sample_type  = c.req.query('sample_type') ?? ''
  const fasting    = c.req.query('fasting') ?? ''
  const free_access = c.req.query('free_access') ?? ''
  const year_min   = c.req.query('year_min') ?? ''
  const region     = c.req.query('region') ?? ''

  const parts: string[] = []
  const params: (string | number)[] = []

  if (q) {
    parts.push(`(LOWER(analyte_name) LIKE ? OR LOWER(analyte_aliases) LIKE ?)`)
    const term = `%${q.toLowerCase()}%`
    params.push(term, term)
  }
  if (population && population !== 'all') {
    parts.push(`population_group = ?`)
    params.push(population)
  }
  if (sex && sex !== 'all' && sex !== 'both') {
    parts.push(`(sex = ? OR sex = 'both')`)
    params.push(sex)
  }
  if (source_type && source_type !== 'all') {
    parts.push(`source_type = ?`)
    params.push(source_type)
  }
  if (sample_type && sample_type !== 'all') {
    parts.push(`sample_type = ?`)
    params.push(sample_type)
  }
  if (fasting === 'yes')   parts.push(`fasting_required = 1`)
  if (fasting === 'no')    parts.push(`fasting_required = 0`)
  if (free_access === '1') parts.push(`free_access = 1`)
  if (year_min) {
    parts.push(`publication_year >= ?`)
    params.push(parseInt(year_min))
  }
  if (region && region !== 'all') {
    parts.push(`region = ?`)
    params.push(region)
  }

  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : ''
  const sql = `SELECT * FROM ri_published_library ${where} ORDER BY analyte_name, population_group, sex LIMIT 120`

  const stmt = c.env.DB.prepare(sql)
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all()
  return c.json({ data: results })
})

// ─── GET /reference-lab/library ───────────────────────────────────────────────
app.get('/library', async (c) => {
  const { lab_id } = c.get('user')
  const { results } = await c.env.DB.prepare(`
    SELECT r.* FROM ri_published_library r
    JOIN lab_ri_library l ON l.ri_library_id = r.id
    WHERE l.lab_id = ?
    ORDER BY l.saved_at DESC
  `).bind(lab_id).all()
  return c.json({ data: results })
})

// ─── POST /reference-lab/library ──────────────────────────────────────────────
app.post('/library', async (c) => {
  const { lab_id } = c.get('user')
  const { ri_id } = await c.req.json<{ ri_id: string }>()

  if (!ri_id) return c.json({ error: 'ri_id required' }, 400)

  const exists = await c.env.DB.prepare(
    'SELECT id FROM ri_published_library WHERE id = ?'
  ).bind(ri_id).first()
  if (!exists) return c.json({ error: 'Reference interval not found' }, 404)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO lab_ri_library (id, lab_id, ri_library_id, saved_at) VALUES (?, ?, ?, ?)'
  ).bind(id, lab_id, ri_id, now).run()

  return c.json({ ok: true })
})

// ─── DELETE /reference-lab/library/:riId ──────────────────────────────────────
app.delete('/library/:riId', async (c) => {
  const { lab_id } = c.get('user')
  const riId = c.req.param('riId')
  await c.env.DB.prepare(
    'DELETE FROM lab_ri_library WHERE lab_id = ? AND ri_library_id = ?'
  ).bind(lab_id, riId).run()
  return c.json({ ok: true })
})

export default app
