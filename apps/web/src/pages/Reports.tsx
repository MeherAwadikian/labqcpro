import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Card, CardHeader, CardTitle, Select, FormField, Badge, PageHeader, Spinner, Table, Th, Td } from '../components/ui'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'

interface Summary {
  analyte_summary: any[]
  violation_breakdown: any[]
  period: { from: string; to: string }
}

const VIOLATION_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#22c55e', '#06b6d4']

export default function Reports() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]
  })
  const [to, setTo] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  function load() {
    setLoading(true)
    api.get<{ data: Summary }>(`/reports/summary?from=${from}&to=${to}`)
      .then(r => setSummary(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <PageHeader title="Reports" subtitle="QC performance summary and analytics" />

      <div className="flex gap-4 mb-6 flex-wrap items-end">
        <div className="w-40">
          <FormField label="From">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </FormField>
        </div>
        <div className="w-40">
          <FormField label="To">
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </FormField>
        </div>
        <button onClick={load}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          Apply
        </button>
      </div>

      {loading && <div className="flex justify-center py-16"><Spinner size={32} /></div>}

      {summary && !loading && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Runs per analyte bar chart */}
            <Card>
              <CardHeader><CardTitle>QC Runs by Analyte</CardTitle></CardHeader>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={summary.analyte_summary}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="analyte_name" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                  <Bar dataKey="total_runs" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Total Runs" />
                  <Bar dataKey="reject_count" fill="#ef4444" radius={[4, 4, 0, 0]} name="Rejects" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Violation breakdown pie */}
            <Card>
              <CardHeader><CardTitle>Violation Breakdown</CardTitle></CardHeader>
              {summary.violation_breakdown.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-green-400 text-sm">
                  ✓ No violations in selected period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={summary.violation_breakdown}
                      dataKey="count" nameKey="rule"
                      cx="50%" cy="50%" outerRadius={90}
                      label={({ rule, count }: any) => `${rule}: ${count}`}
                    >
                      {summary.violation_breakdown.map((_, i) => (
                        <Cell key={i} fill={VIOLATION_COLORS[i % VIOLATION_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Detailed table */}
          <Card className="p-0">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="font-semibold text-white">Analyte Detail</h3>
            </div>
            <Table>
              <thead>
                <tr>
                  {['Analyte', 'Level', 'Total Runs', 'Rejects', 'Warnings', 'Reject Rate'].map(h => (
                    <Th key={h}>{h}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.analyte_summary.map((row: any, i) => {
                  const rejectRate = row.total_runs > 0
                    ? ((row.reject_count / row.total_runs) * 100).toFixed(1) : '0'
                  return (
                    <tr key={i}>
                      <Td><span className="font-medium text-white">{row.analyte_name}</span></Td>
                      <Td><Badge variant={row.level === 'normal' ? 'info' : 'warning'}>{row.level}</Badge></Td>
                      <Td>{row.total_runs}</Td>
                      <Td>
                        <span className={row.reject_count > 0 ? 'text-red-400 font-medium' : 'text-gray-500'}>
                          {row.reject_count}
                        </span>
                      </Td>
                      <Td>
                        <span className={row.warning_count > 0 ? 'text-amber-400' : 'text-gray-500'}>
                          {row.warning_count}
                        </span>
                      </Td>
                      <Td>
                        <span className={
                          parseFloat(rejectRate) > 5 ? 'text-red-400 font-medium' :
                          parseFloat(rejectRate) > 2 ? 'text-amber-400' : 'text-green-400'
                        }>
                          {rejectRate}%
                        </span>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  )
}
