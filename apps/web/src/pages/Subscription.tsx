import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import {
  CheckCircle2, Copy, Check, Loader2, Wallet, ShieldCheck,
  AlertTriangle, Clock, ExternalLink, RefreshCw,
} from 'lucide-react'

const inp = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'
const lbl = 'text-xs text-gray-400 mb-1 block'

type SubStatus = {
  status: string; trial_end: string; paid_until: string | null
  days_left: number; is_active: boolean; updated_at: string
}
type Payment = {
  id: string; plan: string; amount_usdt: number; tx_hash?: string; status: string; created_at: string
}
type PlanInfo = {
  wallet: string; network: string; token: string
  plans: { key: string; label: string; amount_usdt: number; days: number }[]
}

const FEATURES = [
  'Unlimited QC runs & analytes',
  'All Westgard rules (6 rules)',
  'Levey-Jennings charts',
  'AI lab assistant (Claude AI)',
  'IQCP & compliance module',
  'Validation Studies module',
  'Performance & EQC module',
  'Proficiency Testing tracking',
  'CAP standards library',
  'Reagent & calibrator tracking',
  'Peer comparison & SDI analysis',
  'PDF reports',
  'Team management (multi-user)',
  'Cloudflare global edge (99.9% uptime)',
]

export default function Subscription() {
  const [sub, setSub]         = useState<SubStatus | null>(null)
  const [info, setInfo]       = useState<PlanInfo | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSP] = useState<string>('monthly')
  const [txHash, setTxHash]   = useState('')
  const [verifying, setVerif] = useState(false)
  const [result, setResult]   = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<{ data: SubStatus }>('/subscription/status').catch(() => ({ data: null })),
      api.get<PlanInfo>('/subscription/info'),
      api.get<{ data: Payment[] }>('/subscription/payments').catch(() => ({ data: [] })),
    ]).then(([s, i, p]) => {
      if ((s as any).data) setSub((s as any).data)
      setInfo(i as any)
      setPayments((p as any).data ?? [])
    }).finally(() => setLoading(false))
  }, [])

  async function reload() {
    const [s, p] = await Promise.all([
      api.get<{ data: SubStatus }>('/subscription/status').catch(() => ({ data: null })),
      api.get<{ data: Payment[] }>('/subscription/payments').catch(() => ({ data: [] })),
    ])
    if ((s as any).data) setSub((s as any).data)
    setPayments((p as any).data ?? [])
  }

  async function verifyPayment() {
    if (!txHash.trim() || !selectedPlan) return
    setVerif(true); setResult(null)
    try {
      const r = await api.post<{
        ok: boolean; plan: string; amount_usdt: number; paid_until: string; days_added: number
      }>('/subscription/verify-payment', { plan: selectedPlan, tx_hash: txHash.trim() })
      setResult({
        ok: true,
        text: `✓ Payment verified! ${r.plan} plan activated — ${r.days_added} days added. Paid until ${new Date(r.paid_until).toLocaleDateString()}.`,
      })
      setTxHash('')
      reload()
    } catch (e: any) {
      setResult({ ok: false, text: e.message })
    }
    finally { setVerif(false) }
  }

  function copyAddress() {
    if (!info) return
    navigator.clipboard.writeText(info.wallet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const selectedPlanData = info?.plans.find(p => p.key === selectedPlan)
  const qrUrl = info
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(info.wallet)}&bgcolor=111827&color=7C3AED&margin=10`
    : ''

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-brand-400" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Subscription</h1>
        <button onClick={reload} className="p-2 text-gray-500 hover:text-gray-300 transition-colors">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Current status */}
      {sub && (
        <div className={`rounded-xl p-4 border ${sub.is_active ? 'bg-green-900/20 border-green-800' : 'bg-red-900/20 border-red-800'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {sub.is_active
                ? <ShieldCheck size={20} className="text-green-400" />
                : <AlertTriangle size={20} className="text-red-400" />}
              <div>
                <div className="font-semibold text-white capitalize">
                  {sub.status === 'trial' ? 'Trial Period' : sub.status === 'active' ? 'Active Subscription' : 'Expired'}
                </div>
                <div className="text-sm text-gray-400">
                  {sub.paid_until
                    ? `Paid until ${new Date(sub.paid_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
                    : sub.status === 'trial'
                    ? `Trial ends ${new Date(sub.trial_end).toLocaleDateString()}`
                    : 'No active subscription'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold ${sub.days_left < 7 ? 'text-red-400' : 'text-green-400'}`}>
                {sub.days_left}
              </div>
              <div className="text-xs text-gray-500">days left</div>
            </div>
          </div>
          {!sub.is_active && (
            <p className="mt-3 text-sm text-red-300">
              Your access has expired. Verify a payment below to reactivate.
            </p>
          )}
        </div>
      )}

      {/* Plan selection */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Wallet size={15} className="text-brand-400" /> Choose a Plan
        </h2>

        <div className="grid grid-cols-2 gap-3">
          {info?.plans.map(plan => (
            <button
              key={plan.key}
              onClick={() => setSP(plan.key)}
              className={`relative text-left p-4 rounded-xl border-2 transition-colors ${
                selectedPlan === plan.key
                  ? 'border-brand-500 bg-brand-900/20'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              {plan.key === 'yearly' && (
                <span className="absolute -top-2 right-3 text-xs bg-green-700 text-white px-2 py-0.5 rounded-full">
                  Save 28%
                </span>
              )}
              <div className="font-semibold text-white">{plan.label}</div>
              <div className="text-2xl font-bold text-brand-300 mt-1">
                ${plan.amount_usdt}
                <span className="text-sm text-gray-500 font-normal"> USDT</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">{plan.days} days access</div>
              {selectedPlan === plan.key && (
                <div className="absolute top-3 right-3">
                  <CheckCircle2 size={16} className="text-brand-400" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Payment instructions */}
      {info && selectedPlanData && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
          <h2 className="text-sm font-semibold text-white">Payment Instructions</h2>

          <div className="flex flex-col sm:flex-row gap-5 items-start">
            {/* QR Code */}
            <div className="flex-shrink-0 mx-auto sm:mx-0">
              <img
                src={qrUrl}
                alt="Wallet QR Code"
                className="rounded-lg border border-gray-700"
                width={180}
                height={180}
              />
            </div>

            {/* Instructions */}
            <div className="flex-1 space-y-3 min-w-0">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Network</div>
                  <div className="text-gray-200 font-medium">{info.network}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Token</div>
                  <div className="text-gray-200 font-medium">{info.token}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-gray-500 mb-1">Amount to Send</div>
                  <div className="text-xl font-bold text-brand-300">
                    {selectedPlanData.amount_usdt}.00 USDT
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Payment Address</div>
                <div className="flex items-center gap-2">
                  <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 font-mono text-xs text-gray-200 flex-1 break-all">
                    {info.wallet}
                  </div>
                  <button
                    onClick={copyAddress}
                    className="flex-shrink-0 p-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-brand-500 transition-colors"
                    title="Copy address"
                  >
                    {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
                  </button>
                </div>
              </div>

              <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-3 text-xs text-amber-300 space-y-1">
                <div className="font-semibold">Important:</div>
                <div>• Send <strong>only USDT on the Ethereum network</strong> (ERC-20)</div>
                <div>• Do NOT send on BNB Chain, Polygon, or Tron — funds will be lost</div>
                <div>• Send exactly the listed amount</div>
                <div>• Your subscription activates within minutes after 6 confirmations</div>
              </div>
            </div>
          </div>

          {/* Verify TX hash */}
          <div className="border-t border-gray-800 pt-4 space-y-3">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <CheckCircle2 size={14} className="text-brand-400" /> Verify Your Payment
            </h3>
            <p className="text-xs text-gray-500">
              After sending, paste your transaction hash below. Find it in your wallet app under "Transaction History".
            </p>
            <div>
              <label className={lbl}>Transaction Hash (0x...)</label>
              <input
                value={txHash}
                onChange={e => setTxHash(e.target.value)}
                placeholder="0x1234abcd..."
                className={`${inp} font-mono text-xs`}
              />
            </div>

            {result && (
              <div className={`rounded-lg px-4 py-3 text-sm border ${result.ok ? 'bg-green-900/30 border-green-700 text-green-300' : 'bg-red-900/30 border-red-700 text-red-300'}`}>
                {result.text}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={verifyPayment}
                disabled={verifying || !txHash.trim()}
                className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {verifying ? <><Loader2 size={14} className="animate-spin" /> Verifying on-chain…</> : 'Verify & Activate'}
              </button>
              <a
                href={`https://etherscan.io/address/${info.wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
              >
                View on Etherscan <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Features */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Everything Included</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FEATURES.map(f => (
            <div key={f} className="flex items-center gap-2 text-sm text-gray-300">
              <CheckCircle2 size={13} className="text-green-400 flex-shrink-0" />
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock size={14} className="text-gray-400" /> Payment History
            </h2>
          </div>
          <div className="divide-y divide-gray-800">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-sm font-medium text-gray-200 capitalize">{p.plan}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{new Date(p.created_at).toLocaleDateString()}</div>
                  {p.tx_hash && (
                    <a
                      href={`https://etherscan.io/tx/${p.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-400 hover:text-brand-300 font-mono flex items-center gap-1 mt-0.5"
                    >
                      {p.tx_hash.slice(0, 16)}… <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-200">{p.amount_usdt} USDT</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    p.status === 'confirmed'
                      ? 'bg-green-900/30 text-green-300 border-green-700'
                      : 'bg-amber-900/30 text-amber-300 border-amber-700'
                  }`}>
                    {p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
