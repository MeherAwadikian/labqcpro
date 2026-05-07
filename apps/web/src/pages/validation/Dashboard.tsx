import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { Plus, TestTube2, Pipette, Activity, ArrowLeftRight, Trash2, ChevronRight, Clock, CheckCircle, XCircle, FileText } from 'lucide-react'

type Study = {
  id: string; title: string; study_type: string; analyte_name: string | null
  status: string; start_date: string; end_date: string | null; conclusion: string
}

const STUDY_TYPES = [
  { type: 'reagent_lot',        label: 'Reagent Lot Validation',  icon: TestTube2,      color: 'text-blue-400',   desc: 'CLSI EP26 — Compare new vs current reagent lots' },
  { type: 'calibrator_lot',     label: 'Calibrator Lot Validation', icon: Pipette,       color: 'text-violet-400', desc: 'CLIA 493.1255 — Verify new calibrator lot performance' },
  { type: 'new_instrument',     label: 'New Instrument Validation', icon: Activity,      color: 'text-green-400',  desc: 'CLSI EP15 + EP9 — Commission new analyzer (4 phases)' },
  { type: 'method_comparison',  label: 'Method Comparison Study',  icon: ArrowLeftRight, color: 'text-orange-400', desc: 'CLSI EP9 — Compare two methods or instruments' },
]

const STATUS_BADGE: Record<string, string> = {
  draft:       'bg-gray-800 text-gray-400',
  in_progress: 'bg-blue-900/40 text-blue-400',
  complete:    'bg-green-900/40 text-green-400',
  approved:    'bg-emerald-900/40 text-emerald-400',
}

const ROUTE: Record<string, string> = {
  reagent_lot:       '/validation/reagent-lot',
  calibrator_lot:    '/validation/calibrator-lot',
  new_instrument:    '/validation/new-instrument',
  method_comparison: '/validation/method-comparison',
}

export default function ValidationDashboard() {
  const [studies, setStudies] = useState<Study[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.get<Study[]>('/validation').then(setStudies).finally(() => setLoading(false))
  }, [])

  async function deleteStudy(id: string) {
    if (!confirm('Delete this study permanently?')) return
    await api.delete(`/validation/${id}`)
    setStudies(s => s.filter(x => x.id !== id))
  }

  const active    = studies.filter(s => s.status === 'in_progress').length
  const completed = studies.filter(s => ['complete','approved'].includes(s.status)).length
  const pending   = studies.filter(s => s.status === 'complete').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Validation Studies</h1>
          <p className="text-sm text-gray-400 mt-0.5">CLIA · CAP · CLSI compliance validation</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> New Study
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'In Progress', value: active,    icon: Clock,         color: 'text-blue-400' },
          { label: 'Completed',   value: completed,  icon: CheckCircle,   color: 'text-green-400' },
          { label: 'Pending Approval', value: pending, icon: FileText,    color: 'text-yellow-400' },
        ].map(card => (
          <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
            <card.icon size={28} className={card.color} />
            <div>
              <div className="text-2xl font-bold text-white">{card.value}</div>
              <div className="text-xs text-gray-400">{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Studies table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h2 className="font-semibold text-white text-sm">All Studies</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
        ) : studies.length === 0 ? (
          <div className="p-12 text-center">
            <TestTube2 size={32} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No validation studies yet. Create your first one.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                <th className="text-left px-4 py-2">Study</th>
                <th className="text-left px-4 py-2 hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-2 hidden md:table-cell">Analyte</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2 hidden lg:table-cell">Started</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {studies.map(study => (
                <tr key={study.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-gray-100 font-medium">{study.title}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-400">
                    {STUDY_TYPES.find(t => t.type === study.study_type)?.label ?? study.study_type}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-400">
                    {study.analyte_name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[study.status] ?? STATUS_BADGE.draft}`}>
                      {study.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-400">
                    {new Date(study.start_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => navigate(`${ROUTE[study.study_type]}?id=${study.id}`)}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
                        title="Open study"
                      >
                        <ChevronRight size={15} />
                      </button>
                      <button
                        onClick={() => deleteStudy(study.id)}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New study modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-bold text-white mb-4">Select Study Type</h2>
            <div className="space-y-3">
              {STUDY_TYPES.map(({ type, label, icon: Icon, color, desc }) => (
                <button
                  key={type}
                  onClick={() => { setShowModal(false); navigate(ROUTE[type]) }}
                  className="w-full flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 rounded-xl text-left transition-colors group"
                >
                  <Icon size={22} className={color} />
                  <div>
                    <div className="font-medium text-white text-sm group-hover:text-white">{label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
                  </div>
                  <ChevronRight size={16} className="ml-auto text-gray-600 group-hover:text-gray-400" />
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowModal(false)}
              className="mt-4 w-full text-sm text-gray-500 hover:text-gray-300 py-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
