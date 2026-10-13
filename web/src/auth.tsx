import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, clearAuth, getStoredUser, getToken, isDemo, onDemoChange, probeApi, setAuth } from './api'
import type { Role, User } from './types'

interface AuthCtx {
  user: User | null
  ready: boolean
  demo: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser())
  const [ready, setReady] = useState(false)
  const [demo, setDemo] = useState(isDemo())

  useEffect(() => {
    const off = onDemoChange(setDemo)
    probeApi().then(async (ok) => {
      if (ok && getToken()) {
        try { const me = await api.me(); setUser(me); setAuth(getToken()!, me) } catch { /* 401 → api temizler */ }
      }
      setReady(true)
    })
    return off
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password)
    setAuth(r.token, r.user)
    setUser(r.user)
    return r.user
  }, [])
  const logout = useCallback(() => { clearAuth(); setUser(null) }, [])

  const v = useMemo(() => ({ user, ready, demo, login, logout }), [user, ready, demo, login, logout])
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('AuthProvider eksik')
  return c
}

export function homeFor(role: Role): string { return role === 'operator' ? '/saha' : '/' }

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return <div className="splash">GRIN Takip yükleniyor…</div>
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <>{children}</>
}
