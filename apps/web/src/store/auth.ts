import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  userId: string | null
  labId: string | null
  role: string | null
  setAuth: (token: string, userId: string, labId: string, role: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token:  null,
      userId: null,
      labId:  null,
      role:   null,
      setAuth: (token, userId, labId, role) => {
        localStorage.setItem('labqc_token', token)
        set({ token, userId, labId, role })
      },
      logout: () => {
        localStorage.removeItem('labqc_token')
        set({ token: null, userId: null, labId: null, role: null })
      },
    }),
    { name: 'labqc_auth' }
  )
)
