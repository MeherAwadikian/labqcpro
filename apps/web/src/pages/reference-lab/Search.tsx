import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../../lib/api'
import {
  Search, Filter, BookOpen, ExternalLink, CheckCircle2, Plus, X,
  BarChart3, AlertTriangle, Info, Bookmark, BookmarkCheck, ChevronDown, ChevronUp,
  Loader2, RefreshCw,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type RIEntry = {
  id: string
  analyte_name: string
  analyte_aliases: string
  population_group: string
  age_min: number | null
  age_max: number | null
  sex: string
  lower_limit: number | null
  upper_limit: number | null
  unit: string
  percentile_used: string
  one_sided: number
  source_name: string
  source_type: string
  publication_year: number | null
  doi_or_url: string
  free_access: number
  instrument_platform: string
  method: string
  fasting_required: number
  sample_type: string
  notes: string
  partition_notes: string
  region: string
}

type Filters = {
  population: string
  sex: string
  source_type: string
  sample_type: string
  fasting: string
  free_access: boolean
  year_min: string
  region: string
}

const DEFAULT_FILTERS: Filters = {
  population: 'all', sex: 'all', source_type: 'all',
  sample_type: 'all', fasting: 'all', free_access: false,
  year_min: '2000', region: 'all',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SOURCE_COLORS: Record<string, string> = {
  guideline:    'bg-blue-900/30 text-blue-300 border-blue-700',
  consensus:    'bg-purple-900/30 text-purple-300 border-purple-700',
  manufacturer: 'bg-amber-900/30 text-amber-300 border-amber-700',
  study:        'bg-green-900/30 text-green-300 border-green-700',
}

const POP_BADGE: Record<string, string> = {
  adult:     'text-gray-300',
  pediatric: 'text-cyan-300',
  neonatal:  'text-pink-300',
  geriatric: 'text-orange-300',
  pregnant:  'text-violet-300',
}

function formatRI(entry: RIEntry): string {
  if (entry.one_sided) {
    if (entry.lower_limit == null) return `< ${entry.upper_limit} ${entry.unit}`
    return `> ${entry.lower_limit} ${entry.unit}`
  }
  const lo = entry.lower_limit ?? '—'
  const hi = entry.upper_limit ?? '—'
  return `${lo} – ${hi} ${entry.unit}`
}

function ageLabel(entry: RIEntry): string {
  if (entry.age_min == null && entry.age_max == null) return ''
  if (entry.age_min == null) return `≤ ${entry.age_max}y`
  if (entry.age_max == null) return `≥ ${entry.age_min}y`
  const minY = entry.age_min < 1 ? `${Math.round(entry.age_min * 12)}mo` : `${entry.age_min}y`
  const maxY = entry.age_max < 1 ? `${Math.round(entry.age_max * 12)}mo` : `${entry.age_max}y`
  return `${minY} – ${maxY}`
}

const FASTING_LABEL = ['No fast', 'Fasting required', '']

// ─── Comparison Logic ─────────────────────────────────────────────────────────
function buildCommentary(items: RIEntry[], labLower?: number, labUpper?: number): string[] {
  const msgs: string[] = []
  const uppers = items.map(i => i.upper_limit).filter(v => v != null) as number[]
  const lowers = items.map(i => i.lower_limit).filter(v => v != null) as number[]

  if (uppers.length < 2) return []

  const medianUpper = [...uppers].sort((a, b) => a - b)[Math.floor(uppers.length / 2)]
  const maxDevUpper = Math.max(...uppers.map(u => Math.abs(u - medianUpper) / medianUpper * 100))

  if (maxDevUpper <= 10)
    msgs.push('✅ Good consensus among selected sources — upper limits within ±10% of each other.')
  else if (maxDevUpper <= 25)
    msgs.push('⚠️ Moderate variation between sources. Consider platform and population differences.')
  else
    msgs.push('❌ Significant variation (>25%) between upper limits. Verify platform-specific and population-specific factors.')

  if (lowers.length >= 2) {
    const medianLower = [...lowers].sort((a, b) => a - b)[Math.floor(lowers.length / 2)]
    const maxDevLower = Math.max(...lowers.map(l => Math.abs(l - medianLower) / medianLower * 100))
    if (maxDevLower > 15)
      msgs.push('⚠️ Lower limit variation >15% between sources. Check whether exclusion criteria or population mix differ.')
  }

  if (labUpper != null) {
    const consensusUpper = Math.min(...uppers)
    const pctAbove = (labUpper - consensusUpper) / consensusUpper * 100
    if (pctAbove > 10)
      msgs.push(`⚠️ Your upper limit (${labUpper}) exceeds all published sources by >10%. Consider reviewing outlier detection or instrument calibration.`)
    else if (Math.abs(pctAbove) <= 5)
      msgs.push(`✅ Your upper limit agrees with published consensus (within ±5%).`)
  }

  if (labLower != null && lowers.length > 0) {
    const consensusLower = Math.min(...lowers)
    const pctBelow = (consensusLower - labLower) / consensusLower * 100
    if (pctBelow > 10)
      msgs.push(`⚠️ Your lower limit (${labLower}) is wider than published values by >10%. Check exclusion criteria and population representativeness.`)
  }

  return msgs
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function RICard({
  entry, selected, onSelect, saved, onSave, onUnsave,
}: {
  entry: RIEntry
  selected: boolean
  onSelect: () => void
  saved: boolean
  onSave: () => void
  onUnsave: () => void
}) {
  const [showNotes, setShowNotes] = useState(false)
  const hasWarning = entry.notes.startsWith('⚠️') || entry.notes.startsWith('📌')

  return (
    <div className={`bg-gray-900 border rounded-xl p-4 space-y-3 transition-all ${
      selected ? 'border-brand-500 ring-1 ring-brand-500/30' : 'border-gray-800 hover:border-gray-700'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white text-sm leading-tight">{entry.analyte_name}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            <span className={`text-xs capitalize ${POP_BADGE[entry.population_group] ?? 'text-gray-400'}`}>
              {entry.population_group}
            </span>
            {entry.sex !== 'both' && (
              <span className="text-xs text-gray-500 capitalize">· {entry.sex}</span>
            )}
            {ageLabel(entry) && (
              <span className="text-xs text-gray-500">· {ageLabel(entry)}</span>
            )}
          </div>
        </div>
        <button
          onClick={onSelect}
          className={`flex-shrink-0 w-5 h-5 rounded border-2 transition-colors ${
            selected ? 'bg-brand-500 border-brand-500' : 'border-gray-600 hover:border-brand-400'
          }`}
          title="Select for comparison"
        >
          {selected && <CheckCircle2 size={12} className="text-white m-auto" />}
        </button>
      </div>

      {/* RI Value */}
      <div className="text-xl font-bold text-brand-300">{formatRI(entry)}</div>
      <div className="text-xs text-gray-500">{entry.percentile_used}th percentile</div>

      {/* Meta */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className={`px-2 py-0.5 rounded-full border ${SOURCE_COLORS[entry.source_type] ?? 'text-gray-400 border-gray-700'}`}>
          {entry.source_type}
        </span>
        <span className="text-gray-500 capitalize">{entry.sample_type.replace('_', ' ')}</span>
        {entry.fasting_required !== 2 && (
          <span className="text-gray-500">{FASTING_LABEL[entry.fasting_required]}</span>
        )}
        {entry.free_access === 1 && (
          <span className="text-green-600 font-medium">Free access</span>
        )}
      </div>

      {/* Source */}
      <div className="text-xs text-gray-500 leading-relaxed">
        {entry.source_name} {entry.publication_year ? `(${entry.publication_year})` : ''} · {entry.region.toUpperCase()}
      </div>

      {/* Platform note */}
      {entry.instrument_platform && (
        <div className="text-xs text-amber-400">Platform: {entry.instrument_platform}</div>
      )}

      {/* Partition note */}
      {entry.partition_notes && (
        <div className="text-xs text-gray-500 italic">{entry.partition_notes}</div>
      )}

      {/* Warning / Notes toggle */}
      {entry.notes && (
        <div>
          <button
            onClick={() => setShowNotes(v => !v)}
            className={`flex items-center gap-1 text-xs ${hasWarning ? 'text-amber-400' : 'text-gray-500'} hover:text-gray-300`}
          >
            {hasWarning ? <AlertTriangle size={11} /> : <Info size={11} />}
            {showNotes ? 'Hide notes' : 'Show notes'}
            {showNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {showNotes && (
            <div className="mt-1 text-xs text-gray-400 leading-relaxed bg-gray-800 rounded p-2">
              {entry.notes}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-800">
        <button
          onClick={saved ? onUnsave : onSave}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
            saved
              ? 'text-brand-400 bg-brand-900/20 hover:bg-red-900/20 hover:text-red-400'
              : 'text-gray-400 hover:text-brand-300 hover:bg-gray-800'
          }`}
        >
          {saved ? <BookmarkCheck size={12} /> : <Plus size={12} />}
          {saved ? 'Saved' : 'Save to library'}
        </button>

        {entry.doi_or_url && (
          <a
            href={entry.doi_or_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-200 transition-colors"
          >
            <ExternalLink size={11} /> Source
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Comparison Panel ─────────────────────────────────────────────────────────
function ComparisonPanel({
  items, onClose,
}: {
  items: RIEntry[]
  onClose: () => void
}) {
  const [labLower, setLabLower] = useState('')
  const [labUpper, setLabUpper] = useState('')

  const allItems = useMemo(() => {
    const base = [...items]
    const lo = parseFloat(labLower)
    const hi = parseFloat(labUpper)
    if (!isNaN(hi)) {
      base.unshift({
        id: '__lab',
        analyte_name: 'Your Lab RI',
        analyte_aliases: '',
        population_group: '',
        age_min: null, age_max: null, sex: 'both',
        lower_limit: isNaN(lo) ? null : lo,
        upper_limit: hi,
        unit: items[0]?.unit ?? '',
        percentile_used: '95', one_sided: 0,
        source_name: 'Your Laboratory',
        source_type: 'study', publication_year: null,
        doi_or_url: '', free_access: 0,
        instrument_platform: '', method: '',
        fasting_required: 2, sample_type: items[0]?.sample_type ?? '',
        notes: '', partition_notes: '', region: 'local',
      } as RIEntry)
    }
    return base
  }, [items, labLower, labUpper])

  const uppers = allItems.map(i => i.upper_limit).filter(v => v != null) as number[]
  const lowers = allItems.map(i => i.lower_limit).filter(v => v != null) as number[]

  const axisMin = lowers.length ? Math.min(...lowers) * 0.9 : 0
  const axisMax = uppers.length ? Math.max(...uppers) * 1.1 : 1
  const axisRange = axisMax - axisMin || 1

  const commentary = buildCommentary(
    items,
    parseFloat(labLower) || undefined,
    parseFloat(labUpper) || undefined,
  )

  const BAR_COLORS = [
    'bg-brand-500', 'bg-blue-500', 'bg-green-500', 'bg-amber-500',
    'bg-purple-500', 'bg-pink-500', 'bg-cyan-500', 'bg-orange-500',
  ]

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <BarChart3 size={16} className="text-brand-400" />
            Compare: {items[0]?.analyte_name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Optional lab RI entry */}
          <div className="bg-gray-800 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-gray-400">Optional: Enter your lab's RI to compare</div>
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="text-xs text-gray-500 mb-1">Lower limit</div>
                <input
                  value={labLower}
                  onChange={e => setLabLower(e.target.value)}
                  placeholder="e.g. 136"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div className="flex-1">
                <div className="text-xs text-gray-500 mb-1">Upper limit ({items[0]?.unit})</div>
                <input
                  value={labUpper}
                  onChange={e => setLabUpper(e.target.value)}
                  placeholder="e.g. 145"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 pr-4">Source</th>
                  <th className="text-right py-2 px-2">Lower</th>
                  <th className="text-right py-2 px-2">Upper</th>
                  <th className="text-left py-2 px-2">Unit</th>
                  <th className="text-left py-2 pl-2">Year / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {allItems.map((item, i) => (
                  <tr key={item.id} className={item.id === '__lab' ? 'font-semibold text-brand-300' : 'text-gray-300'}>
                    <td className="py-2 pr-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${BAR_COLORS[i % BAR_COLORS.length]}`} />
                        {item.source_name}
                      </div>
                    </td>
                    <td className="text-right py-2 px-2">{item.lower_limit ?? '—'}</td>
                    <td className="text-right py-2 px-2">{item.upper_limit ?? '—'}</td>
                    <td className="py-2 px-2 text-gray-400">{item.unit}</td>
                    <td className="py-2 pl-2 text-xs text-gray-500">
                      {item.publication_year ?? ''} {item.partition_notes ? `· ${item.partition_notes}` : ''}
                    </td>
                  </tr>
                ))}
                {lowers.length > 0 && uppers.length > 0 && (
                  <tr className="text-gray-400 text-xs border-t-2 border-gray-700">
                    <td className="py-2 pr-4 italic">Consensus zone</td>
                    <td className="text-right py-2 px-2">{Math.max(...lowers)}</td>
                    <td className="text-right py-2 px-2">{Math.min(...uppers)}</td>
                    <td className="py-2 px-2 text-gray-500">{items[0]?.unit}</td>
                    <td className="py-2 pl-2 text-gray-600">(overlap of all)</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Visual bar chart */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-400 mb-3">Visual range comparison</div>
            {allItems.map((item, i) => {
              const lo = item.lower_limit ?? axisMin
              const hi = item.upper_limit ?? axisMax
              const leftPct = ((lo - axisMin) / axisRange) * 100
              const widthPct = ((hi - lo) / axisRange) * 100
              return (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="w-36 text-xs text-gray-400 truncate flex-shrink-0 text-right">
                    {item.id === '__lab' ? 'Your Lab' : item.source_name.split('/')[0].trim()}
                  </div>
                  <div className="flex-1 h-5 bg-gray-800 rounded relative">
                    <div
                      className={`absolute h-full rounded ${BAR_COLORS[i % BAR_COLORS.length]} opacity-70`}
                      style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 1)}%` }}
                    />
                  </div>
                  <div className="w-24 text-xs text-gray-500 flex-shrink-0">
                    {item.lower_limit ?? ''}{item.lower_limit != null && item.upper_limit != null ? '–' : ''}{item.upper_limit ?? ''}
                  </div>
                </div>
              )
            })}

            {/* Consensus zone overlay marker */}
            {lowers.length > 0 && uppers.length > 0 && Math.max(...lowers) < Math.min(...uppers) && (
              <div className="flex items-center gap-3 mt-1">
                <div className="w-36 text-xs text-green-400 text-right">Consensus</div>
                <div className="flex-1 h-5 bg-gray-800 rounded relative">
                  <div
                    className="absolute h-full rounded bg-green-500/40 border border-green-600"
                    style={{
                      left: `${((Math.max(...lowers) - axisMin) / axisRange) * 100}%`,
                      width: `${((Math.min(...uppers) - Math.max(...lowers)) / axisRange) * 100}%`,
                    }}
                  />
                </div>
                <div className="w-24 text-xs text-green-400">
                  {Math.max(...lowers)}–{Math.min(...uppers)}
                </div>
              </div>
            )}

            {/* Axis labels */}
            <div className="flex items-center gap-3">
              <div className="w-36" />
              <div className="flex-1 flex justify-between text-xs text-gray-600">
                <span>{axisMin.toFixed(1)}</span>
                <span>{((axisMin + axisMax) / 2).toFixed(1)}</span>
                <span>{axisMax.toFixed(1)}</span>
              </div>
              <div className="w-24" />
            </div>
          </div>

          {/* Rule-based commentary */}
          {commentary.length > 0 && (
            <div className="space-y-2">
              {commentary.map((msg, i) => (
                <div key={i} className={`text-sm rounded-lg px-3 py-2 ${
                  msg.startsWith('✅') ? 'bg-green-900/20 text-green-300' :
                  msg.startsWith('⚠️') ? 'bg-amber-900/20 text-amber-300' :
                  'bg-red-900/20 text-red-300'
                }`}>
                  {msg}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Live Search Links ────────────────────────────────────────────────────────
function LiveSearchLinks({ query }: { query: string }) {
  const q = encodeURIComponent(query || 'reference interval')
  const qFull = encodeURIComponent(`${query} reference interval establishment CLSI`)

  const links = [
    { label: 'PubMed', url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query + ' reference interval establishment')}`, note: 'Best for peer-reviewed RI studies' },
    { label: 'Google Scholar', url: `https://scholar.google.com/scholar?q=${qFull}`, note: 'Broad academic search' },
    { label: 'Westgard QC', url: `https://www.westgard.com/search/?q=${q}+reference+interval`, note: 'QC-focused articles' },
    { label: 'CLSI Standards', url: 'https://clsi.org/standards/products/method-evaluation/', note: 'EP28-A3c is the RI guideline' },
    { label: 'CDC / NHANES', url: 'https://www.cdc.gov/nchs/nhanes/index.htm', note: 'Free US population reference data' },
    { label: 'WHO Publications', url: 'https://www.who.int/publications/m/item/laboratory-reference-ranges', note: 'Global reference ranges' },
    { label: 'CAP Resources', url: 'https://www.cap.org/laboratory-improvement', note: 'Accreditation & laboratory improvement' },
  ]

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <ExternalLink size={14} className="text-brand-400" />
        Search in Public Databases
      </h3>
      <p className="text-xs text-gray-500">
        These links open authoritative free sources in a new tab. PubMed has the largest
        collection of peer-reviewed RI studies — search &ldquo;{query || '[analyte]'} reference interval
        establishment&rdquo; for the most relevant results.
      </p>
      <div className="flex flex-wrap gap-2">
        {links.map(l => (
          <a
            key={l.label}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            title={l.note}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs text-gray-300 hover:text-white transition-colors"
          >
            {l.label} <ExternalLink size={10} />
          </a>
        ))}
      </div>
    </div>
  )
}

// ─── Regulatory Citations Panel ───────────────────────────────────────────────
function RegulatoryPanel() {
  const [open, setOpen] = useState(false)

  const resources = [
    { label: 'CLSI EP28-A3c — Defining, Establishing & Verifying RIs', url: 'https://clsi.org/standards/products/method-evaluation/documents/ep28/', note: 'Min 120 subjects for de novo RI; 20 samples for transference verification.' },
    { label: 'APHL Verification & Validation Toolkit (free PDF)', url: 'https://stacks.cdc.gov/view/cdc/153395', note: 'Practical free resource for US labs.' },
    { label: 'Westgard RI Articles (free)', url: 'https://www.westgard.com/essays.htm', note: 'Multiple free articles on RI theory and practice.' },
    { label: 'PubMed — EP28 Implementation Studies', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=EP28+reference+interval+verification', note: 'Hundreds of free peer-reviewed studies.' },
    { label: 'NHANES Laboratory Reference Ranges', url: 'https://www.cdc.gov/nchs/nhanes/', note: 'Free US population-based data.' },
    { label: 'WHO Laboratory Manual 5th Ed (free PDF)', url: 'https://www.who.int/reproductivehealth/publications/infertility/9789241548120/en/', note: 'Covers CBC and basic chemistry reference ranges.' },
  ]

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
      >
        <span className="flex items-center gap-2">
          <BookOpen size={14} className="text-brand-400" />
          Free Regulatory Resources & Citations
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-3 border-t border-gray-800">
          <div className="pt-3 text-xs text-amber-300 bg-amber-900/10 rounded-lg px-3 py-2 border border-amber-800">
            Per CLSI EP28-A3c: minimum 120 healthy subjects for de novo RI establishment;
            20 samples for transference verification. Always verify against your own lab's population.
          </div>
          {resources.map(r => (
            <div key={r.label} className="flex items-start gap-3">
              <span className="text-brand-400 mt-0.5 flex-shrink-0">📄</span>
              <div>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  {r.label} <ExternalLink size={10} />
                </a>
                <p className="text-xs text-gray-500 mt-0.5">{r.note}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReferenceSearch() {
  const [query, setQuery]           = useState('')
  const [filters, setFilters]       = useState<Filters>(DEFAULT_FILTERS)
  const [results, setResults]       = useState<RIEntry[]>([])
  const [loading, setLoading]       = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds]     = useState<Set<string>>(new Set())
  const [comparing, setComparing]   = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [savingId, setSavingId]     = useState<string | null>(null)

  const fetchResults = useCallback(async (q: string, f: Filters) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ q })
      if (f.population !== 'all') params.set('population', f.population)
      if (f.sex !== 'all') params.set('sex', f.sex)
      if (f.source_type !== 'all') params.set('source_type', f.source_type)
      if (f.sample_type !== 'all') params.set('sample_type', f.sample_type)
      if (f.fasting !== 'all') params.set('fasting', f.fasting)
      if (f.free_access) params.set('free_access', '1')
      if (f.year_min) params.set('year_min', f.year_min)
      if (f.region !== 'all') params.set('region', f.region)

      const data = await api.get<{ data: RIEntry[] }>(`/reference-lab/search?${params}`)
      setResults((data as any).data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  // Load saved library IDs
  useEffect(() => {
    api.get<{ data: RIEntry[] }>('/reference-lab/library')
      .then((d: any) => setSavedIds(new Set((d.data ?? []).map((r: RIEntry) => r.id))))
      .catch(() => {})
  }, [])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchResults(query, filters), 400)
    return () => clearTimeout(t)
  }, [query, filters, fetchResults])

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const selectedItems = results.filter(r => selectedIds.has(r.id))

  async function saveRI(id: string) {
    setSavingId(id)
    try {
      await api.post('/reference-lab/library', { ri_id: id })
      setSavedIds(prev => new Set([...prev, id]))
    } finally { setSavingId(null) }
  }

  async function unsaveRI(id: string) {
    await api.delete(`/reference-lab/library/${id}`)
    setSavedIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  const setFilter = (key: keyof Filters, value: any) =>
    setFilters(prev => ({ ...prev, [key]: value }))

  const sel = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full'

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Search size={18} className="text-brand-400" />
          Reference Interval Library
        </h1>
        <button
          onClick={() => fetchResults(query, filters)}
          className="p-2 text-gray-500 hover:text-gray-300"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search analyte, e.g. Hemoglobin, TSH, Creatinine..."
          className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-4 py-3 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-600"
        />
      </div>

      {/* Comparison floating bar */}
      {selectedIds.size >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-brand-600 text-white rounded-full px-5 py-2.5 shadow-xl flex items-center gap-3 text-sm font-medium">
          <BarChart3 size={16} />
          {selectedIds.size} selected
          <button
            onClick={() => setComparing(true)}
            className="bg-white text-brand-700 rounded-full px-3 py-1 text-xs font-bold hover:bg-brand-50"
          >
            Compare
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-brand-200 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex gap-5">
        {/* Filters sidebar */}
        <div className="hidden lg:block w-52 flex-shrink-0">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4 sticky top-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Filters</span>
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="text-xs text-gray-600 hover:text-gray-300"
              >
                Reset
              </button>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Population</label>
              <select value={filters.population} onChange={e => setFilter('population', e.target.value)} className={sel}>
                <option value="all">All</option>
                <option value="adult">Adult</option>
                <option value="pediatric">Pediatric</option>
                <option value="neonatal">Neonatal</option>
                <option value="geriatric">Geriatric</option>
                <option value="pregnant">Pregnant</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Sex</label>
              <select value={filters.sex} onChange={e => setFilter('sex', e.target.value)} className={sel}>
                <option value="all">All</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="both">Not sex-specific</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Source type</label>
              <select value={filters.source_type} onChange={e => setFilter('source_type', e.target.value)} className={sel}>
                <option value="all">All</option>
                <option value="guideline">Guideline</option>
                <option value="consensus">Consensus</option>
                <option value="manufacturer">Manufacturer</option>
                <option value="study">Study</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Sample type</label>
              <select value={filters.sample_type} onChange={e => setFilter('sample_type', e.target.value)} className={sel}>
                <option value="all">All</option>
                <option value="serum">Serum</option>
                <option value="plasma">Plasma</option>
                <option value="whole_blood">Whole blood</option>
                <option value="urine">Urine</option>
                <option value="csf">CSF</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fasting</label>
              <select value={filters.fasting} onChange={e => setFilter('fasting', e.target.value)} className={sel}>
                <option value="all">All</option>
                <option value="yes">Required</option>
                <option value="no">Not required</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Region</label>
              <select value={filters.region} onChange={e => setFilter('region', e.target.value)} className={sel}>
                <option value="all">All</option>
                <option value="global">Global</option>
                <option value="USA">USA</option>
                <option value="EU">Europe</option>
                <option value="UK">UK</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Year from</label>
              <input
                type="number"
                value={filters.year_min}
                onChange={e => setFilter('year_min', e.target.value)}
                min="1990" max="2025" step="1"
                className={sel}
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.free_access}
                onChange={e => setFilter('free_access', e.target.checked)}
                className="rounded border-gray-600 bg-gray-800 text-brand-500"
              />
              <span className="text-xs text-gray-400">Free access only</span>
            </label>
          </div>
        </div>

        {/* Mobile filter toggle */}
        <div className="lg:hidden w-full">
          <button
            onClick={() => setFiltersOpen(v => !v)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-3"
          >
            <Filter size={14} /> Filters {filtersOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {/* Mobile filters inline — abbreviated */}
        </div>

        {/* Results */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Result count */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {loading ? (
                <span className="flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Searching…</span>
              ) : (
                `${results.length} result${results.length !== 1 ? 's' : ''}${query ? ` for "${query}"` : ''}`
              )}
            </div>
            {selectedIds.size > 0 && selectedIds.size < 2 && (
              <span className="text-xs text-gray-600">Select 1 more to compare</span>
            )}
          </div>

          {results.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-600">
              <Search size={32} className="mx-auto mb-3 opacity-30" />
              <div className="text-sm">No results found</div>
              <div className="text-xs mt-1">Try searching by analyte name or clearing filters</div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map(entry => (
              <RICard
                key={entry.id}
                entry={entry}
                selected={selectedIds.has(entry.id)}
                onSelect={() => toggleSelect(entry.id)}
                saved={savedIds.has(entry.id)}
                onSave={() => saveRI(entry.id)}
                onUnsave={() => unsaveRI(entry.id)}
              />
            ))}
          </div>

          {results.length > 0 && (
            <div className="pt-2">
              <LiveSearchLinks query={query} />
            </div>
          )}
        </div>
      </div>

      {/* No results — show links anyway */}
      {results.length === 0 && !loading && query && (
        <LiveSearchLinks query={query} />
      )}

      {/* Regulatory Panel */}
      <RegulatoryPanel />

      {/* Comparison modal */}
      {comparing && selectedItems.length >= 2 && (
        <ComparisonPanel
          items={selectedItems}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  )
}
