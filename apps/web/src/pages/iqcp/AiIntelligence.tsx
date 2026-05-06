import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { Card, Button, Input, Select, Textarea, FormField, Badge, PageHeader, Spinner } from '../../components/ui'
import { RefreshCw, Bot, Send, Zap, FileSearch, ClipboardCheck, AlertTriangle, CheckCircle } from 'lucide-react'

interface Update {
  id: string; summary: string; full_content: string; generated_at: string; applied: boolean; update_type: string
}

type Tab = 'feed' | 'generator' | 'gap' | 'cap-chat' | 'extension'

export default function IQCPAi() {
  const [tab, setTab] = useState<Tab>('feed')
  const [updates, setUpdates] = useState<Update[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Generator state
  const [genForm, setGenForm] = useState({ analyte_name: '', instrument: '', daily_volume: '', current_qc_approach: '' })
  const [genResult, setGenResult] = useState<any>(null)

  // Gap analysis state
  const [gapResult, setGapResult] = useState<any>(null)
  const [gapLoading, setGapLoading] = useState(false)

  // CAP chat state
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Extension advisor state
  const [extForm, setExtForm] = useState({ reagent_type: '', days_past_expiry: '', qc_performance_summary: '' })
  const [extResult, setExtResult] = useState<any>(null)
  const [extLoading, setExtLoading] = useState(false)

  useEffect(() => {
    api.get<{ data: Update[] }>('/iqcp/ai/updates').then(r => setUpdates(r.data)).catch(() => {})
  }, [])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  async function fetchUpdates() {
    setGenerating(true)
    try {
      await api.post('/iqcp/ai/updates/generate', {})
      const r = await api.get<{ data: Update[] }>('/iqcp/ai/updates')
      setUpdates(r.data)
    } finally { setGenerating(false) }
  }

  async function applyUpdate(id: string) {
    await api.post(`/iqcp/ai/updates/${id}/apply`, {})
    setUpdates(u => u.map(x => x.id === id ? {...x, applied: true} : x))
  }

  async function generatePlan() {
    if (!genForm.analyte_name) return
    setLoading(true)
    try {
      const r = await api.post<{ data: any }>('/iqcp/ai/generate-plan', genForm)
      setGenResult(r.data)
    } finally { setLoading(false) }
  }

  async function analyzeCompliance() {
    setGapLoading(true)
    try {
      const r = await api.post<{ data: any }>('/iqcp/ai/analyze-compliance', {})
      setGapResult(r.data)
    } finally { setGapLoading(false) }
  }

  async function sendChat() {
    if (!chatInput.trim()) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatMessages(m => [...m, { role: 'user', content: msg }])
    setChatLoading(true)
    try {
      const r = await api.post<{ data: { reply: string } }>('/iqcp/ai/chat', { message: msg })
      setChatMessages(m => [...m, { role: 'assistant', content: r.data.reply }])
    } finally { setChatLoading(false) }
  }

  async function interpretCap() {
    if (!chatInput.trim()) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatLoading(true)
    try {
      const r = await api.post<{ data: any }>('/iqcp/ai/interpret-cap', { question_text: msg })
      const reply = r.data.plain_language + '\n\n**Documentation needed:**\n' +
        (r.data.documentation_needed?.join('\n• ') || '') +
        '\n\n**Common deficiencies:**\n' + (r.data.common_deficiencies?.join('\n• ') || '')
      setChatMessages(m => [...m, { role: 'user', content: `Interpret CAP requirement: ${msg}` }, { role: 'assistant', content: reply }])
    } finally { setChatLoading(false) }
  }

  async function getExtensionAdvice() {
    if (!extForm.reagent_type) return
    setExtLoading(true)
    try {
      const r = await api.post<{ data: any }>('/iqcp/ai/reagent-extension-advice', extForm)
      setExtResult(r.data)
    } finally { setExtLoading(false) }
  }

  const TABS = [
    { id: 'feed',      icon: RefreshCw,     label: 'Regulatory Feed' },
    { id: 'generator', icon: Zap,           label: 'IQCP Generator' },
    { id: 'gap',       icon: FileSearch,    label: 'Gap Analyzer' },
    { id: 'cap-chat',  icon: Bot,           label: 'CAP Interpreter' },
    { id: 'extension', icon: AlertTriangle, label: 'Extension Advisor' },
  ] as const

  const riskColor = (r: string) =>
    r === 'high' ? 'danger' : r === 'medium' ? 'warning' : 'success'

  return (
    <div>
      <PageHeader title="IQCP AI Intelligence" subtitle="Claude-powered regulatory intelligence center" />

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as Tab)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              tab === t.id
                ? 'bg-iqcp-600/20 border-iqcp-500 text-iqcp-300'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Regulatory Feed */}
      {tab === 'feed' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="iqcp" onClick={fetchUpdates} disabled={generating}>
              <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
              {generating ? 'Generating…' : 'Generate Weekly Update'}
            </Button>
          </div>
          {updates.length === 0 ? (
            <Card className="text-center py-12 text-gray-500">
              <Bot size={40} className="mx-auto mb-3 text-gray-700" />
              <p>No updates yet. Generate the first regulatory update.</p>
            </Card>
          ) : (
            updates.map(u => {
              let parsed: any[] = []
              try { parsed = JSON.parse(u.full_content) } catch { parsed = [{ title: 'Update', summary: u.full_content }] }
              return (
                <Card key={u.id}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Bot size={14} className="text-iqcp-400" />
                      <span className="text-sm text-gray-400">Generated {new Date(u.generated_at).toLocaleDateString()}</span>
                    </div>
                    {!u.applied && (
                      <Button size="sm" variant="iqcp" onClick={() => applyUpdate(u.id)}>
                        <CheckCircle size={12} /> Mark Applied
                      </Button>
                    )}
                    {u.applied && <Badge variant="success">Applied</Badge>}
                  </div>
                  <div className="space-y-3">
                    {parsed.map((item: any, i: number) => (
                      <div key={i} className="border border-gray-800 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="iqcp">{item.category || 'General'}</Badge>
                          {item.impact && <Badge variant={riskColor(item.impact)}>{item.impact} impact</Badge>}
                          <span className="font-medium text-white text-sm">{item.title}</span>
                        </div>
                        <p className="text-sm text-gray-400">{item.summary}</p>
                        {item.action_required && (
                          <p className="text-xs text-iqcp-300 mt-1.5">→ {item.action_required}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )
            })
          )}
        </div>
      )}

      {/* IQCP Plan Generator */}
      {tab === 'generator' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="font-semibold text-white mb-4">Generate IQCP Plan</h3>
            <div className="space-y-4">
              <FormField label="Analyte Name *">
                <Input value={genForm.analyte_name} onChange={e => setGenForm(f => ({...f, analyte_name: e.target.value}))} placeholder="Glucose" />
              </FormField>
              <FormField label="Instrument / Method">
                <Input value={genForm.instrument} onChange={e => setGenForm(f => ({...f, instrument: e.target.value}))} placeholder="Roche Cobas c501" />
              </FormField>
              <FormField label="Daily Test Volume">
                <Input value={genForm.daily_volume} onChange={e => setGenForm(f => ({...f, daily_volume: e.target.value}))} placeholder="200" />
              </FormField>
              <FormField label="Current QC Approach">
                <Textarea rows={2} value={genForm.current_qc_approach}
                  onChange={e => setGenForm(f => ({...f, current_qc_approach: e.target.value}))}
                  placeholder="2-level daily QC, Westgard 1₃s rule" />
              </FormField>
              <Button variant="iqcp" className="w-full" onClick={generatePlan} disabled={loading || !genForm.analyte_name}>
                <Zap size={14} />
                {loading ? 'Generating…' : 'Generate IQCP Plan'}
              </Button>
            </div>
          </Card>

          {genResult && (
            <Card className="overflow-y-auto max-h-[600px] scrollbar-thin">
              <h3 className="font-semibold text-iqcp-300 mb-4">Generated IQCP for {genForm.analyte_name}</h3>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs uppercase mb-2">QC Frequency</p>
                  <Badge variant="iqcp">{genResult.qc_frequency}</Badge>
                  <p className="text-gray-400 mt-1">{genResult.qc_frequency_justification}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase mb-2">Westgard Rules</p>
                  <div className="flex flex-wrap gap-1">
                    {genResult.recommended_westgard_rules?.map((r: string) => (
                      <Badge key={r} variant="iqcp">{r}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase mb-2">TEa ({genResult.tea_source})</p>
                  <p className="text-gray-300">{genResult.tea_value ? `${genResult.tea_value}%` : 'See CLIA PT criteria'}</p>
                  <p className="text-gray-500 text-xs mt-1">{genResult.tea_justification}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase mb-2">Risk Assessment</p>
                  <div className="space-y-2">
                    {genResult.risk_assessment?.map((r: any, i: number) => (
                      <div key={i} className="bg-gray-800/50 rounded-lg p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="iqcp">{r.category}</Badge>
                          <span className="text-xs text-gray-500">L{r.likelihood}×S{r.severity}={r.likelihood*r.severity}</span>
                        </div>
                        <p className="text-xs text-gray-400">{r.risk}: {r.mitigation}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase mb-2">Corrective Action Plan</p>
                  <p className="text-gray-400 whitespace-pre-line">{genResult.corrective_action_plan}</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Gap Analyzer */}
      {tab === 'gap' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="iqcp" onClick={analyzeCompliance} disabled={gapLoading}>
              <FileSearch size={14} />
              {gapLoading ? 'Analyzing…' : 'Analyze My Compliance'}
            </Button>
          </div>
          {gapResult ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm text-gray-400">Overall Risk</p>
                      <Badge variant={riskColor(gapResult.overall_risk)} className="mt-1 capitalize text-sm">
                        {gapResult.overall_risk}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Inspection Readiness</p>
                      <Badge variant={gapResult.inspection_readiness === 'ready' ? 'success' : gapResult.inspection_readiness === 'needs_attention' ? 'warning' : 'danger'} className="mt-1">
                        {gapResult.inspection_readiness?.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>
                </Card>
                <Card>
                  <p className="text-xs text-gray-500 uppercase mb-2">Key Strengths</p>
                  {gapResult.key_strengths?.map((s: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-300"><CheckCircle size={12} className="text-green-400 mt-0.5 flex-shrink-0" />{s}</div>
                  ))}
                </Card>
              </div>
              <Card>
                <p className="text-xs text-gray-500 uppercase mb-3">Priority Gaps</p>
                <div className="space-y-3">
                  {gapResult.top_gaps?.map((g: any, i: number) => (
                    <div key={i} className="border border-gray-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-5 h-5 rounded-full bg-iqcp-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">{g.priority}</span>
                        <Badge variant={riskColor(g.priority <= 2 ? 'high' : g.priority <= 4 ? 'medium' : 'low')}>{g.category}</Badge>
                        <span className="text-sm font-medium text-white">{g.issue}</span>
                      </div>
                      <p className="text-xs text-gray-500">{g.regulatory_citation}</p>
                      <p className="text-sm text-iqcp-300 mt-1">→ {g.remediation}</p>
                      <p className="text-xs text-gray-600 mt-1">Effort: {g.effort}</p>
                    </div>
                  ))}
                </div>
              </Card>
              {gapResult.immediate_actions?.length > 0 && (
                <Card className="bg-red-900/10 border-red-800">
                  <p className="text-xs text-red-400 uppercase mb-2 font-bold">Immediate Actions Required</p>
                  {gapResult.immediate_actions.map((a: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-red-300"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />{a}</div>
                  ))}
                </Card>
              )}
            </div>
          ) : (
            <Card className="text-center py-16 text-gray-500">
              <FileSearch size={40} className="mx-auto mb-3 text-gray-700" />
              <p>Click "Analyze My Compliance" to get AI-powered gap analysis based on your current data</p>
            </Card>
          )}
        </div>
      )}

      {/* CAP Chat */}
      {tab === 'cap-chat' && (
        <Card className="flex flex-col h-[600px] p-0">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <Bot size={16} className="text-iqcp-400" />
            <span className="font-semibold text-white text-sm">CAP Inspector & Interpreter</span>
            <Badge variant="iqcp" className="text-xs">Claude Sonnet</Badge>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <Bot size={40} className="text-gray-700" />
                <p className="text-gray-500 text-sm">Ask any CAP or CLIA question, or enter a CAP checklist ID to get a detailed interpretation</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {['What does GEN.20316 require?', 'How do I document calibration traceability?', 'What are common CAP inspection failures?'].map(q => (
                    <button key={q} onClick={() => setChatInput(q)}
                      className="text-xs text-iqcp-400 border border-iqcp-700 hover:bg-iqcp-900/20 px-3 py-1.5 rounded-lg transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-iqcp-600 text-white rounded-br-sm' : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                }`}>{m.content}</div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start"><div className="bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-sm"><Spinner size={14} /></div></div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="p-4 border-t border-gray-800 flex gap-2">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
              placeholder="Ask about CAP requirements, CLIA rules, or paste a checklist item…"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-iqcp-500" />
            <Button variant="iqcp" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
              <Send size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={interpretCap} disabled={chatLoading || !chatInput.trim()} title="Interpret as CAP requirement">
              CAP
            </Button>
          </div>
        </Card>
      )}

      {/* Extension Advisor */}
      {tab === 'extension' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="font-semibold text-white mb-4">Reagent Extension Advisor</h3>
            <div className="space-y-4">
              <FormField label="Reagent Type *">
                <Input value={extForm.reagent_type} onChange={e => setExtForm(f => ({...f, reagent_type: e.target.value}))} placeholder="Glucose enzymatic reagent" />
              </FormField>
              <FormField label="Days Past Labeled Expiry">
                <Input type="number" value={extForm.days_past_expiry} onChange={e => setExtForm(f => ({...f, days_past_expiry: e.target.value}))} placeholder="14" />
              </FormField>
              <FormField label="QC Performance Summary">
                <Textarea rows={4} value={extForm.qc_performance_summary}
                  onChange={e => setExtForm(f => ({...f, qc_performance_summary: e.target.value}))}
                  placeholder="All QC values within ±2SD for past 30 days. CV = 2.1%. No Westgard violations." />
              </FormField>
              <Button variant="iqcp" className="w-full" onClick={getExtensionAdvice} disabled={extLoading || !extForm.reagent_type}>
                <AlertTriangle size={14} />
                {extLoading ? 'Analyzing…' : 'Get Extension Advice'}
              </Button>
            </div>
          </Card>

          {extResult && (
            <Card>
              <h3 className="font-semibold text-white mb-4">Extension Assessment</h3>
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Defensibility</p>
                    <Badge variant={extResult.defensibility === 'high' ? 'success' : extResult.defensibility === 'medium' ? 'warning' : 'danger'} className="capitalize mt-1">
                      {extResult.defensibility}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Recommendation</p>
                    <Badge variant={extResult.recommendation === 'proceed' ? 'success' : extResult.recommendation?.includes('caution') ? 'warning' : 'danger'} className="mt-1">
                      {extResult.recommendation?.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-2">Risk Assessment</p>
                  <p className="text-gray-400">{extResult.risk_assessment}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-2">Required Documentation</p>
                  <ul className="space-y-1">
                    {extResult.required_documentation?.map((d: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-gray-400"><CheckCircle size={12} className="text-iqcp-400 mt-0.5 flex-shrink-0" />{d}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-2">Regulatory Citations</p>
                  {extResult.regulatory_citations?.map((c: string, i: number) => (
                    <p key={i} className="text-xs text-iqcp-300 font-mono">{c}</p>
                  ))}
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase mb-1">Maximum Extension Guidance</p>
                  <p className="text-gray-300">{extResult.max_extension_guidance}</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
