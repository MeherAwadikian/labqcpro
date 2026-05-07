import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth'
import {
  ClipboardCheck, Plus, Trash2, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, AlertTriangle, BookOpen, Send,
} from 'lucide-react'

const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'
const lbl = 'text-xs text-gray-400 mb-1 block'
const btn = 'bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50'

type Analyte = { id: string; name: string; unit: string }
type PTEvent = {
  id: string; provider: string; program_name: string; event_code?: string
  shipment_date?: string; due_date?: string; status: string
  analyte_count?: number; analytes_passed?: number
  results?: PTResult[]; summaries?: PTSummary[]; actions?: CorrectiveAction[]
}
type PTResult = {
  id: string; analyte_id: string; analyte_name?: string; unit?: string
  sample_number: number; lab_result?: number; peer_mean?: number; peer_sd?: number
  sdi_value?: number; target_value?: number; tea_limit?: number
  deviation_percent?: number; score: string; notes?: string
}
type PTSummary = {
  analyte_id: string; analyte_name?: string; samples_tested: number
  samples_passed: number; score_percent: number; overall_pass: number
}
type CorrectiveAction = {
  id: string; root_cause: string; corrective_action: string; resolved: number; created_at: string
}

const STATUS_CLS: Record<string, string> = {
  pending:   'bg-amber-900/30 text-amber-300 border-amber-700',
  submitted: 'bg-blue-900/30 text-blue-300 border-blue-700',
  scored:    'bg-green-900/30 text-green-300 border-green-700',
}

const SCORE_CLS: Record<string, string> = {
  pass: 'text-green-400', fail: 'text-red-400', pending: 'text-gray-500',
}

const N_SAMPLES = 5

function sdiColor(sdi: number | null | undefined) {
  if (sdi == null) return 'text-gray-500'
  const abs = Math.abs(sdi)
  if (abs > 3) return 'text-red-400 font-bold'
  if (abs > 2) return 'text-red-400'
  if (abs > 1) return 'text-amber-400'
  return 'text-green-400'
}

