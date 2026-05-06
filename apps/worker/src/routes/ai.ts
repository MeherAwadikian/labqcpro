import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { subscriptionMiddleware } from '../middleware/subscription'
import { analyzeManual, chatWithLabData } from '../lib/claude'

type Bindings = { DB: D1Database; R2: R2Bucket; ANTHROPIC_API_KEY: string }

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', authMiddleware, subscriptionMiddleware)

// POST /ai/analyze-manual
// Body: { file_key: string } — R2 object key of uploaded PDF
app.post('/analyze-manual', async (c) => {
  const user = c.get('user')
  const { file_key } = await c.req.json()
  if (!file_key) return c.json({ error: 'file_key required' }, 400)

  // Verify the manual belongs to this lab
  const manual = await c.env.DB.prepare(
    'SELECT id, filename FROM uploaded_manuals WHERE r2_key = ? AND lab_id = ?'
  ).bind(file_key, user.lab_id).first<{ id: string; filename: string }>()
  if (!manual) return c.json({ error: 'Manual not found' }, 404)

  // Fetch PDF from R2
  const obj = await c.env.R2.get(file_key)
  if (!obj) return c.json({ error: 'File not found in storage' }, 404)

  const pdfBuffer = await obj.arrayBuffer()
  const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)))

  const analysis = await analyzeManual(base64, manual.filename, c.env.ANTHROPIC_API_KEY)

  // Persist analysis result
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    `INSERT INTO manual_analyses (id, manual_id, lab_id, summary, extracted_ranges, key_procedures, analytes_mentioned, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(manual_id) DO UPDATE SET summary=excluded.summary, extracted_ranges=excluded.extracted_ranges,
       key_procedures=excluded.key_procedures, analytes_mentioned=excluded.analytes_mentioned, created_at=excluded.created_at`
  ).bind(
    crypto.randomUUID(), manual.id, user.lab_id,
    analysis.summary,
    JSON.stringify(analysis.extracted_ranges ?? []),
    JSON.stringify(analysis.key_procedures ?? []),
    JSON.stringify(analysis.analytes_mentioned ?? []),
    now
  ).run()

  return c.json({ data: analysis })
})

// GET /ai/manuals — list uploaded manuals
app.get('/manuals', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM uploaded_manuals WHERE lab_id = ? ORDER BY uploaded_at DESC'
  ).bind(user.lab_id).all()
  return c.json({ data: results })
})

// POST /ai/manuals/upload-url — get presigned upload URL for R2
app.post('/manuals/upload-url', async (c) => {
  const user = c.get('user')
  const { filename } = await c.req.json()
  if (!filename) return c.json({ error: 'filename required' }, 400)

  const key = `${user.lab_id}/manuals/${crypto.randomUUID()}-${filename}`
  // R2 doesn't support presigned URLs directly in Workers — we return the key and client POSTs to /ai/manuals/upload
  return c.json({ data: { upload_key: key } })
})

// POST /ai/manuals/upload — direct upload from client
app.post('/manuals/upload', async (c) => {
  const user = c.get('user')
  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const filename = formData.get('filename') as string | null

  if (!file || !filename) return c.json({ error: 'file and filename required' }, 400)

  const key = `${user.lab_id}/manuals/${crypto.randomUUID()}-${filename}`
  const buffer = await file.arrayBuffer()

  await c.env.R2.put(key, buffer, {
    httpMetadata: { contentType: 'application/pdf' },
  })

  const now = new Date().toISOString()
  const manualId = crypto.randomUUID()
  await c.env.DB.prepare(
    'INSERT INTO uploaded_manuals (id, lab_id, filename, r2_key, size_bytes, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(manualId, user.lab_id, filename, key, buffer.byteLength, now).run()

  return c.json({ data: { id: manualId, filename, r2_key: key } }, 201)
})

// DELETE /ai/manuals/:id
app.delete('/manuals/:id', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const manual = await c.env.DB.prepare(
    'SELECT r2_key FROM uploaded_manuals WHERE id = ? AND lab_id = ?'
  ).bind(id, user.lab_id).first<{ r2_key: string }>()
  if (!manual) return c.json({ error: 'Not found' }, 404)

  await c.env.R2.delete(manual.r2_key)
  await c.env.DB.prepare('DELETE FROM uploaded_manuals WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// POST /ai/chat — lab AI assistant
app.post('/chat', async (c) => {
  const user = c.get('user')
  const { message, context } = await c.req.json()
  if (!message) return c.json({ error: 'message required' }, 400)

  // Build lab context: recent violations, analytes, stats
  const [analytesRes, violationsRes, statsRes] = await Promise.all([
    c.env.DB.prepare('SELECT name, unit, method FROM analytes WHERE lab_id = ? LIMIT 20').bind(user.lab_id).all(),
    c.env.DB.prepare(`
      SELECT wv.rule, wv.severity, a.name as analyte_name, qr.value, qr.run_date
      FROM westgard_violations wv
      JOIN qc_runs qr ON wv.qc_run_id = qr.id
      JOIN analytes a ON qr.analyte_id = a.id
      WHERE a.lab_id = ?
      ORDER BY wv.created_at DESC LIMIT 10
    `).bind(user.lab_id).all(),
    c.env.DB.prepare(`
      SELECT a.name, cs.level, cs.mean, cs.sd, cs.cv, cs.n
      FROM control_stats cs
      JOIN analytes a ON cs.analyte_id = a.id
      WHERE a.lab_id = ?
    `).bind(user.lab_id).all(),
  ])

  const labContext = {
    analytes: analytesRes.results,
    recentViolations: violationsRes.results,
    controlStats: statsRes.results,
    ...context,
  }

  const reply = await chatWithLabData(message, labContext, c.env.ANTHROPIC_API_KEY)
  return c.json({ data: { reply } })
})

// GET /ai/analyses — list manual analyses
app.get('/analyses', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(`
    SELECT ma.*, um.filename
    FROM manual_analyses ma
    JOIN uploaded_manuals um ON ma.manual_id = um.id
    WHERE ma.lab_id = ?
    ORDER BY ma.created_at DESC
  `).bind(user.lab_id).all()
  return c.json({ data: results })
})

export default app
