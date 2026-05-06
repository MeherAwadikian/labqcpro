import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Card, Select, FormField, Badge, PageHeader, Spinner } from '../components/ui'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Dot
} from 'recharts'

interface Analyte { id: string; name: string; unit: string }
interface Stats   { mean: number; sd: number; cv: number; n: number }
interface Run {
  id: string; value: number; run_date: string; operator: string
  violations: string[]; is_reject: boolean; z_score: number | null
}

const DOT_COLORS: Record<string, string> = {
  reject:  '#ef4444',
  warning: '#f59e0b',
  ok:      '#06b6d4',
}

function QCDot(props: any) {
  const { cx, cy, payload } = props
  const color = payload.is_reject ? DOT_COLORS.reject
    : payload.violations.length > 0 ? DOT_COLORS.warning
    : DOT_COLORS.ok
  return <Dot cx={cx} cy={cy} r={4} fill={color} stroke={color} />
}

export default function Charts() {
  const [analytes, setAnalytes] = useState<Analyte[]>([])
  const [analyteId, setAnalyteId] = useState('')
  const [level, setLevel] = useState('normal')
  const [chartData, setChartData] = useState<{ analyte: Analyte; stats: Stats | null; runs: Run[] } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get<{ data: Analyte[] }>('/analytes').then(r => setAnalytes(r.data))
  }, [])

  useEffect(() => {
    if (!analyteId) return
    setLoading(true)
    api.get<{ data: any }>(`/reports/levey-jennings?analyte_id=${analyteId}&level=${level}`)
      .then(r => setChartData(r.data))
      .finally(() => setLoading(false))
  }, [analyteId, level])

  const stats = chartData?.stats
  const unit  = chartData?.analyte.unit ?? ''

  const yDomain = stats
    ? [+(stats.mean - 3.5 * stats.sd).toFixed(2), +(stats.mean + 3.5 * stats.sd).toFixed(2)]
    : ['auto', 'auto']

  return (
    <div>
      <PageHeader title="Levey-Jennings Charts" subtitle="Visualize QC data with control limits" />

      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="w-56">
          <FormField label="Analyte">
            <Select value={analyteId} onChange={e => setAnalyteId(e.target.value)}>
              <option value="">Select…</option>
              {analytes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </FormField>
        </div>
        <div className="w-36">
          <FormField label="Level">
            <Select value={level} onChange={e => setLevel(e.target.value)}>
              <option value="normal">Normal</option>
              <option value="abnormal">Abnormal</option>
            </Select>
          </FormField>
        </div>
      </div>

      {loading && <div className="flex justify-center py-16"><Spinner size={32} /></div>}

      {chartData && !loading && (
        <div className="space-y-4">
          {/* Stats row */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Mean',  value: `${stats.mean.toFixed(3)} ${unit}` },
                { label: 'SD',    value: `±${stats.sd.toFixed(3)} ${unit}` },
                { label: 'CV',    value: `${stats.cv.toFixed(2)}%` },
                { label: 'n',     value: stats.n },
              ].map(s => (
                <Card key={s.label} className="py-3">
                  <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                  <div className="text-lg font-semibold text-brand-300">{s.value}</div>
                </Card>
              ))}
            </div>
          )}

          {/* Chart */}
          <Card>
            {chartData.runs.length === 0 ? (
              <p className="text-center text-gray-500 py-16">No QC runs found for this selection</p>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={chartData.runs} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="run_date"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    tickLine={false}
                    tickFormatter={(v: number) => v.toFixed(2)}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                    labelStyle={{ color: '#e5e7eb' }}
                    formatter={(val: number, name: string) => [`${val.toFixed(3)} ${unit}`, name]}
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null
                      const d = payload[0].payload as Run
                      return (
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm">
                          <p className="text-white font-medium">{d.run_date}</p>
                          <p className="text-brand-300">Value: {d.value} {unit}</p>
                          {d.z_score != null && <p className="text-gray-400">Z: {d.z_score.toFixed(2)}</p>}
                          <p className="text-gray-400">Operator: {d.operator}</p>
                          {d.violations.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {d.violations.map(v => (
                                <Badge key={v} variant={d.is_reject ? 'danger' : 'warning'}>{v}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    }}
                  />

                  {/* Control limit lines */}
                  {stats && [
                    { y: stats.mean + 3 * stats.sd, label: '+3SD', color: '#ef4444' },
                    { y: stats.mean + 2 * stats.sd, label: '+2SD', color: '#f59e0b' },
                    { y: stats.mean + stats.sd,     label: '+1SD', color: '#6b7280' },
                    { y: stats.mean,                label: 'Mean', color: '#22c55e' },
                    { y: stats.mean - stats.sd,     label: '-1SD', color: '#6b7280' },
                    { y: stats.mean - 2 * stats.sd, label: '-2SD', color: '#f59e0b' },
                    { y: stats.mean - 3 * stats.sd, label: '-3SD', color: '#ef4444' },
                  ].map(ref => (
                    <ReferenceLine
                      key={ref.label} y={ref.y}
                      stroke={ref.color} strokeDasharray={ref.label === 'Mean' ? undefined : '4 4'}
                      strokeWidth={ref.label === 'Mean' ? 2 : 1}
                      label={{ value: ref.label, fill: ref.color, fontSize: 10, position: 'right' }}
                    />
                  ))}

                  <Line
                    type="monotone" dataKey="value"
                    stroke="#06b6d4" strokeWidth={2}
                    dot={<QCDot />}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Legend */}
          <div className="flex gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-400 inline-block" />Accepted</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Warning</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Reject</span>
          </div>
        </div>
      )}

      {!analyteId && (
        <Card className="flex items-center justify-center h-48 text-gray-500">
          Select an analyte to display the Levey-Jennings chart
        </Card>
      )}
    </div>
  )
}
