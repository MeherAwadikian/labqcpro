import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { Card, CardHeader, CardTitle, Badge, Spinner } from '../components/ui'
import { AlertTriangle, CheckCircle, FlaskConical, TrendingUp, ShieldAlert } from 'lucide-react'

interface SummaryData {
  analyte_summary: any[]
  violation_breakdown: any[]
  period: { from: string; to: string }
}

interface SubStatus {
  status: string
  days_left: number
  is_active: boolean
}

interface ComplianceAlert {
  id: string
  alert_type: string
  severity: string
  description: string
  created_at: string
}

export default function Dashboard() {
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [subStatus, setSubStatus] = useState<SubStatus | null>(null)
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<{ data: SummaryData }>('/reports/summary'),
      api.get<{ data: SubStatus }>('/subscription/status').catch(() => null),
      api.get<{ data: ComplianceAlert[] }>('/iqcp/cap/alerts').catch(() => ({ data: [] })),
    ]).then(([s, sub, al]) => {
      setSummary(s.data)
      if (sub) setSubStatus(sub.data)
      setAlerts((al?.data || []).slice(0, 5))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Spinner size={32} />
    </div>
  )

  const totalRuns     = summary?.analyte_summary.reduce((a, r) => a + r.total_runs, 0) ?? 0
  const totalRejects  = summary?.analyte_summary.reduce((a, r) => a + r.reject_count, 0) ?? 0
  const totalWarnings = summary?.analyte_summary.reduce((a, r) => a + r.warning_count, 0) ?? 0
  const rejectRate    = totalRuns > 0 ? ((totalRejects / totalRuns) * 100).toFixed(1) : '0'
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-400">Last 30 days QC overview</p>
        </div>
        {subStatus && !subStatus.is_active && (
          <Link to="/subscription" className="bg-amber-600/20 border border-amber-700 text-amber-300 text-sm px-4 py-2 rounded-lg hover:bg-amber-600/30 transition-colors">
            ⚠ Subscription expired — upgrade
          </Link>
        )}
        {subStatus?.status === 'trial' && (
          <div className="bg-brand-600/20 border border-brand-700 text-brand-300 text-sm px-4 py-2 rounded-lg">
            Trial: {subStatus.days_left} day(s) left
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'QC Runs (30d)',    value: totalRuns,    icon: FlaskConical,  color: 'text-brand-400' },
          { label: 'Reject Rate',      value: `${rejectRate}%`, icon: AlertTriangle, color: totalRejects > 0 ? 'text-red-400' : 'text-green-400' },
          { label: 'Warnings',         value: totalWarnings, icon: TrendingUp,   color: 'text-amber-400' },
          { label: 'Compliance Alerts', value: criticalAlerts, icon: ShieldAlert, color: criticalAlerts > 0 ? 'text-red-400' : 'text-green-400' },
        ].map(stat => (
          <Card key={stat.label} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-wide">{stat.label}</span>
              <stat.icon size={16} className={stat.color} />
            </div>
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Violations breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Westgard Violations</CardTitle>
          </CardHeader>
          {summary?.violation_breakdown.length === 0 ? (
            <div className="flex items-center gap-2 text-green-400 text-sm py-4">
              <CheckCircle size={16} />
              No violations in the last 30 days
            </div>
          ) : (
            <div className="space-y-2">
              {summary?.violation_breakdown.slice(0, 8).map((v: any) => (
                <div key={`${v.rule}-${v.severity}`} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={v.severity === 'reject' ? 'danger' : 'warning'}>
                      {v.rule}
                    </Badge>
                    <span className="text-sm text-gray-400">{v.severity}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-300">{v.count}×</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Compliance alerts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Compliance Alerts</CardTitle>
              <Link to="/iqcp/cap" className="text-xs text-brand-400 hover:underline">View all</Link>
            </div>
          </CardHeader>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-green-400 text-sm py-4">
              <CheckCircle size={16} />
              No active compliance alerts
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map(alert => (
                <div key={alert.id} className="flex items-start gap-3 py-2 border-b border-gray-800/50 last:border-0">
                  <Badge variant={alert.severity === 'critical' ? 'danger' : alert.severity === 'major' ? 'warning' : 'info'}>
                    {alert.severity}
                  </Badge>
                  <p className="text-sm text-gray-300 flex-1">{alert.description}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Analyte summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Analyte QC Summary</CardTitle>
            <Link to="/reports" className="text-xs text-brand-400 hover:underline">Full report →</Link>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['Analyte', 'Level', 'Runs', 'Rejects', 'Warnings', 'Status'].map(h => (
                  <th key={h} className="text-left text-xs text-gray-500 uppercase tracking-wide px-2 py-2 border-b border-gray-800">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(summary?.analyte_summary ?? []).slice(0, 10).map((row: any, i) => (
                <tr key={i} className="border-b border-gray-800/50 last:border-0">
                  <td className="px-2 py-2.5 text-gray-200 font-medium">{row.analyte_name}</td>
                  <td className="px-2 py-2.5">
                    <Badge variant={row.level === 'normal' ? 'info' : 'warning'}>{row.level}</Badge>
                  </td>
                  <td className="px-2 py-2.5 text-gray-300">{row.total_runs}</td>
                  <td className="px-2 py-2.5">
                    <span className={row.reject_count > 0 ? 'text-red-400 font-medium' : 'text-gray-500'}>
                      {row.reject_count}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={row.warning_count > 0 ? 'text-amber-400' : 'text-gray-500'}>
                      {row.warning_count}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <Badge variant={row.reject_count > 0 ? 'danger' : row.warning_count > 0 ? 'warning' : 'success'}>
                      {row.reject_count > 0 ? 'Violations' : row.warning_count > 0 ? 'Warnings' : 'OK'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(summary?.analyte_summary ?? []).length === 0 && (
            <p className="text-center text-gray-500 py-8">No QC data yet. <Link to="/qc-entry" className="text-brand-400 hover:underline">Add your first run →</Link></p>
          )}
        </div>
      </Card>
    </div>
  )
}
