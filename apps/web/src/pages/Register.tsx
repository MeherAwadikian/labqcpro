import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { api } from '../lib/api'
import { FlaskConical } from 'lucide-react'

const inputCls = "bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full"

export default function Register() {
  const [form, setForm] = useState({ email: '', password: '', lab_name: '', country: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()

  function set(field: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post<{ token: string; user_id: string; lab_id: string }>(
        '/auth/register', form
      )
      setAuth(res.token, res.user_id, res.lab_id, 'admin')
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center">
            <FlaskConical size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Register Your Lab</h1>
          <p className="text-gray-400 text-sm">7-day free trial — no credit card</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-gray-300">Lab Name</label>
            <input
              type="text" required className={inputCls}
              placeholder="City General Hospital Lab"
              value={form.lab_name}
              onChange={e => set('lab_name', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-gray-300">Country</label>
            <input
              type="text" required className={inputCls}
              placeholder="United States"
              value={form.country}
              onChange={e => set('country', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-gray-300">Email</label>
            <input
              type="email" required className={inputCls}
              placeholder="admin@lab.com"
              value={form.email}
              onChange={e => set('email', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-gray-300">Password</label>
            <input
              type="password" required className={inputCls}
              placeholder="Min 8 characters"
              value={form.password}
              onChange={e => set('password', e.target.value)}
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create Lab Account'}
          </button>
          <p className="text-center text-sm text-gray-500">
            Already registered?{' '}
            <Link to="/login" className="text-brand-400 hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
