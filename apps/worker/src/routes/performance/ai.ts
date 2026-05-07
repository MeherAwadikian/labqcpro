import { Hono } from 'hono'
import { authMiddleware, type JWTPayload } from '../../middleware/auth'

type Bindings = { DB: D1Database; ANTHROPIC_API_KEY: string }
type Variables = { user: JWTPayload }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
app.use('*', authMiddleware)

const SYSTEM = `You are an expert in laboratory performance testing and external quality control with deep knowledge of:

ANALYTICAL PERFORMANCE STANDARDS:
- CLSI EP10-A3: Preliminary evaluation of quantitative clinical laboratory measurement procedures (carryover)
- CLSI EP15-A3: User verification of precision and estimation of bias (precision testing)
- CLSI EP5-A3: Evaluation of precision of quantitative measurement procedures
- CLSI EP9-A3: Measurement procedure comparison and bias estimation
- CLSI EP6: Evaluation of the linearity of quantitative measurement procedures

REGULATORY REQUIREMENTS:
- CLIA 42 CFR 493: Laboratory requirements (proficiency testing, QC, calibration)
- CLIA 2025 updated TEa (Total Allowable Error) limits for regulated analytes
- CAP Inspection checklists: COM.01100 (carryover), QC.09300 (proficiency testing)
- ISO 15189:2022 requirements for measurement uncertainty and method validation

EXTERNAL QUALITY CONTROL:
- CAP proficiency testing surveys and scoring methodology
- SDI (Standard Deviation Index): (lab result - peer mean) / peer SD
- Peer comparison programs and interlaboratory data interpretation
- EQAS (External Quality Assessment Schemes) interpretation

CALCULATIONS:
- Carryover % = (B1 - B3) / H3 × 100 (CLSI EP10)
- ANOVA-based precision: within-run SD, between-run SD, total SD via MS_within and MS_between
- Sigma metric: σ = (TEa - |Bias%|) / CV%
- SDI ≤1.0 excellent; 1.0-2.0 acceptable; >2.0 investigate; >3.0 critical

You speak to laboratory directors, QC coordinators, and medical laboratory scientists. Be specific, cite the relevant standard, and always give actionable recommendations. When a result fails, always recommend a corrective action pathway.`

async function callClaude(apiKey: string, messages: any[], maxTokens = 1500): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: SYSTEM,
      messages,
    }),
  })
  if (!res.ok) throw new Error('AI service error')
  const data = await res.json() as any
  return data.content[0].text
}

// ─── List available studies for interpretation ────────────────────────────────
app.get('/studies', async (c) => {
  const { lab_id } = c.get('user')

  const [carryover, precision, ptEvents, eqc] = await Promise.all([
    c.env.DB.prepare(`
      SELECT id, study_date as date, instrument,
             COALESCE(a.name, 'Unknown') as analyte_name,
             passed, carryover_percent
      FROM carryover_studies cs LEFT JOIN analytes a ON cs.analyte_id = a.id
      WHERE cs.lab_id = ? ORDER BY study_date DESC LIMIT 20
    `).bind(lab_id).all(),
    c.env.DB.prepare(`
      SELECT ps.id, ps.study_start_date as date, ps.instrument, ps.level, ps.status,
             COALESCE(a.name, 'Unknown') as analyte_name,
             st.total_cv, st.passed as stats_passed
      FROM precision_studies ps
      LEFT JOIN analytes a ON ps.analyte_id = a.id
      LEFT JOIN precision_stats st ON st.study_id = ps.id
      WHERE ps.lab_id = ? AND ps.status = 'complete'
      ORDER BY ps.created_at DESC LIMIT 20
    `).bind(lab_id).all(),
    c.env.DB.prepare(`
      SELECT id, program_name, provider, event_code, status, created_at as date
      FROM pt_events WHERE lab_id = ? AND status = 'scored'
      ORDER BY created_at DESC LIMIT 20
    `).bind(lab_id).all(),
    c.env.DB.prepare(`
      SELECT DISTINCT e.analyte_id, COALESCE(a.name, 'Unknown') as analyte_name, a.unit,
             COUNT(*) as count, AVG(e.sdi) as avg_sdi, MAX(e.created_at) as last_date
      FROM eqc_peer_comparisons e
      LEFT JOIN analytes a ON e.analyte_id = a.id
      WHERE e.lab_id = ? GROUP BY e.analyte_id
      ORDER BY last_date DESC LIMIT 20
    `).bind(lab_id).all(),
  ])

  return c.json({
    carryover: carryover.results,
    precision: precision.results,
    pt: ptEvents.results,
    eqc: eqc.results,
  })
})

