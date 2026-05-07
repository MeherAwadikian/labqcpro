import { useState, useEffect, useRef } from 'react'
import { api } from '../../lib/api'
import { Bot, Send, Loader, Sparkles, FileText, HelpCircle } from 'lucide-react'

type Study = { id: string; title: string; study_type: string; status: string }
type ChatMsg = { role: 'user' | 'assistant'; content: string }

const EXAMPLE_QUESTIONS = [
  'How many samples do I need for a reagent lot comparison?',
  'My Bland-Altman shows a proportional bias — what does that mean?',
  'CAP requires linearity verification — what are the steps?',
  'My new lot CV is 6% vs manufacturer claim of 4% — do I accept it?',
  'What is the difference between Passing-Bablok and Deming regression?',
  'At what r value is method comparison acceptable per CLSI EP9?',
]

const TABS = [
  { id: 'interpret',  label: 'Interpret Study',    icon: Sparkles },
  { id: 'protocol',   label: 'Protocol Generator', icon: FileText },
  { id: 'chat',       label: 'Regulatory Chat',    icon: HelpCircle },
] as const

type TabId = typeof TABS[number]['id']

export default function ValidationAi() {
  const [tab, setTab] = useState<TabId>('interpret')
  const [studies, setStudies] = useState<Study[]>([])

  // Interpret tab
  const [selectedStudy, setSelectedStudy] = useState('')
  const [interpResult, setInterpResult] = useState('')
  const [interpLoading, setInterpLoading] = useState(false)

  // Protocol tab
  const [analyte, setAnalyte]     = useState('')
  const [instrument, setInstrument] = useState('')
  const [studyType, setStudyType] = useState('reagent_lot')
  const [protocol, setProtocol]   = useState('')
  const [protoLoading, setProtoLoading] = useState(false)

  // Chat tab
  const [messages, setMessages] = useState<ChatMsg[]>([{
    role: 'assistant',
    content: `Hello! I'm your laboratory validation expert, with deep knowledge of CLSI EP5, EP9, EP15, EP26, CLIA 42 CFR 493, CAP accreditation standards, and ISO 15189.

Ask me anything about validation study design, statistical interpretation, or regulatory compliance.`,
  }])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get<Study[]>('/validation').then(s => setStudies(s.filter(x => x.status === 'complete' || x.status === 'approved')))
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function interpretStudy() {
    if (!selectedStudy) return
    setInterpLoading(true); setInterpResult('')
    try {
      const res = await api.post<{ result: string }>('/validation/ai/interpret', { study_id: selectedStudy })
      setInterpResult(res.result)
    } catch (e: any) { setInterpResult(`Error: ${e.message}`) }
    finally { setInterpLoading(false) }
  }

  async function generateProtocol() {
    if (!analyte || !studyType) return
    setProtoLoading(true); setProtocol('')
    try {
      const res = await api.post<{ result: string }>('/validation/ai/protocol', { analyte, instrument, study_type: studyType })
      setProtocol(res.result)
    } catch (e: any) { setProtocol(`Error: ${e.message}`) }
    finally { setProtoLoading(false) }
  }

  async function sendChat(text?: string) {
    const input = text ?? chatInput
    if (!input.trim()) return
    const userMsg: ChatMsg = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)
    try {
      const apiMsgs = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const res = await api.post<{ reply: string }>('/validation/ai/chat', { messages: apiMsgs })
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply }])
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }])
    }
    finally { setChatLoading(false) }
  }

  const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'
  const labelCls = 'text-xs text-gray-400 mb-1 block'

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Bot size={22} className="text-brand-400" />
        <div>
          <h1 className="text-lg font-bold text-white">AI Brain — Validation</h1>
          <p className="text-xs text-gray-400">CLSI · CLIA · CAP regulatory intelligence</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-colors ${
              tab === id ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Interpret Study */}
      {tab === 'interpret' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-white text-sm">Auto-Interpret Study Results</h2>
          <div>
            <label className={labelCls}>Select Completed Study</label>
            <select value={selectedStudy} onChange={e => setSelectedStudy(e.target.value)} className={inputCls}>
              <option value="">Choose a completed study…</option>
              {studies.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          <button onClick={interpretStudy} disabled={!selectedStudy || interpLoading}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
            {interpLoading ? <><Loader size={14} className="animate-spin" /> Analyzing…</> : <><Sparkles size={14} /> Interpret with AI</>}
          </button>
          {interpResult && (
            <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed border border-gray-700 max-h-96 overflow-auto">
              {interpResult}
            </div>
          )}
          {studies.length === 0 && (
            <p className="text-xs text-gray-500">Complete a validation study first to use this feature.</p>
          )}
        </div>
      )}

      {/* Protocol Generator */}
      {tab === 'protocol' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-white text-sm">Validation Protocol Generator</h2>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className={labelCls}>Analyte / Test</label>
              <input type="text" value={analyte} onChange={e => setAnalyte(e.target.value)} className={inputCls} placeholder="e.g. Serum Glucose, HbA1c, Troponin I" />
            </div>
            <div>
              <label className={labelCls}>Instrument / Method</label>
              <input type="text" value={instrument} onChange={e => setInstrument(e.target.value)} className={inputCls} placeholder="e.g. Roche Cobas c702" />
            </div>
            <div>
              <label className={labelCls}>Study Type</label>
              <select value={studyType} onChange={e => setStudyType(e.target.value)} className={inputCls}>
                <option value="reagent_lot">Reagent Lot Validation (CLSI EP26)</option>
                <option value="calibrator_lot">Calibrator Lot Validation (CLIA 493.1255)</option>
                <option value="new_instrument">New Instrument Validation (CLSI EP15)</option>
                <option value="method_comparison">Method Comparison Study (CLSI EP9)</option>
              </select>
            </div>
          </div>
          <button onClick={generateProtocol} disabled={!analyte || protoLoading}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
            {protoLoading ? <><Loader size={14} className="animate-spin" /> Generating…</> : <><FileText size={14} /> Generate Protocol</>}
          </button>
          {protocol && (
            <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed border border-gray-700 max-h-[500px] overflow-auto">
              {protocol}
            </div>
          )}
        </div>
      )}

      {/* Regulatory Chat */}
      {tab === 'chat' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden" style={{ height: 520 }}>
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-800 text-gray-200 border border-gray-700'
                  }`}>
                    {m.role === 'assistant' && <Bot size={13} className="inline mr-1.5 text-brand-400 mb-0.5" />}
                    {m.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
                    <Loader size={14} className="animate-spin text-brand-400" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Example questions */}
            {messages.length <= 1 && (
              <div className="px-4 pb-2">
                <p className="text-xs text-gray-500 mb-2">Try asking:</p>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLE_QUESTIONS.slice(0, 3).map(q => (
                    <button key={q} onClick={() => sendChat(q)}
                      className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-lg px-2.5 py-1 transition-colors text-left">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-gray-800 p-3 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                placeholder="Ask a validation or regulatory question…"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                disabled={chatLoading}
              />
              <button onClick={() => sendChat()} disabled={!chatInput.trim() || chatLoading}
                className="bg-brand-600 hover:bg-brand-700 text-white p-2 rounded-lg transition-colors disabled:opacity-50">
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
