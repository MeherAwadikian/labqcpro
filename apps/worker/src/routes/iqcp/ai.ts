import { Hono } from 'hono'
import { authMiddleware } from '../../middleware/auth'
import { subscriptionMiddleware } from '../../middleware/subscription'

type Bindings = { DB: D1Database; ANTHROPIC_API_KEY: string }

const IQCP_SYSTEM_PROMPT = `You are a laboratory regulatory expert specializing in CLIA, CAP accreditation, and IQCP (Individualized Quality Control Plan). You have 20+ years of clinical laboratory experience and have served as a CAP inspector.

You provide accurate, practical guidance on:
- CLIA quality control requirements (42 CFR 493)
- CAP checklist compliance and accreditation
- IQCP risk assessment and QC plan development
- CLSI guidelines (EP5, EP9, EP15, EP23)
- Reagent and calibrator verification
- Westgard rules and QC interpretation
- Common inspection deficiencies and how to avoid them

Always cite specific regulatory references when applicable. Be concise and actionable.`

const UPDATE_PROMPT = (date: string) => `You are a laboratory regulatory expert. Today is ${date}.

Based on your training knowledge, provide important regulatory updates and considerations for clinical laboratories regarding:
1. Recent or important CAP checklist requirements and common deficiencies
2. CLIA regulation updates affecting QC practices
3. Key CLSI guideline considerations (EP5, EP9, EP15, EP23 for IQCP)
4. Reagent extension regulatory guidance
5. Common CAP inspection findings in recent cycles

Respond in this exact JSON format:
{
  "updates": [
    {
      "category": "CAP|CLIA|CLSI|IQCP|General",
      "title": "Brief title",
      "summary": "2-3 sentence summary",
      "impact": "high|medium|low",
      "action_required": "Specific action labs should take"
    }
  ]
}`

async function callClaude(messages: any[], system: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system,
      messages,
    }),
  })
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`)
  const data = await res.json() as any
  return data.content[0].text
}

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', authMiddleware, subscriptionMiddleware)

// GET /iqcp/ai/updates — fetch stored weekly updates
app.get('/updates', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM iqcp_ai_updates WHERE lab_id IS NULL OR lab_id = ? ORDER BY generated_at DESC LIMIT 20`
  ).bind(user.lab_id).all()
  const parsed = (results as any[]).map(r => ({
    ...r,
    source_references: JSON.parse(r.source_references || '[]'),
  }))
  return c.json({ data: parsed })
})

// POST /iqcp/ai/updates/generate — trigger on-demand update
app.post('/updates/generate', async (c) => {
  const user = c.get('user')
  const date = new Date().toISOString().split('T')[0]

  const text = await callClaude(
    [{ role: 'user', content: UPDATE_PROMPT(date) }],
    'You are a laboratory regulatory expert. Always respond with valid JSON only.',
    c.env.ANTHROPIC_API_KEY
  )

  let updates: any[] = []
  try {
    const parsed = JSON.parse(text)
    updates = parsed.updates ?? []
  } catch {
    updates = [{ category: 'General', title: 'Regulatory Update', summary: text, impact: 'medium', action_required: 'Review and apply as applicable' }]
  }

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    `INSERT INTO iqcp_ai_updates (id, lab_id, update_type, summary, full_content, source_references, generated_at, applied)
     VALUES (?, ?, 'regulatory', ?, ?, '[]', ?, 0)`
  ).bind(id, user.lab_id, `${updates.length} regulatory updates generated`, JSON.stringify(updates), now).run()

  return c.json({ data: { id, updates, generated_at: now } })
})

// POST /iqcp/ai/updates/:id/apply
app.post('/updates/:id/apply', async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  await c.env.DB.prepare(
    'UPDATE iqcp_ai_updates SET applied = 1 WHERE id = ? AND (lab_id = ? OR lab_id IS NULL)'
  ).bind(id, user.lab_id).run()
  return c.json({ data: { applied: true } })
})

// POST /iqcp/ai/generate-plan — AI IQCP plan generator
app.post('/generate-plan', async (c) => {
  const user = c.get('user')
  const { analyte_name, instrument, daily_volume, current_qc_approach } = await c.req.json()

  const prompt = `Generate a complete IQCP (Individualized Quality Control Plan) for:
- Analyte: ${analyte_name}
- Instrument/Method: ${instrument || 'Not specified'}
- Daily test volume: ${daily_volume || 'Not specified'}
- Current QC approach: ${current_qc_approach || 'Standard 2-level daily QC'}

Provide a detailed IQCP in this JSON format:
{
  "risk_assessment": [
    { "category": "risk category", "risk": "description", "likelihood": 1-5, "severity": 1-5, "mitigation": "control measure" }
  ],
  "qc_frequency": "per_run|daily|per_shift|weekly",
  "qc_frequency_justification": "CLIA/CAP basis for this frequency",
  "qc_levels": 2,
  "recommended_westgard_rules": ["1_3s", "2_2s", "R_4s"],
  "tea_source": "CLIA|CAP|manufacturer",
  "tea_value": number or null,
  "tea_justification": "basis for TEa",
  "corrective_action_plan": "Step-by-step corrective action",
  "review_cycle_months": 12,
  "key_references": ["CLIA 42 CFR...", "CAP checklist..."]
}`

  const text = await callClaude(
    [{ role: 'user', content: prompt }],
    IQCP_SYSTEM_PROMPT + '\n\nAlways respond with valid JSON only.',
    c.env.ANTHROPIC_API_KEY
  )

  let plan: any
  try {
    plan = JSON.parse(text)
  } catch {
    return c.json({ error: 'Failed to parse AI response', raw: text }, 500)
  }

  return c.json({ data: plan })
})