// ─── Interpret a study ────────────────────────────────────────────────────────
app.post('/interpret', async (c) => {
  const { lab_id } = c.get('user')
  const body = await c.req.json<{
    study_type: 'carryover' | 'precision' | 'pt' | 'eqc'
    study_id: string
  }>()

  let prompt = ''

  if (body.study_type === 'carryover') {
    const s = await c.env.DB.prepare(`
      SELECT cs.*, a.name as analyte_name, a.unit
      FROM carryover_studies cs
      LEFT JOIN analytes a ON cs.analyte_id = a.id
      WHERE cs.id = ? AND cs.lab_id = ?
    `).bind(body.study_id, lab_id).first<any>()
    if (!s) return c.json({ error: 'Study not found' }, 404)

    prompt = `Interpret this carryover study (CLSI EP10):

Analyte: ${s.analyte_name ?? 'Unknown'} ${s.unit ? `(${s.unit})` : ''}
Instrument: ${s.instrument}
Operator: ${s.operator}
Study Date: ${s.study_date}
Sample Description: ${s.sample_description ?? 'High-concentration sample'}

High Sample Replicates: H1=${s.h1}, H2=${s.h2}, H3=${s.h3}
Blank/Diluent Replicates: B1=${s.b1}, B2=${s.b2}, B3=${s.b3}

Calculated Carryover % = (B1 - B3) / H3 × 100 = ${s.carryover_percent != null ? s.carryover_percent.toFixed(4) + '%' : 'N/A'}
Manufacturer Limit: ${s.manufacturer_limit}%
Result: ${s.passed ? 'PASS' : 'FAIL'}
Notes: ${s.notes ?? 'None'}

Provide: (1) Overall assessment with CLSI EP10 context, (2) Analysis of the H and B value patterns — do H1/H2/H3 show stability? Is B1 appropriately trending toward B3?, (3) Clinical significance for this analyte, (4) If failed: root cause analysis and corrective action steps with specific CAP COM.01100 documentation requirements, (5) Trending recommendation — when should this be repeated?`
  }

  else if (body.study_type === 'precision') {
    const s = await c.env.DB.prepare(`
      SELECT ps.*, a.name as analyte_name, a.unit
      FROM precision_studies ps
      LEFT JOIN analytes a ON ps.analyte_id = a.id
      WHERE ps.id = ? AND ps.lab_id = ?
    `).bind(body.study_id, lab_id).first<any>()
    if (!s) return c.json({ error: 'Study not found' }, 404)

    const st = await c.env.DB.prepare(
      'SELECT * FROM precision_stats WHERE study_id = ?'
    ).bind(body.study_id).first<any>()

    prompt = `Interpret this precision study (CLSI EP15-A3):

Analyte: ${s.analyte_name ?? 'Unknown'} ${s.unit ? `(${s.unit})` : ''}
Instrument: ${s.instrument}
Concentration Level: ${s.level}
Study Start: ${s.study_start_date}

Manufacturer Claims:
  Within-Run CV: ${s.manufacturer_cv_within ?? 'Not stated'}%
  Total Precision CV: ${s.manufacturer_cv_total ?? 'Not stated'}%
  Acceptance Multiplier: ${s.acceptance_multiplier}× (Chi-square test)

ANOVA Results (${st?.n ?? '?'} measurements):
  Grand Mean: ${st?.grand_mean?.toFixed(4) ?? 'N/A'}
  Within-Run SD: ${st?.within_run_sd?.toFixed(4) ?? 'N/A'} (CV: ${st?.within_run_cv?.toFixed(2) ?? 'N/A'}%)
  Between-Run SD: ${st?.between_run_sd?.toFixed(4) ?? 'N/A'} (CV: ${st?.between_run_cv?.toFixed(2) ?? 'N/A'}%)
  Total SD: ${st?.total_sd?.toFixed(4) ?? 'N/A'} (CV: ${st?.total_cv?.toFixed(2) ?? 'N/A'}%)
  Manufacturer CV limit: ${st?.manufacturer_cv ?? 'N/A'}% × ${s.acceptance_multiplier} = ${st?.manufacturer_cv != null ? (st.manufacturer_cv * s.acceptance_multiplier).toFixed(2) : 'N/A'}%
  Result: ${st?.passed ? 'PASS' : 'FAIL'}

Provide: (1) Assessment per CLSI EP15-A3 — does between-run variation dominate or within-run?, (2) If total CV exceeds limit: is it the within-run or between-run component driving failure?, (3) Clinical relevance — does this CV allow reliable patient result interpretation?, (4) Sigma metric estimate if TEa is known for this analyte class, (5) Corrective action if failed and re-verification frequency recommendation.`
  }

  else if (body.study_type === 'pt') {
    const ev = await c.env.DB.prepare('SELECT * FROM pt_events WHERE id = ? AND lab_id = ?')
      .bind(body.study_id, lab_id).first<any>()
    if (!ev) return c.json({ error: 'Event not found' }, 404)

    const { results: summaries } = await c.env.DB.prepare(`
      SELECT s.*, a.name as analyte_name
      FROM pt_event_summary s LEFT JOIN analytes a ON s.analyte_id = a.id
      WHERE s.event_id = ?
    `).bind(body.study_id).all<any>()

    const { results: results_data } = await c.env.DB.prepare(`
      SELECT r.*, a.name as analyte_name
      FROM pt_results r LEFT JOIN analytes a ON r.analyte_id = a.id
      WHERE r.event_id = ?
    `).bind(body.study_id).all<any>()

    const summaryText = summaries.map((s: any) =>
      `  ${s.analyte_name}: ${s.samples_passed}/${s.samples_tested} passed (${s.score_percent?.toFixed(0)}%) — ${s.overall_pass ? 'PASS' : 'FAIL'}`
    ).join('\n')

    const sdiText = results_data.map((r: any) =>
      `  ${r.analyte_name} S${r.sample_number}: result=${r.lab_result}, SDI=${r.sdi_value?.toFixed(2) ?? '—'}, dev=${r.deviation_percent?.toFixed(1) ?? '—'}%, ${r.score}`
    ).join('\n')

    prompt = `Interpret this proficiency testing event:

Provider: ${ev.provider}
Program: ${ev.program_name}
Event Code: ${ev.event_code ?? '—'}
Status: ${ev.status}

Analyte Summaries:
${summaryText || '  No summaries yet'}

Individual Sample Results:
${sdiText || '  No results'}

Provide: (1) Overall PT performance assessment per CLIA 42 CFR 493 requirements, (2) For any FAIL: analysis of the SDI values — is the bias systematic (all SDIs in same direction) or random?, (3) Implications for CLIA certification — is this a single failure or consecutive?, (4) Root cause hypotheses ranked by likelihood based on the SDI pattern, (5) Specific corrective action plan with documentation requirements, (6) CAP inspection readiness — what documentation should be prepared?`
  }

  else if (body.study_type === 'eqc') {
    const { results: comps } = await c.env.DB.prepare(`
      SELECT e.*, a.name as analyte_name, a.unit
      FROM eqc_peer_comparisons e
      LEFT JOIN analytes a ON e.analyte_id = a.id
      WHERE e.analyte_id = ? AND e.lab_id = ?
      ORDER BY e.created_at DESC LIMIT 12
    `).bind(body.study_id, lab_id).all<any>()

    if (!comps.length) return c.json({ error: 'No data found' }, 404)

    const analyte = comps[0]
    const sdiValues = comps.map((c: any) => c.sdi?.toFixed(3) ?? '—').join(', ')
    const biasValues = comps.map((c: any) => c.bias_from_peer?.toFixed(4) ?? '—').join(', ')
    const periods = comps.map((c: any) => c.comparison_period).join(', ')

    prompt = `Interpret this peer comparison trend for ${analyte.analyte_name} (${analyte.unit ?? ''}):

Program: ${analyte.program_name}
Periods analyzed: ${periods}

SDI values (newest first): ${sdiValues}
Bias from peer (newest first): ${biasValues}

Most recent entry:
  Lab Mean: ${comps[0].lab_mean}
  Peer Mean: ${comps[0].peer_mean}
  Peer SD: ${comps[0].peer_sd}
  Peer Group N: ${comps[0].peer_group_n ?? '—'}
  SDI: ${comps[0].sdi?.toFixed(3) ?? '—'}
  Percentile: ${comps[0].percentile_rank != null ? comps[0].percentile_rank + '%' : '—'}

Provide: (1) SDI trend interpretation — is the bias worsening, stable, or improving over time?, (2) Is the current SDI clinically acceptable for this analyte class?, (3) Likely causes of the observed bias direction (positive = lab reports higher than peers; negative = lab reports lower), (4) Whether this constitutes a systematic bias requiring method bias evaluation per CLSI EP15, (5) Recommended investigation steps and CAP survey follow-up actions.`
  }

  else {
    return c.json({ error: 'Invalid study_type' }, 400)
  }

  try {
    const interpretation = await callClaude(c.env.ANTHROPIC_API_KEY, [{ role: 'user', content: prompt }], 1800)
    return c.json({ interpretation })
  } catch {
    return c.json({ error: 'AI service unavailable' }, 502)
  }
})

