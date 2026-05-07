import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { User, Shield, Lock, Trash2, Plus, Building2, RefreshCw } from 'lucide-react'

const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'
const labelCls = 'text-xs text-gray-400 mb-1 block'
const btnCls   = 'bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50'

type Lab  = { id: string; name: string; country: string; created_at: string }
type User_ = { id: string; email: string; role: string; created_at: string }

const ROLE_COLORS: Record<string, string> = {
  admin:    'bg-red-900/30 text-red-300 border-red-700',
  director: 'bg-violet-900/30 text-violet-300 border-violet-700',
  tech:     'bg-blue-900/30 text-blue-300 border-blue-700',
  viewer:   'bg-gray-800 text-gray-400 border-gray-700',
}

const TABS = [
  { id: 'lab',      label: 'Lab Profile',    icon: Building2 },
  { id: 'team',     label: 'Team Members',   icon: User },
  { id: 'security', label: 'Security',       icon: Lock },
] as const

type TabId = typeof TABS[number]['id']

export default function Settings() {
  const { role: myRole, userId: myId } = useAuthStore()
  const canManage = ['admin', 'director'].includes(myRole ?? '')

  const [tab, setTab] = useState<TabId>('lab')
  const [lab, setLab] = useState<Lab | null>(null)
  const [users, setUsers] = useState<User_[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Lab form
  const [labName, setLabName]       = useState('')
  const [labCountry, setLabCountry] = useState('')

  // New user form
  const [showAddUser, setShowAddUser] = useState(false)
  const [newEmail, setNewEmail]       = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole]         = useState('tech')
  const [addingUser, setAddingUser]   = useState(false)

  // Password change
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [changingPw, setChangingPw] = useState(false)

  function notify(text: string, ok: boolean) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3500)
  }

  useEffect(() => {
    api.get<{ data: Lab }>('/settings/lab').then(r => {
      setLab(r.data); setLabName(r.data.name); setLabCountry(r.data.country)
    })
    loadUsers()
  }, [])

  function loadUsers() {
    api.get<{ data: User_[] }>('/settings/users').then(r => setUsers(r.data))
  }

  async function saveLab() {
    if (!labName.trim()) return
    setSaving(true)
    try {
      await api.put('/settings/lab', { name: labName, country: labCountry })
      notify('Lab profile updated.', true)
    } catch (e: any) { notify(e.message, false) }
    finally { setSaving(false) }
  }

  async function addUser() {
    if (!newEmail || !newPassword) return
    setAddingUser(true)
    try {
      await api.post('/settings/users', { email: newEmail, password: newPassword, newRole })
      notify('User added successfully.', true)
      setNewEmail(''); setNewPassword(''); setNewRole('tech'); setShowAddUser(false)
      loadUsers()
    } catch (e: any) { notify(e.message, false) }
    finally { setAddingUser(false) }
  }

  async function changeRole(userId: string, role: string) {
    try {
      await api.put(`/settings/users/${userId}/role`, { newRole: role })
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
    } catch (e: any) { notify(e.message, false) }
  }

  async function removeUser(userId: string) {
    if (!confirm('Remove this user from the lab? They will lose all access.')) return
    try {
      await api.delete(`/settings/users/${userId}`)
      setUsers(prev => prev.filter(u => u.id !== userId))
      notify('User removed.', true)
    } catch (e: any) { notify(e.message, false) }
  }

  async function changePassword() {
    if (newPw !== confirmPw) { notify('Passwords do not match.', false); return }
    if (newPw.length < 8) { notify('Password must be at least 8 characters.', false); return }
    setChangingPw(true)
    try {
      await api.put('/settings/password', { currentPassword: currentPw, newPassword: newPw })
      notify('Password changed successfully.', true)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (e: any) { notify(e.message, false) }
    finally { setChangingPw(false) }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-white">Settings</h1>

      {/* Toast */}
      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${msg.ok ? 'bg-green-900/30 border-green-700 text-green-300' : 'bg-red-900/30 border-red-700 text-red-300'}`}>
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-colors ${
              tab === id ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Lab Profile */}
      {tab === 'lab' && lab && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-white text-sm">Lab Profile</h2>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Lab Name</label>
              <input type="text" value={labName} onChange={e => setLabName(e.target.value)}
                className={inputCls} disabled={!canManage} />
            </div>
            <div>
              <label className={labelCls}>Country</label>
              <input type="text" value={labCountry} onChange={e => setLabCountry(e.target.value)}
                className={inputCls} disabled={!canManage} />
            </div>
            <div>
              <label className={labelCls}>Lab ID</label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-500 font-mono">{lab.id}</div>
            </div>
            <div>
              <label className={labelCls}>Member Since</label>
              <div className="text-sm text-gray-400">{new Date(lab.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>
          </div>
          {canManage && (
            <button onClick={saveLab} disabled={saving || !labName.trim()} className={btnCls}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
        </div>
      )}

      {/* Team Members */}
      {tab === 'team' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <h2 className="font-semibold text-white text-sm">Team Members</h2>
            <div className="flex items-center gap-2">
              <button onClick={loadUsers} className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors" title="Refresh">
                <RefreshCw size={14} />
              </button>
              {canManage && (
                <button onClick={() => setShowAddUser(s => !s)}
                  className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                  <Plus size={13} /> Add User
                </button>
              )}
            </div>
          </div>

          {showAddUser && (
            <div className="px-5 py-4 border-b border-gray-800 bg-gray-800/30 space-y-3">
              <h3 className="text-sm font-medium text-white">Add New Team Member</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Email</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className={inputCls} placeholder="tech@lab.com" />
                </div>
                <div>
                  <label className={labelCls}>Temporary Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputCls} placeholder="Min 8 chars" />
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select value={newRole} onChange={e => setNewRole(e.target.value)} className={inputCls}>
                    <option value="tech">Tech (QC entry)</option>
                    <option value="director">Director (approve/sign)</option>
                    <option value="viewer">Viewer (read-only)</option>
                    <option value="admin">Admin (full access)</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addUser} disabled={addingUser || !newEmail || !newPassword} className={btnCls}>
                  {addingUser ? 'Adding…' : 'Add User'}
                </button>
                <button onClick={() => setShowAddUser(false)} className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-gray-800">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0">
                    {u.email[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-gray-200 truncate">{u.email}</div>
                    <div className="text-xs text-gray-500">Joined {new Date(u.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {canManage && u.id !== myId ? (
                    <select
                      value={u.role}
                      onChange={e => changeRole(u.id, e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="tech">tech</option>
                      <option value="director">director</option>
                      <option value="viewer">viewer</option>
                      <option value="admin">admin</option>
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[u.role] ?? ROLE_COLORS.viewer}`}>
                      {u.role}
                    </span>
                  )}
                  {u.id === myId && (
                    <span className="text-xs text-gray-600">(you)</span>
                  )}
                  {canManage && u.id !== myId && (
                    <button onClick={() => removeUser(u.id)}
                      className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-gray-800 text-xs text-gray-600">
            Roles: <strong className="text-gray-500">admin</strong> full access ·
            <strong className="text-gray-500"> director</strong> can approve/sign ·
            <strong className="text-gray-500"> tech</strong> QC entry ·
            <strong className="text-gray-500"> viewer</strong> read-only
          </div>
        </div>
      )}

      {/* Security */}
      {tab === 'security' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-white text-sm">Change Password</h2>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Current Password</label>
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>New Password</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className={inputCls} placeholder="Min 8 characters" />
            </div>
            <div>
              <label className={labelCls}>Confirm New Password</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className={inputCls} />
              {confirmPw && newPw !== confirmPw && (
                <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
              )}
            </div>
          </div>
          <button
            onClick={changePassword}
            disabled={changingPw || !currentPw || !newPw || !confirmPw || newPw !== confirmPw}
            className={btnCls}
          >
            {changingPw ? 'Changing…' : 'Change Password'}
          </button>

          <div className="border-t border-gray-800 pt-4 mt-2">
            <h3 className="text-sm font-medium text-white mb-3">Session Info</h3>
            <div className="bg-gray-800 rounded-lg p-3 text-xs text-gray-400 space-y-1">
              <div>JWT expires: 7 days from login</div>
              <div>Encryption: HS256 signed JWT</div>
              <div>Transport: HTTPS only (Cloudflare TLS)</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
