import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Card, Select, FormField, PageHeader, Spinner, Badge } from '../components/ui'

interface Analyte { id: string; name: string; unit: string }
interface ControlStats { level: string; mean: number; sd: number; cv: number; n: number; calculated_at: string }

export default function Stats() {
  const [analytes, setAnalytes] = useState<Analyte[]>([])
  const [analyteId, setAnalyteId] = useState('')
  const [stats, setStats] = useState<ControlStats[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get<{ data: Analyte[] }>('/analytes').then(r => setAnalytes(r.data))
  }, [])

  useEffect(() => {
    if (!analyteId) return
    setLoading(true)
    api.get<{ data: ControlStats[] }>(`/analytes/${analyteId}/stats`)
      .then(r => setStats(r.data))
      .finally(() => setLoading(false))
  }, [analyteId])

  const selectedAnalyte = analytes.find(a => a.id === analyteId)

  return (
    <div>
      <PageHeader title="Control Statistics" subtitle="Mean, SD, and CV per analyte and level" />

      <div className="w-56 mb-6">
        <FormField label="Analyte">
          <Select value={analyteId} onChange={e => setAnalyteId(e.target.value)}>
            <option value="">Select…</option>
            {analytes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </FormField>
      </div>

      {loading && <div className="flex justify-center py-16"><Spinner size={32} /></div>}

      {!loading && analyteId && (
        <>
          {stats.length === 0 ? (
            <Card className="text-center text-gray-500 py-12">
              No statistics calculated yet — add at least 5 QC runs for this analyte
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {stats.map(s => (
                <Card key={s.level}>
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant={s.level === 'normal' ? 'info' : 'warning'} className="capitalize">{s.level}</Badge>
                    <span className="text-sm text-gray-400">{selectedAnalyte?.unit}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Mean',         value: s.mean.toFixed(4),  unit: selectedAnalyte?.unit },
                      { label: 'SD (1σ)',       value: `±${s.sd.toFixed(4)}`, unit: selectedAnalyte?.unit },
                      { label: '2SD',          value: `±${(s.sd * 2).toFixed(4)}`, unit: selectedAnalyte?.unit },
                      { label: '3SD',          value: `±${(s.sd * 3).toFixed(4)}`, unit: selectedAnalyte?.unit },
                      { label: 'CV',           value: `${s.cv.toFixed(2)}%` },
                      { label: 'n (data pts)', value: s.n },
                    ].map(row => (
                      <div key={row.label} className="bg-gray-800/50 rounded-lg px-3 py-2">
                        <div className="text-xs text-gray-500 mb-1">{row.label}</div>
                        <div className="text-sm font-semibold text-brand-300">
                          {row.value}{row.unit ? ` ${row.unit}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* CV interpretation */}
                  <div className={`mt-4 text-xs px-3 py-2 rounded-lg ${
                    s.cv < 2 ? 'bg-green-900/30 text-green-400' :
                    s.cv < 5 ? 'bg-blue-900/30 text-blue-400' :
                    s.cv < 10 ? 'bg-amber-900/30 text-amber-400' :
                    'bg-red-900/30 text-red-400'
                  }`}>
                    CV {s.cv < 2 ? '< 2% — Excellent precision' :
                        s.cv < 5 ? '2–5% — Good precision' :
                        s.cv < 10 ? '5–10% — Acceptable (verify)' :
                        '> 10% — Poor precision — investigate'}
                  </div>

                  <p className="text-xs text-gray-600 mt-2">
                    Calculated: {new Date(s.calculated_at).toLocaleString()}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {!analyteId && (
        <Card className="flex items-center justify-center h-48 text-gray-500">
          Select an analyte to view control statistics
        </Card>
      )}
    </div>
  )
}
