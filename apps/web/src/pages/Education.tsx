import { Card, PageHeader, Badge } from '../components/ui'

const westgardRules = [
  { rule: '1₂s', type: 'Warning', color: 'warning', desc: 'One control exceeds Mean ± 2SD. Warning only — investigate but do not reject.', trigger: 'Single value outside ±2SD' },
  { rule: '1₃s', type: 'Reject', color: 'danger', desc: 'One control exceeds Mean ± 3SD. Random error. Reject the run immediately.', trigger: 'Single value outside ±3SD' },
  { rule: '2₂s', type: 'Reject', color: 'danger', desc: 'Two consecutive controls both exceed the same ±2SD limit. Systematic error.', trigger: '2 consecutive values same side of ±2SD' },
  { rule: 'R₄s', type: 'Reject', color: 'danger', desc: 'Range between two consecutive controls exceeds 4SD. Random error.', trigger: 'Two consecutive values differ by >4SD' },
  { rule: '4₁s', type: 'Reject', color: 'danger', desc: 'Four consecutive controls all exceed ±1SD on the same side. Systematic shift.', trigger: '4 consecutive values same side of ±1SD' },
  { rule: '10x',  type: 'Reject', color: 'danger', desc: 'Ten consecutive controls all fall on the same side of the mean. Systematic trend/shift.', trigger: '10 consecutive values same side of mean' },
]

const concepts = [
  {
    title: 'Total Allowable Error (TEa)',
    body: 'The maximum error in a result that can be tolerated. Set by CLIA proficiency testing criteria or CAP surveys. If your sigma metric < 6, your QC design may not adequately detect errors within TEa.',
  },
  {
    title: 'Sigma Metrics',
    body: 'σ = (TEa − Bias) / CV. If σ ≥ 6: minimal QC needed (1 level, once daily). If σ = 4–6: 2 levels, Westgard rules. If σ < 4: intensive QC, investigate method performance.',
  },
  {
    title: 'Coefficient of Variation (CV)',
    body: 'CV% = (SD / Mean) × 100. Measures imprecision. Typical acceptable CVs: <2% chemistry analyzers, <5% immunoassay, <3% hematology. Higher CV = more imprecision = higher chance of false QC failures.',
  },
  {
    title: 'IQCP vs Default CLIA QC',
    body: 'Default CLIA: 2 controls/day for most tests. IQCP allows custom QC based on risk assessment — you can reduce QC if risk is demonstrably low, or increase QC for high-risk tests. Must be reviewed annually.',
  },
  {
    title: 'Control Chart Zones',
    body: 'Zone A (±1SD): ~68% of values. Zone B (±2SD): ~95% of values. Zone C (±3SD): ~99.7% of values. Values in Zone C or beyond indicate loss of statistical control and require investigation.',
  },
  {
    title: 'Systematic vs Random Error',
    body: 'Systematic error: all values shift in one direction (calibration drift, reagent deterioration). Detected by 4₁s, 10x rules. Random error: unpredictable scatter. Detected by 1₃s, R₄s rules.',
  },
]

export default function Education() {
  return (
    <div>
      <PageHeader title="Education Hub" subtitle="Learn Westgard rules, QC concepts, and IQCP principles" />

      <div className="space-y-8">
        {/* Westgard rules */}
        <div>
          <h2 className="text-base font-semibold text-white mb-4">Westgard Rules Reference</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {westgardRules.map(r => (
              <Card key={r.rule} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center font-bold text-brand-300 text-sm">
                    {r.rule}
                  </div>
                  <Badge variant={r.color as any}>{r.type}</Badge>
                </div>
                <p className="text-sm text-gray-300">{r.desc}</p>
                <div className="bg-gray-800/50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500 font-medium">Trigger condition:</p>
                  <p className="text-xs text-gray-400 mt-0.5">{r.trigger}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Key concepts */}
        <div>
          <h2 className="text-base font-semibold text-white mb-4">Key QC Concepts</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {concepts.map(c => (
              <Card key={c.title}>
                <h3 className="font-semibold text-brand-300 mb-2 text-sm">{c.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{c.body}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Decision tree */}
        <Card>
          <h2 className="text-base font-semibold text-white mb-4">QC Failure Response Flowchart</h2>
          <div className="space-y-3">
            {[
              { step: '1', label: 'QC value outside limits', color: 'bg-red-500' },
              { step: '2', label: 'Identify which Westgard rule triggered', color: 'bg-orange-500' },
              { step: '3', label: 'Random error (1₃s, R₄s) → Repeat QC with fresh control', color: 'bg-amber-500' },
              { step: '4', label: 'Systematic error (4₁s, 10x) → Check calibration, reagents, instrument', color: 'bg-yellow-600' },
              { step: '5', label: 'Document investigation findings', color: 'bg-blue-500' },
              { step: '6', label: 'Re-run QC after corrective action', color: 'bg-purple-500' },
              { step: '7', label: 'If QC passes → resume patient testing', color: 'bg-green-500' },
              { step: '8', label: 'If QC still fails → hold patient results, escalate to supervisor', color: 'bg-red-700' },
            ].map(s => (
              <div key={s.step} className="flex items-start gap-3">
                <div className={`${s.color} text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  {s.step}
                </div>
                <p className="text-sm text-gray-300">{s.label}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
