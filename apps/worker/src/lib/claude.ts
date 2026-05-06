import Anthropic from '@anthropic-ai/sdk'

export function getAnthropicClient(apiKey: string) {
  return new Anthropic({ apiKey })
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
  "amr": [{"parameter": "string", "lower": number, "upper": number, "unit": "string"}],
  "tea": [{"parameter": "string", "value": number, "unit": "string"}],
  "cv_limits": [{"parameter": "string", "value": number}],
  "carryover_limits": [{"parameter": "string", "value": number}],
  "calibration_frequency": "string",
  "qc_frequency": "string",
  "critical_limits": [{"parameter": "string", "low": number, "high": number, "unit": "string"}]
}`

export async function analyzeManual(client: Anthropic, pdfBase64: string): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20251001',
    max_tokens: 4096,
    system: MANUAL_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          { type: 'text', text: 'Extract all QC parameters from this manual and return as JSON.' },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return text
}

export async function chatWithLabData(
  client: Anthropic,
  userMessage: string,
  labContext: string
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20251001',
    max_tokens: 1024,
    system: `You are an expert laboratory QC advisor for a medical laboratory.
You have access to the following lab data:
${labContext}

Provide clear, actionable advice about QC performance, Westgard violations, and corrective actions.
Keep responses concise and clinically relevant.`,
    messages: [{ role: 'user', content: userMessage }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