// POST /iqcp/ai/analyze-compliance — compliance gap analysis
app.post('/analyze-compliance', async (c) => {
  const user = c.get('user')

  const [checklistRes, reagentsRes, plansRes, calibratorsRes] = await Promise.all([
    c.env.DB.prepare(`
      SELECT ci.compliance_status, ci.deficiency_note, sl.cap_question_id, sl.section, sl.requirement_text
      FROM cap_checklist_items ci
      JOIN cap_standards_library sl ON ci.cap_question_id = sl.cap_question_id
      WHERE ci.lab_id = ?
    `).bind(user.lab_id).all(),
    c.env.DB.prepare(
      'SELECT reagent_name, lot_number, expiry_date, verification_status, status FROM reagent_lots WHERE lab_id = ? LIMIT 20'
    ).bind(user.lab_id).all(),
    c.env.DB.prepare(
      'SELECT p.status, p.review_date, a.name as analyte_name FROM iqcp_qc_plans p JOIN analytes a ON p.analyte_id = a.id WHERE p.lab_id = ?'
    ).bind(user.lab_id).all(),
    c.env.DB.prepare(
      'SELECT calibrator_name, lot_number, verification_status, si_unit_traceable FROM calibrator_lots WHERE lab_id = ? LIMIT 10'
    ).bind(user.lab_id).all(),
  ])

  const prompt = `Analyze this laboratory's compliance data and identify gaps:

CAP Checklist Status:
${JSON.stringify(checklistRes.results.slice(0, 30), null, 2)}

Reagent Lots:
${JSON.stringify(reagentsRes.results, null, 2)}

IQCP Plans:
${JSON.stringify(plansRes.results, null, 2)}

Calibrators:
${JSON.stringify(calibratorsRes.results, null, 2)}

Provide a compliance gap analysis in this JSON format:
{
  "overall_risk": "high|medium|low",
  "top_gaps": [
    {
      "priority": 1,
      "category": "category",
      "issue": "specific problem",
      "regulatory_citation": "CLIA/CAP ref",
      "remediation": "what to do",
      "effort": "hours|days|weeks"
    }
  ],
  "inspection_readiness": "ready|needs_attention|not_ready",
  "key_strengths": ["what they're doing well"],
  "immediate_actions": ["things to fix today"]
}`

  const text = await callClaude(
    [{ role: 'user', content: prompt }],
    IQCP_SYSTEM_PROMPT + '\n\nAlways respond with valid JSON only.',
    c.env.ANTHROPIC_API_KEY
  )

  let analysis: any
  try {
    analysis = JSON.parse(text)
  } catch {
    return c.json({ error: 'Failed to parse AI response', raw: text }, 500)
  }

  return c.json({ data: analysis })
})

// POST /iqcp/ai/interpret-cap — CAP question interpreter
app.post('/interpret-cap', async (c) => {
  const user = c.get('user')
  const { question_id, question_text } = await c.req.json()

  const prompt = `Explain this CAP accreditation requirement:
${question_id ? `CAP Question ID: ${question_id}` : ''}
${question_text ? `Requirement: ${question_text}` : ''}

Provide a practical explanation in JSON format:
{
  "plain_language": "What this means in simple terms",
  "documentation_needed": ["List of required documents/records"],
  "common_deficiencies": ["How labs commonly fail this"],
  "compliant_evidence_examples": ["Examples of acceptable evidence"],
  "tips": "Practical inspector tip"
}`

  const text = await callClaude(
    [{ role: 'user', content: prompt }],
    IQCP_SYSTEM_PROMPT + '\n\nRespond with valid JSON only.',
    c.env.ANTHROPIC_API_KEY
  )

  let interpretation: any
  try {
    interpretation = JSON.parse(text)
  } catch {
    return c.json({ data: { plain_language: text } })
  }

  return c.json({ data: interpretation })
})

// POST /iqcp/ai/reagent-extension-advice
app.post('/reagent-extension-advice', async (c) => {
  const user = c.get('user')
  const { reagent_type, days_past_expiry, qc_performance_summary } = await c.req.json()

  const prompt = `A lab is considering extending use of a reagent past its labeled expiry:
- Reagent type: ${reagent_type}
- Days past labeled expiry: ${days_past_expiry}
- QC performance summary: ${qc_performance_summary || 'Not provided'}

Advise on this extension in JSON format:
{
  "defensibility": "high|medium|low",
  "recommendation": "proceed|proceed_with_caution|do_not_proceed",
  "required_documentation": ["list of required docs"],
  "regulatory_citations": ["specific CLIA/CAP references"],
  "risk_assessment": "explanation of risks",
  "max_extension_guidance": "typical maximum extension for this type"
}`

  const text = await callClaude(
    [{ role: 'user', content: prompt }],
    IQCP_SYSTEM_PROMPT + '\n\nRespond with valid JSON only.',
    c.env.ANTHROPIC_API_KEY
  )

  let advice: any
  try {
    advice = JSON.parse(text)
  } catch {
    return c.json({ data: { recommendation: text } })
  }

  return c.json({ data: advice })
})

// POST /iqcp/ai/chat — IQCP-specific chat
app.post('/chat', async (c) => {
  const user = c.get('user')
  const { message } = await c.req.json()
  if (!message) return c.json({ error: 'message required' }, 400)

  const text = await callClaude(
    [{ role: 'user', content: message }],
    IQCP_SYSTEM_PROMPT,
    c.env.ANTHROPIC_API_KEY
  )

  return c.json({ data: { reply: text } })
})

export default app
