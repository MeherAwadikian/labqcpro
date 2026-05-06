import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Card, Button, Badge, PageHeader, Spinner } from '../components/ui'
import { CheckCircle, Bitcoin } from 'lucide-react'

interface SubStatus {
  status: string; trial_end: string; paid_until: string | null
  days_left: number; is_active: boolean
}

interface Payment {
  id: string; plan: string; amount_usd: number; status: string; created_at: string
}

export default function Subscription() {
  const [sub, setSub] = useState<SubStatus | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [paymentLink, setPaymentLink] = useState<any>(null)
  const [creating, setCreating] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<{ data: SubStatus }>('/subscription/status'),
      api.get<{ data: Payment[] }>('/subscription/payments'),
    ]).then(([s, p]) => {
      setSub(s.data)
      setPayments(p.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function createPayment(plan: 'monthly' | 'yearly') {
    setCreating(plan)
    try {
      const res = await api.post<{ data: any }>('/subscription/create-payment', {
        plan, pay_currency: 'usdttrc20',
      })
      setPaymentLink(res.data)
    } finally {
      setCreating(null)
    }
  }

  const features = [
    'Unlimited QC runs',
    'All Westgard rules (6)',
    'Levey-Jennings charts',
    'AI lab assistant (Claude)',
    'IQCP & compliance module',
    'CAP standards library',
    'Reagent lot tracking',
    'PDF manual analysis',
    'Cloudflare global edge',
  ]

  if (loading) return <div className="flex justify-center py-16"><Spinner size={32} /></div>

  return (
    <div>
      <PageHeader title="Subscription" subtitle="Manage your LabQC Pro plan" />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Current status */}
        <Card>
          <h3 className="font-semibold text-white mb-4">Current Status</h3>
          {sub && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Status</span>
                <Badge variant={sub.is_active ? 'success' : 'danger'} className="capitalize">
                  {sub.status}
                </Badge>
              </div>
              {sub.status === 'trial' && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Trial ends</span>
                  <span className="text-gray-200">{new Date(sub.trial_end).toLocaleDateString()}</span>
                </div>
              )}
              {sub.paid_until && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Paid until</span>
                  <span className="text-gray-200">{new Date(sub.paid_until).toLocaleDateString()}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Days remaining</span>
                <span className={`font-semibold ${sub.days_left < 7 ? 'text-red-400' : 'text-green-400'}`}>
                  {sub.days_left} days
                </span>
              </div>

              {!sub.is_active && (
                <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-sm text-red-300">
                  Your subscription has expired. Upgrade to continue adding QC data.
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Plans */}
        <div className="space-y-4">
          {[
            { plan: 'monthly' as const, price: '$29', period: '/month', savings: null },
            { plan: 'yearly'  as const, price: '$249', period: '/year', savings: 'Save $99' },
          ].map(({ plan, price, period, savings }) => (
            <Card key={plan} className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-white capitalize">{plan}</span>
                  {savings && <Badge variant="success">{savings}</Badge>}
                </div>
                <div className="text-2xl font-bold text-brand-300">
                  {price}<span className="text-sm text-gray-500">{period}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Paid via crypto (USDT, BTC, ETH)</p>
              </div>
              <Button onClick={() => createPayment(plan)} disabled={creating === plan} size="sm">
                <Bitcoin size={14} />
                {creating === plan ? 'Creating…' : 'Pay Crypto'}
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* Payment link */}
      {paymentLink && (
        <Card className="mt-4 bg-brand-900/20 border-brand-700">
          <h3 className="font-semibold text-brand-300 mb-3">Complete Your Payment</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Send exactly:</span>
              <span className="font-mono text-white font-medium">{paymentLink.pay_amount} {paymentLink.pay_currency?.toUpperCase()}</span>
            </div>
            <div>
              <span className="text-gray-400">To address:</span>
              <div className="mt-1 bg-gray-800 rounded-lg px-3 py-2 font-mono text-xs text-gray-200 break-all">
                {paymentLink.pay_address}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Payment will be confirmed automatically. Your subscription activates within minutes of blockchain confirmation.
            </p>
          </div>
        </Card>
      )}

      {/* Features */}
      <Card className="mt-6">
        <h3 className="font-semibold text-white mb-4">What's Included</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {features.map(f => (
            <div key={f} className="flex items-center gap-2 text-sm text-gray-300">
              <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
              {f}
            </div>
          ))}
        </div>
      </Card>

      {/* Payment history */}
      {payments.length > 0 && (
        <Card className="mt-4">
          <h3 className="font-semibold text-white mb-4">Payment History</h3>
          <div className="space-y-2">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-200 capitalize">{p.plan}</span>
                  <span className="text-xs text-gray-500 ml-2">{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-300">${p.amount_usd}</span>
                  <Badge variant={p.status === 'finished' ? 'success' : p.status === 'pending' ? 'warning' : 'info'}>
                    {p.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
