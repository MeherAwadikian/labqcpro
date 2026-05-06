import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { api } from '../lib/api'
import { FlaskConical } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post<{ token: string; user_id: string; lab_id: string; role: string }>(
        '/auth/login', { email, password }
      )
      setAuth(res.token, res.user_id, res.lab_id, res.role)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Login failed')
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
          <h1 className="text-2xl font-bold text-white">LabQC Pro</h1>
          <p className="text-gray-400 text-sm">Sign in to your lab account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-gray-300">Email</label>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="lab@hospital.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-gray-300">Password</label>
            <input
              type="password" required value={password}
              onChange={e => setPassword(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <p className="text-center text-sm text-gray-500">
            No account?{' '}
            <Link to="/register" className="text-brand-400 hover:underline">Register your lab</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
