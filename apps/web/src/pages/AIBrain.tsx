import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { Card, Button, PageHeader, Spinner, Badge } from '../components/ui'
import { Send, Upload, Trash2, FileText, Brain, ExternalLink } from 'lucide-react'

const AI_LINKS = [
  {
    name: 'Claude',
    color: 'text-orange-300',
    bg: 'bg-orange-900/20 border-orange-800 hover:bg-orange-900/40',
    url: (q: string) => `https://claude.ai/new${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  },
  {
    name: 'ChatGPT',
    color: 'text-green-300',
    bg: 'bg-green-900/20 border-green-800 hover:bg-green-900/40',
    url: (q: string) => `https://chatgpt.com/${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  },
  {
    name: 'Gemini',
    color: 'text-blue-300',
    bg: 'bg-blue-900/20 border-blue-800 hover:bg-blue-900/40',
    url: (q: string) => `https://gemini.google.com/app${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  },
  {
    name: 'Perplexity',
    color: 'text-cyan-300',
    bg: 'bg-cyan-900/20 border-cyan-800 hover:bg-cyan-900/40',
    url: (q: string) => `https://www.perplexity.ai/${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  },
]

interface Manual { id: string; filename: string; size_bytes: number; uploaded_at: string }
interface Message { role: 'user' | 'assistant'; content: string }

export default function AIBrain() {
  const [manuals, setManuals] = useState<Manual[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get<{ data: Manual[] }>('/ai/manuals').then(r => setManuals(r.data))
  }, [])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function upload(file: File) {
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('filename', file.name)
    try {
      await api.upload('/ai/manuals/upload', form)
      const r = await api.get<{ data: Manual[] }>('/ai/manuals')
      setManuals(r.data)
    } finally {
      setUploading(false)
    }
  }

  async function analyze(manual: Manual) {
    setAnalyzing(manual.id)
    try {
      const res = await api.post<{ data: any }>('/ai/analyze-manual', { file_key: manual.id })
      setMessages(m => [...m,
        { role: 'user', content: `Analyze manual: ${manual.filename}` },
        { role: 'assistant', content: res.data.summary || JSON.stringify(res.data, null, 2) },
      ])
    } finally {
      setAnalyzing(null)
    }
  }

  async function deleteManual(id: string) {
    if (!confirm('Delete this manual?')) return
    await api.delete(`/ai/manuals/${id}`)
    setManuals(m => m.filter(x => x.id !== id))
  }

  async function sendMessage() {
    if (!input.trim() || sending) return
    const msg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', content: msg }])
    setSending(true)
    try {
      const res = await api.post<{ data: { reply: string } }>('/ai/chat', { message: msg })
      setMessages(m => [...m, { role: 'assistant', content: res.data.reply }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <PageHeader title="AI Brain" subtitle="Claude-powered lab intelligence and manual analysis" />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Manuals panel */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white text-sm">Lab Manuals</h3>
              <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload size={14} />
                {uploading ? 'Uploading…' : 'Upload PDF'}
              </Button>
              <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
            </div>

            {manuals.length === 0 ? (
              <p className="text-sm text-gray-500">No manuals uploaded yet</p>
            ) : (
              <div className="space-y-2">
                {manuals.map(m => (
                  <div key={m.id} className="flex items-start gap-2 p-2 bg-gray-800/50 rounded-lg">
                    <FileText size={14} className="text-brand-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 truncate">{m.filename}</p>
                      <p className="text-xs text-gray-500">{(m.size_bytes / 1024).toFixed(0)} KB</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => analyze(m)} disabled={analyzing === m.id}>
                        {analyzing === m.id ? <Spinner size={12} /> : <Brain size={12} />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteManual(m.id)} className="hover:text-red-400">
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="font-semibold text-white text-sm mb-3">Suggested Questions</h3>
            <div className="space-y-2">
              {[
                "What does the 2-2s Westgard rule mean?",
                "Why is my CV too high?",
                "How often should I run QC?",
                "What is total allowable error?",
                "Explain sigma metrics in QC",
              ].map(q => (
                <button key={q} onClick={() => setInput(q)}
                  className="w-full text-left text-xs text-gray-400 hover:text-brand-300 hover:bg-gray-800/50 px-2 py-1.5 rounded transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold text-white text-sm mb-1 flex items-center gap-2">
              <ExternalLink size={14} className="text-gray-400" />
              Open in External AI
            </h3>
            <p className="text-xs text-gray-500 mb-3">Type a question above, then launch it directly in any AI — no API key required.</p>
            <div className="grid grid-cols-2 gap-2">
              {AI_LINKS.map(ai => (
                <a
                  key={ai.name}
                  href={ai.url(input)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${ai.bg} ${ai.color}`}
                >
                  <ExternalLink size={11} />
                  {ai.name}
                </a>
              ))}
            </div>
          </Card>
        </div>

        {/* Chat panel */}
        <div className="lg:col-span-2">
          <Card className="flex flex-col h-[600px] p-0">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <Brain size={16} className="text-brand-400" />
              <span className="font-semibold text-white text-sm">Lab AI Assistant</span>
              <Badge variant="info" className="text-xs">Claude Sonnet</Badge>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                  <Brain size={40} className="text-gray-700" />
                  <p className="text-gray-500 text-sm">Ask me anything about laboratory QC, Westgard rules, statistics, or compliance</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-brand-600 text-white rounded-br-sm'
                      : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-sm">
                    <Spinner size={14} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-4 border-t border-gray-800">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Ask about QC, Westgard rules, statistics…"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <Button onClick={sendMessage} disabled={sending || !input.trim()}>
                  <Send size={16} />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
