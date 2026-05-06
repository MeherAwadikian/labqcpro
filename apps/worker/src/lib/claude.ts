const CLAUDE_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

async function callClaude(
  apiKey: string,
  system: string,
  messages: { role: string; content: any }[],
  maxTokens = 2048
): Promise<string> {
  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
  })
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`)
  const data = await res.json() as any
  return data.content[0].text
}

export const MANUAL_SYSTEM_PROMPT = `You are a laboratory QC expert. Analyze this instrument/method manual and extract:
1. Analytical Measurement Range (AMR) for each parameter
2. Allowable Total Error (TEa) values
3. Manufacturer's stated CV% limits
4. Carryover limits
5. Calibration frequency requirements
6. QC frequency recommendations
7. Critical alert limits

Return ONLY valid JSON in this exact structure:
{
  "summary": "Brief description of the instrument/method",
  "amr": [{"parameter": "string", "lower": number, "upper": number, "unit": "string"}],
  "tea": [{"parameter": "string", "value": number, "unit": "string"}],
  "cv_limits": [{"parameter": "string", "value": number}],
  "carryover_limits": [{"parameter": "string", "value": number}],
  "calibration_frequency": "string",
  "qc_frequency": "string",
  "critical_limits": [{"parameter": "string", "low": number, "high": number, "unit": "string"}],
  "key_procedures": ["string"],
  "analytes_mentioned": ["string"],
  "extracted_ranges": [{"parameter": "string", "lower": number, "upper": number, "unit": "string"}]
}`

export async function analyzeManual(pdfBase64: string, filename: string, apiKey: string): Promise<any> {
  const text = await callClaude(
    apiKey,
    MANUAL_SYSTEM_PROMPT,
    [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
        },
        { type: 'text', text: `Extract all QC parameters from this manual (${filename}) and return as JSON.` },
      ],
    }],
    4096
  )
  try { return JSON.parse(text) } catch { return { summary: text, extracted_ranges: [], key_procedures: [], analytes_mentioned: [] } }
}

export async function chatWithLabData(
  userMessage: string,
  labContext: object,
  apiKey: string
): Promise<string> {
  return callClaude(
    apiKey,
    `You are an expert laboratory QC advisor for a medical laboratory.
You have access to the following lab data:
${JSON.stringify(labContext, null, 2)}

Provide clear, actionable advice about QC performance, Westgard violations, and corrective actions.
Keep responses concise and clinically relevant.`,
    [{ role: 'user', content: userMessage }],
    1024
  )
}