// ─── Generate protocol ────────────────────────────────────────────────────────
app.post('/protocol', async (c) => {
  const body = await c.req.json<{
    study_type: string; analyte?: string; instrument?: string; additional_context?: string
  }>()

  const studyNames: Record<string, string> = {
    carryover: 'Carryover Evaluation (CLSI EP10-A3)',
    precision: 'Precision Verification Study (CLSI EP15-A3)',
    pt: 'Proficiency Testing Event (CLIA / CAP)',
    eqc: 'External QC Peer Comparison Analysis (CAP)',
  }

  const prompt = `Generate a detailed, ready-to-use laboratory protocol for: ${studyNames[body.study_type] ?? body.study_type}
${body.analyte ? `Analyte: ${body.analyte}` : ''}
${body.instrument ? `Instrument/System: ${body.instrument}` : ''}
${body.additional_context ? `Additional context: ${body.additional_context}` : ''}

Format the protocol with these sections:
1. Purpose & Regulatory Basis
2. Materials & Reagents Required
3. Pre-Study Preparation
4. Step-by-Step Procedure (numbered)
5. Calculations (with formulas)
6. Acceptance Criteria
7. Actions if Criteria Not Met
8. Documentation Requirements
9. Record Retention

Be specific, practical, and include exact formulas and acceptance thresholds.`

  try {
    const protocol = await callClaude(c.env.ANTHROPIC_API_KEY, [{ role: 'user', content: prompt }], 2000)
    return c.json({ protocol })
  } catch {
    return c.json({ error: 'AI service unavailable' }, 502)
  }
})

// ─── Chat ─────────────────────────────────────────────────────────────────────
app.post('/chat', async (c) => {
  const body = await c.req.json<{
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }>()

  if (!body.messages?.length) return c.json({ error: 'No messages' }, 400)

  try {
    const message = await callClaude(c.env.ANTHROPIC_API_KEY, body.messages, 1500)
    return c.json({ message })
  } catch {
    return c.json({ error: 'AI service unavailable' }, 502)
  }
})

export default app