export default function ProficiencyTesting() {
  const { role } = useAuthStore()
  const canDelete = ['admin', 'director'].includes(role ?? '')

  const [events, setEvents]         = useState<PTEvent[]>([])
  const [analytes, setAnalytes]     = useState<Analyte[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEvent, setSelected] = useState<PTEvent | null>(null)
  const [showNew, setShowNew]       = useState(false)
  const [eduOpen, setEduOpen]       = useState(false)
  const [msg, setMsg]               = useState<{ text: string; ok: boolean } | null>(null)

  // New event form
  const [provider, setProvider]       = useState('CAP')
  const [programName, setProgramName] = useState('')
  const [eventCode, setEventCode]     = useState('')
  const [shipDate, setShipDate]       = useState('')
  const [dueDate, setDueDate]         = useState('')
  const [creating, setCreating]       = useState(false)

  // Results entry
  const [resultsAnalyte, setResultsAnalyte] = useState('')
  const [resultsGrid, setResultsGrid]       = useState<{
    lab: string; peer_mean: string; peer_sd: string; target: string; tea: string; notes: string
  }[]>(() => Array.from({ length: N_SAMPLES }, () => ({ lab: '', peer_mean: '', peer_sd: '', target: '', tea: '', notes: '' })))
  const [savingResults, setSavingResults]   = useState(false)

  // Corrective action
  const [showCA, setShowCA]     = useState(false)
  const [caRootCause, setCaRC]  = useState('')
  const [caAction, setCaAction] = useState('')
  const [caDate, setCaDate]     = useState('')
  const [savingCA, setSavingCA] = useState(false)

  const [scoring, setScoring] = useState(false)

  function notify(text: string, ok: boolean) {
    setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000)
  }

  useEffect(() => {
    api.get<{ data: Analyte[] }>('/analytes').then(r => setAnalytes(r.data))
    loadEvents()
  }, [])

  function loadEvents() {
    api.get<{ data: PTEvent[] }>('/performance/pt').then(r => setEvents(r.data))
  }

  async function loadEvent(id: string) {
    const r = await api.get<{ data: PTEvent }>(`/performance/pt/${id}`)
    setSelected(r.data)
    setSelectedId(id)
  }

  async function createEvent() {
    if (!programName) { notify('Program name required.', false); return }
    setCreating(true)
    try {
      const r = await api.post<{ id: string }>('/performance/pt', {
        provider, program_name: programName,
        event_code: eventCode || undefined,
        shipment_date: shipDate || undefined,
        due_date: dueDate || undefined,
      })
      notify('PT event created.', true)
      setShowNew(false); setProvider('CAP'); setProgramName(''); setEventCode(''); setShipDate(''); setDueDate('')
      loadEvents()
      loadEvent(r.id)
    } catch (e: any) { notify(e.message, false) }
    finally { setCreating(false) }
  }

  async function deleteEvent(id: string) {
    if (!confirm('Delete this PT event and all results?')) return
    try {
      await api.delete(`/performance/pt/${id}`)
      setEvents(prev => prev.filter(e => e.id !== id))
      if (selectedId === id) { setSelectedId(null); setSelected(null) }
    } catch (e: any) { notify(e.message, false) }
  }

  function updateResultsRow(idx: number, field: keyof typeof resultsGrid[0], val: string) {
    setResultsGrid(prev => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: val }
      return copy
    })
  }

  async function saveResults() {
    if (!selectedId || !resultsAnalyte) { notify('Select an analyte first.', false); return }
    setSavingResults(true)
    try {
      await api.put(`/performance/pt/${selectedId}/results`, {
        analyte_id: resultsAnalyte,
        results: resultsGrid
          .filter((r, i) => r.lab !== '')
          .map((r, i) => ({
            sample_number: i + 1,
            lab_result: parseFloat(r.lab) || null,
            peer_mean: parseFloat(r.peer_mean) || null,
            peer_sd: parseFloat(r.peer_sd) || null,
            target_value: parseFloat(r.target) || null,
            tea_limit: parseFloat(r.tea) || null,
            notes: r.notes || undefined,
          })),
      })
      notify('Results saved.', true)
      setResultsGrid(Array.from({ length: N_SAMPLES }, () => ({ lab: '', peer_mean: '', peer_sd: '', target: '', tea: '', notes: '' })))
      setResultsAnalyte('')
      loadEvent(selectedId)
    } catch (e: any) { notify(e.message, false) }
    finally { setSavingResults(false) }
  }

  async function scoreEvent() {
    if (!selectedId) return
    setScoring(true)
    try {
      await api.post(`/performance/pt/${selectedId}/score`, {})
      notify('Event scored.', true)
      loadEvent(selectedId)
      loadEvents()
    } catch (e: any) { notify(e.message, false) }
    finally { setScoring(false) }
  }

  async function addCorrectiveAction() {
    if (!selectedId || !caRootCause || !caAction) { notify('Root cause and action required.', false); return }
    setSavingCA(true)
    try {
      await api.post(`/performance/pt/${selectedId}/corrective-action`, {
        root_cause: caRootCause, corrective_action: caAction,
        implementation_date: caDate || undefined,
      })
      notify('Corrective action saved.', true)
      setCaRC(''); setCaAction(''); setCaDate(''); setShowCA(false)
      loadEvent(selectedId)
    } catch (e: any) { notify(e.message, false) }
    finally { setSavingCA(false) }
  }

  const hasFailed = selectedEvent?.summaries?.some(s => !s.overall_pass)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <ClipboardCheck size={20} className="text-orange-400" /> Proficiency Testing
        </h1>
        <div className="flex gap-2">
          <button onClick={loadEvents} className="p-2 text-gray-500 hover:text-gray-300 transition-colors"><RefreshCw size={15} /></button>
          <button onClick={() => setShowNew(v => !v)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} /> New PT Event
          </button>
        </div>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${msg.ok ? 'bg-green-900/30 border-green-700 text-green-300' : 'bg-red-900/30 border-red-700 text-red-300'}`}>
          {msg.text}
        </div>
      )}

      {/* Education */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <button onClick={() => setEduOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-300 hover:text-white transition-colors">
          <span className="flex items-center gap-2"><BookOpen size={15} className="text-orange-400" /> About Proficiency Testing</span>
          {eduOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {eduOpen && (
          <div className="px-5 pb-5 space-y-3 border-t border-gray-800 pt-4 text-sm text-gray-400">
            <p><strong className="text-gray-200">Proficiency Testing (PT)</strong> involves external blind samples from a PT provider (CAP, CLIA, IQAS) tested exactly like patient samples.</p>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-lg p-3 space-y-1">
                <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">Scoring</div>
                <div>• Peer group comparison: lab result vs peer mean ± acceptance limit</div>
                <div>• Pass/Fail per sample; must achieve ≥ 80% to pass analyte</div>
                <div>• 3 events/year minimum for regulated analytes (CLIA)</div>
                <div>• Consecutive failures = regulatory action</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 space-y-1">
                <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">SDI (Standard Deviation Index)</div>
                <div className="font-mono text-xs text-orange-300">SDI = (Lab Result - Peer Mean) / Peer SD</div>
                <div className="mt-2 space-y-0.5 text-xs">
                  <div className="text-green-400">SDI ≤ ±1.0 — Excellent</div>
                  <div className="text-amber-400">SDI ±1.0 to ±2.0 — Acceptable, monitor</div>
                  <div className="text-red-400">SDI &gt; ±2.0 — Investigate</div>
                  <div className="text-red-500 font-bold">SDI &gt; ±3.0 — Critical, out of peer group</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New event form */}
      {showNew && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">New PT Event</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Provider</label>
              <select value={provider} onChange={e => setProvider(e.target.value)} className={inp}>
                <option>CAP</option><option>CLIA</option><option>IQAS</option><option>other</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={lbl}>Program Name</label>
              <input value={programName} onChange={e => setProgramName(e.target.value)} className={inp} placeholder="e.g. CAP Chemistry Survey C-A" />
            </div>
            <div>
              <label className={lbl}>Event Code</label>
              <input value={eventCode} onChange={e => setEventCode(e.target.value)} className={inp} placeholder="e.g. 2025-01" />
            </div>
            <div>
              <label className={lbl}>Shipment Date</label>
              <input type="date" value={shipDate} onChange={e => setShipDate(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inp} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createEvent} disabled={creating} className={btn}>{creating ? 'Creating…' : 'Create Event'}</button>
            <button onClick={() => setShowNew(false)} className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Events list */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Events</h2>
          </div>
          {events.length === 0
            ? <p className="px-4 py-8 text-sm text-gray-600 text-center">No events yet</p>
            : (
              <div className="divide-y divide-gray-800">
                {events.map(e => (
                  <div key={e.id}
                    onClick={() => loadEvent(e.id)}
                    className={`px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition-colors ${selectedId === e.id ? 'bg-gray-800/70 border-l-2 border-orange-500' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm text-gray-200 truncate">{e.program_name}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ml-2 flex-shrink-0 ${STATUS_CLS[e.status] ?? STATUS_CLS.pending}`}>{e.status}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                      <span>{e.provider} {e.event_code ? `· ${e.event_code}` : ''}</span>
                      {e.status === 'scored' && e.analyte_count != null && (
                        <span className={`font-medium ${e.analytes_passed === e.analyte_count ? 'text-green-400' : 'text-red-400'}`}>
                          {e.analytes_passed}/{e.analyte_count} pass
                        </span>
                      )}
                    </div>
                    {canDelete && (
                      <button onClick={ev => { ev.stopPropagation(); deleteEvent(e.id) }}
                        className="mt-1 p-1 text-gray-700 hover:text-red-400 rounded transition-colors">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Event detail */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedEvent
            ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                <ClipboardCheck size={32} className="text-gray-700 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Select an event to view details and enter results</p>
              </div>
            )
            : (
              <>
                {/* Event header */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-white">{selectedEvent.program_name}</div>
                      <div className="text-sm text-gray-400">{selectedEvent.provider} · {selectedEvent.event_code ?? '—'}</div>
                      {selectedEvent.due_date && <div className="text-xs text-gray-500 mt-1">Due: {selectedEvent.due_date}</div>}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full border ${STATUS_CLS[selectedEvent.status] ?? STATUS_CLS.pending}`}>
                      {selectedEvent.status}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {selectedEvent.status !== 'scored' && (
                      <button onClick={scoreEvent} disabled={scoring}
                        className="flex items-center gap-1.5 bg-orange-700 hover:bg-orange-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                        <Send size={12} /> {scoring ? 'Scoring…' : 'Calculate Scores'}
                      </button>
                    )}
                    {hasFailed && (
                      <button onClick={() => setShowCA(v => !v)}
                        className="flex items-center gap-1.5 bg-red-900/50 hover:bg-red-800/50 text-red-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-700 transition-colors">
                        <AlertTriangle size={12} /> Corrective Action
                      </button>
                    )}
                  </div>
                </div>

                {/* Corrective action form */}
                {showCA && (
                  <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-red-300 flex items-center gap-2"><AlertTriangle size={14} /> Corrective Action Required</h3>
                    <div>
                      <label className={lbl}>Root Cause</label>
                      <select value={caRootCause} onChange={e => setCaRC(e.target.value)} className={inp}>
                        <option value="">— Select —</option>
                        <option>Calibration failure / drift</option>
                        <option>Reagent lot change</option>
                        <option>Instrument malfunction</option>
                        <option>Operator error / transcription</option>
                        <option>PT sample handling issue</option>
                        <option>Method bias</option>
                        <option>QC failure not caught</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Corrective Action Taken</label>
                      <textarea value={caAction} onChange={e => setCaAction(e.target.value)} rows={3}
                        className={`${inp} resize-none`} placeholder="Describe the corrective action…" />
                    </div>
                    <div>
                      <label className={lbl}>Implementation Date</label>
                      <input type="date" value={caDate} onChange={e => setCaDate(e.target.value)} className={inp} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addCorrectiveAction} disabled={savingCA} className={btn}>{savingCA ? 'Saving…' : 'Save Action'}</button>
                      <button onClick={() => setShowCA(false)} className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Existing corrective actions */}
                {selectedEvent.actions && selectedEvent.actions.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Corrective Actions</h3>
                    {selectedEvent.actions.map(a => (
                      <div key={a.id} className="text-sm space-y-1 border-b border-gray-800 pb-3 mb-3 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{a.created_at.split('T')[0]}</span>
                          {a.resolved ? <CheckCircle2 size={12} className="text-green-400" /> : <XCircle size={12} className="text-amber-400" />}
                        </div>
                        <div><span className="text-gray-400 text-xs">Cause:</span> <span className="text-gray-200 text-xs">{a.root_cause}</span></div>
                        <div><span className="text-gray-400 text-xs">Action:</span> <span className="text-gray-200 text-xs">{a.corrective_action}</span></div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Scoring summary */}
                {selectedEvent.summaries && selectedEvent.summaries.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800">
                      <h3 className="text-sm font-semibold text-white">Scoring Summary</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          {['Analyte', 'Tested', 'Passed', 'Score %', 'Result'].map(h => (
                            <th key={h} className="px-4 py-2 text-left text-xs text-gray-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {selectedEvent.summaries.map(s => (
                          <tr key={s.analyte_id}>
                            <td className="px-4 py-2.5 text-gray-200">{s.analyte_name}</td>
                            <td className="px-4 py-2.5 text-gray-400">{s.samples_tested}</td>
                            <td className="px-4 py-2.5 text-gray-400">{s.samples_passed}</td>
                            <td className="px-4 py-2.5 font-mono text-gray-200">{s.score_percent.toFixed(0)}%</td>
                            <td className="px-4 py-2.5">
                              {s.overall_pass
                                ? <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle2 size={12} /> Pass</span>
                                : <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle size={12} /> Fail</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Results table */}
                {selectedEvent.results && selectedEvent.results.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800">
                      <h3 className="text-sm font-semibold text-white">Sample Results</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-800">
                            {['Analyte', 'Sample', 'Lab Result', 'Target', 'Deviation', 'SDI', 'Score'].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-gray-500">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {selectedEvent.results.map(r => (
                            <tr key={r.id} className={r.score === 'fail' ? 'bg-red-900/10' : ''}>
                              <td className="px-3 py-2 text-gray-300">{r.analyte_name ?? '—'}</td>
                              <td className="px-3 py-2 text-gray-400">#{r.sample_number}</td>
                              <td className="px-3 py-2 font-mono text-gray-200">
                                {r.lab_result != null ? `${r.lab_result} ${r.unit ?? ''}` : '—'}
                              </td>
                              <td className="px-3 py-2 font-mono text-gray-400">
                                {r.target_value != null ? r.target_value : '—'}
                              </td>
                              <td className={`px-3 py-2 font-mono ${r.deviation_percent != null && r.tea_limit != null && Math.abs(r.deviation_percent) > r.tea_limit ? 'text-red-400' : 'text-gray-300'}`}>
                                {r.deviation_percent != null ? `${r.deviation_percent.toFixed(1)}%` : '—'}
                              </td>
                              <td className={`px-3 py-2 font-mono ${sdiColor(r.sdi_value)}`}>
                                {r.sdi_value != null ? r.sdi_value.toFixed(2) : '—'}
                              </td>
                              <td className={`px-3 py-2 font-medium capitalize ${SCORE_CLS[r.score]}`}>{r.score}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Results entry */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-white">Enter / Update Results</h3>
                  <div>
                    <label className={lbl}>Analyte</label>
                    <select value={resultsAnalyte} onChange={e => setResultsAnalyte(e.target.value)} className={inp}>
                      <option value="">— Select analyte —</option>
                      {analytes.map(a => <option key={a.id} value={a.id}>{a.name} ({a.unit})</option>)}
                    </select>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-700">
                          {['Sample', 'Lab Result *', 'Target Value', 'TEa Limit %', 'Peer Mean', 'Peer SD', 'Notes'].map(h => (
                            <th key={h} className="px-2 py-2 text-left text-gray-500 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: N_SAMPLES }, (_, i) => (
                          <tr key={i} className="border-b border-gray-800">
                            <td className="px-2 py-1.5 text-gray-400 font-medium">#{i + 1}</td>
                            {(['lab', 'target', 'tea', 'peer_mean', 'peer_sd'] as const).map(field => (
                              <td key={field} className="px-2 py-1.5">
                                <input type="number" step="any" value={resultsGrid[i][field]}
                                  onChange={e => updateResultsRow(i, field, e.target.value)}
                                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-orange-500 text-gray-100" />
                              </td>
                            ))}
                            <td className="px-2 py-1.5">
                              <input value={resultsGrid[i].notes}
                                onChange={e => updateResultsRow(i, 'notes', e.target.value)}
                                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-orange-500 text-gray-100" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={saveResults} disabled={savingResults || !resultsAnalyte} className={btn}>
                    {savingResults ? 'Saving…' : 'Save Results'}
                  </button>
                </div>
              </>
            )}
        </div>
      </div>
    </div>
  )
}
