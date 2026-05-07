import { Hono } from 'hono'
import { authMiddleware, type JWTPayload } from '../middleware/auth'

type Bindings = { DB: D1Database; JWT_SECRET: string; ANTHROPIC_API_KEY: string }
type Variables = { user: JWTPayload }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', authMiddleware)

const SYSTEM = `You are a laboratory validation expert with deep knowledge of CLSI EP5, EP9, EP15, EP26, CLIA 42 CFR 493, CAP accreditation standards, and ISO 15189. Always cite the specific guideline when giving advice. Be concise, clinically relevant, and practical.`

async function claude(apiKey: string, system: string, content: string, maxTokens = 1024): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, system,
      messages: [{ role: 'user', content }] }),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}`)
  const d = await res.json() as any
  return d.content[0].text
}

// POST /validation/ai/interpret — interpret a completed study
app.post('/interpret', async (c) => {
  const { lab_id } = c.get('user')
  const { study_id } = await c.req.json<{ study_id: string }>()
  const study = await c.env.DB.prepare(
    `SELECT vs.*, a.name as analyte_name, a.unit as analyte_unit
     FROM validation_studies vs LEFT JOIN analytes a ON vs.analyte_id = a.id
     WHERE vs.id = ? AND vs.lab_id = ?`
  ).bind(study_id, lab_id).first<any>()
  if (!study) return c.json({ error: 'Study not found' }, 404)
  const stats = await c.env.DB.prepare(`SELECT * FROM validation_stats WHERE study_id = ?`).bind(study_id).first<any>()

  const prompt = `Interpret this ${study.study_type} validation study:
Analyte: ${study.analyte_name} (${study.analyte_unit})
Study Title: ${study.title}
Metadata: ${study.metadata}
Statistics: ${JSON.stringify(stats, null, 2)}

Provide:
1. Plain-English interpretation of the results
2. Whether the bias is clinically significant
3. Specific CLSI/EP/CLIA rule implications
4. Recommended corrective actions if failed
5. Comparison to typical published benchmarks for this analyte type
Be specific and cite guidelines.`

  const result = await claude(c.env.ANTHROPIC_API_KEY, SYSTEM, prompt, 1500)
  return c.json({ result })
})

// POST /validation/ai/protocol — generate validation protocol
app.post('/protocol', async (c) => {
  const { analyte, instrument, study_type } = await c.req.json<{
    analyte: string; instrument: string; study_type: string
  }>()
  const prompt = `Generate a complete ${study_type} validation protocol for:
Analyte: ${analyte}
Instrument: ${instrument}

Include:
1. Step-by-step protocol with sample requirements
2. Sample size recommendation with statistical justification
3. Specific acceptance criteria with regulatory citations (CLSI/CLIA/CAP)
4. SOP template text ready to use
5. Data recording forms description

Format as a structured protocol document.`

  const result = await claude(c.env.ANTHROPIC_API_KEY, SYSTEM, prompt, 2000)
  return c.json({ result })
})

// POST /validation/ai/chat — regulatory chat
app.post('/chat', async (c) => {
  const { messages } = await c.req.json<{ messages: Array<{ role: string; content: string }> }>()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': c.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1200, system: SYSTEM, messages }),
  })
  if (!res.ok) return c.json({ error: 'AI service error' }, 502)
  const d = await res.json() as any
  return c.json({ reply: d.content[0].text })
})

export default app
