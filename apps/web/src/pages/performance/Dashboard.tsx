import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { api } from '../../lib/api'
import {
  Droplets, Target, ClipboardCheck, Users,
  CheckCircle2, XCircle, Clock, ChevronRight,
} from 'lucide-react'

export default function PerformanceDashboard() {
  const [carryover, setCarryover]     = useState<any[]>([])
  const [precision, setPrecision]     = useState<any[]>([])
  const [ptEvents, setPtEvents]       = useState<any[]>([])
  const [eqcComps, setEqcComps]       = useState<any[]>([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<{ data: any[] }>('/performance/carryover?limit=5'),
      api.get<{ data: any[] }>('/performance/precision?limit=50'),
      api.get<{ data: any[] }>('/performance/pt?limit=20'),
      api.get<{ data: any[] }>('/performance/eqc?limit=50'),
    ]).then(([c, p, pt, e]) => {
      setCarryover(c.data)
      setPrecision(p.data)
      setPtEvents(pt.data)
      setEqcComps(e.data)
    }).finally(() => setLoading(false))
  }, [])

  const carryoverPass  = carryover.filter(s => s.passed).length
  const carryoverFail  = carryover.filter(s => !s.passed && s.carryover_percent != null).length
  const precisionDone  = precision.filter(s => s.status === 'complete').length
  const ptPassed       = ptEvents.filter(e => e.status === 'scored' && e.analyte_count > 0 && e.analytes_passed === e.analyte_count).length
  const ptFailed       = ptEvents.filter(e => e.status === 'scored' && e.analytes_passed < e.analyte_count).length
  const eqcAlerts      = eqcComps.filter(e => e.sdi != null && Math.abs(e.sdi) > 2.0).length

  const cards = [
    {
      title: 'Carryover Studies',
      to: '/performance/carryover',
      icon: Droplets,
      color: 'text-cyan-400',
      bg: 'bg-cyan-900/20',
      stats: [
        { label: 'Pass', val: carryoverPass, color: 'text-green-400' },
        { label: 'Fail', val: carryoverFail, color: 'text-red-400' },
        { label: 'Total', val: carryover.length, color: 'text-gray-400' },
      ],
    },
    {
      title: 'Precision Studies',
      to: '/performance/precision',
      icon: Target,
      color: 'text-purple-400',
      bg: 'bg-purple-900/20',
      stats: [
        { label: 'Complete', val: precisionDone, color: 'text-green-400' },
        { label: 'In Progress', val: precision.length - precisionDone, color: 'text-amber-400' },
        { label: 'Total', val: precision.length, color: 'text-gray-400' },
      ],
    },
    {
      title: 'Proficiency Testing',
      to: '/performance/pt',
      icon: ClipboardCheck,
      color: 'text-orange-400',
      bg: 'bg-orange-900/20',
      stats: [
        { label: 'Pass', val: ptPassed, color: 'text-green-400' },
        { label: 'Fail', val: ptFailed, color: 'text-red-400' },
        { label: 'Pending', val: ptEvents.filter(e => e.status === 'pending').length, color: 'text-amber-400' },
      ],
    },
    {
      title: 'Peer Comparisons',
      to: '/performance/eqc',
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-900/20',
      stats: [
        { label: 'Total', val: eqcComps.length, color: 'text-gray-400' },
        { label: 'SDI Alerts', val: eqcAlerts, color: eqcAlerts > 0 ? 'text-red-400' : 'text-green-400' },
        { label: 'Accepted', val: eqcComps.filter(e => e.accepted).length, color: 'text-green-400' },
      ],
    },
  ]

  const STATUS_CLS: Record<string, string> = {
    pending:   'bg-amber-900/30 text-amber-300 border-amber-700',
    submitted: 'bg-blue-900/30 text-blue-300 border-blue-700',
    scored:    'bg-green-900/30 text-green-300 border-green-700',
  }

  if (loading) return <div className="text-gray-500 text-sm p-6">Loading…</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Performance & EQC</h1>
        <p className="text-sm text-gray-500 mt-1">
          Carryover · Precision · Proficiency Testing · External QC
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map(card => (
          <NavLink key={card.to} to={card.to}
            className={`${card.bg} border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors group`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <card.icon size={18} className={card.color} />
                <span className="text-sm font-medium text-gray-200">{card.title}</span>
              </div>
              <ChevronRight size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
            </div>
            <div className="flex gap-4">
              {card.stats.map(s => (
                <div key={s.label}>
                  <div className={`text-xl font-bold ${s.color}`}>{s.val}</div>
                  <div className="text-xs text-gray-600">{s.label}</div>
                </div>
              ))}
            </div>
          </NavLink>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent carryover */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Droplets size={15} className="text-cyan-400" /> Recent Carryover Studies
            </h2>
            <NavLink to="/performance/carryover" className="text-xs text-brand-400 hover:text-brand-300">View all</NavLink>
          </div>
          {carryover.length === 0
            ? <p className="px-4 py-6 text-sm text-gray-600 text-center">No studies yet</p>
            : (
              <div className="divide-y divide-gray-800">
                {carryover.slice(0, 5).map(s => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <div className="text-sm text-gray-200">{s.analyte_name ?? 'Unknown analyte'}</div>
                      <div className="text-xs text-gray-500">{s.instrument} · {s.study_date}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-300">
                        {s.carryover_percent != null ? `${s.carryover_percent.toFixed(3)}%` : '—'}
                      </span>
                      {s.passed
                        ? <CheckCircle2 size={15} className="text-green-400" />
                        : <XCircle size={15} className="text-red-400" />}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Recent PT events */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <ClipboardCheck size={15} className="text-orange-400" /> Proficiency Testing Events
            </h2>
            <NavLink to="/performance/pt" className="text-xs text-brand-400 hover:text-brand-300">View all</NavLink>
          </div>
          {ptEvents.length === 0
            ? <p className="px-4 py-6 text-sm text-gray-600 text-center">No events yet</p>
            : (
              <div className="divide-y divide-gray-800">
                {ptEvents.slice(0, 5).map(e => (
                  <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <div className="text-sm text-gray-200">{e.program_name}</div>
                      <div className="text-xs text-gray-500">{e.provider} · {e.event_code ?? '—'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {e.status === 'scored' && (
                        <span className="text-xs text-gray-400 font-mono">
                          {e.analytes_passed ?? 0}/{e.analyte_count ?? 0}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_CLS[e.status] ?? STATUS_CLS.pending}`}>
                        {e.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* EQC alerts */}
      {eqcAlerts > 0 && (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <XCircle size={16} className="text-red-400" />
            <span className="text-sm font-semibold text-red-300">SDI Alerts ({eqcAlerts})</span>
          </div>
          <div className="space-y-2">
            {eqcComps.filter(e => e.sdi != null && Math.abs(e.sdi) > 2.0).slice(0, 5).map(e => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{e.analyte_name} — {e.program_name} ({e.comparison_period})</span>
                <span className={`font-mono font-bold ${Math.abs(e.sdi) > 3 ? 'text-red-400' : 'text-amber-400'}`}>
                  SDI {e.sdi.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to: '/performance/carryover', label: 'New Carryover Study', icon: Droplets, color: 'border-cyan-800 hover:border-cyan-600' },
          { to: '/performance/precision', label: 'New Precision Study', icon: Target, color: 'border-purple-800 hover:border-purple-600' },
          { to: '/performance/pt', label: 'New PT Event', icon: ClipboardCheck, color: 'border-orange-800 hover:border-orange-600' },
          { to: '/performance/eqc', label: 'Add Peer Comparison', icon: Users, color: 'border-blue-800 hover:border-blue-600' },
        ].map(item => (
          <NavLink key={item.to} to={item.to}
            className={`flex flex-col items-center gap-2 p-4 bg-gray-900 border ${item.color} rounded-xl text-center transition-colors group`}>
            <item.icon size={20} className="text-gray-400 group-hover:text-gray-200 transition-colors" />
            <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  )
}
