// SPEC §6 REST API sarmalayıcısı. API'ye ulaşılamazsa demo moduna düşer (src/mock.ts).
import type {
  Customer, Dashboard, Factor, LiveMachine, LoginResponse, Machine, MachineCreated, SavingsReport,
  Session, SessionPhotoResponse, Site, TrackResponse, User,
} from './types'
import * as mock from './mock'

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) || '/api/v1'
const TOKEN_KEY = 'grin.token'
const USER_KEY = 'grin.user'

export class ApiError extends Error {
  status: number
  constructor(status: number, detail: string) { super(detail); this.status = status }
}

// ---- auth state ----
// Depolama: localStorage yoksa/kapalıysa (artifact, gizli pencere) bellekte tut
const mem = new Map<string, string>()
export const store = {
  get(k: string): string | null { try { return localStorage.getItem(k) } catch { return mem.get(k) ?? null } },
  set(k: string, v: string) { mem.set(k, v); try { localStorage.setItem(k, v) } catch { /* bellek */ } },
  del(k: string) { mem.delete(k); try { localStorage.removeItem(k) } catch { /* bellek */ } },
}
export function getToken(): string | null { return store.get(TOKEN_KEY) }
export function getStoredUser(): User | null {
  try { const s = store.get(USER_KEY); return s ? (JSON.parse(s) as User) : null } catch { return null }
}
export function setAuth(token: string, user: User) {
  store.set(TOKEN_KEY, token); store.set(USER_KEY, JSON.stringify(user))
}
export function clearAuth() { store.del(TOKEN_KEY); store.del(USER_KEY) }

// ---- demo mode ----
// Statik demo derlemesinde API hiç denenmez
const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1'
let demoMode = STATIC_DEMO
const demoListeners = new Set<(v: boolean) => void>()
export function isDemo() { return demoMode }
export function onDemoChange(fn: (v: boolean) => void) { demoListeners.add(fn); return () => { demoListeners.delete(fn) } }
function setDemo(v: boolean) { if (demoMode !== v) { demoMode = v; demoListeners.forEach((f) => f(v)) } }

/** Yüklemede API'ye erişilebiliyor mu? Erişilemezse demo moduna geç. */
export async function probeApi(): Promise<boolean> {
  if (STATIC_DEMO) { setDemo(true); return false }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    const r = await fetch(`${API_BASE}/me`, { signal: ctrl.signal, headers: authHeaders() })
    clearTimeout(t)
    // 401 bile olsa API ayakta demektir; 5xx/HTML cevabı ise değil
    const ok = r.status < 500 && !(r.headers.get('content-type') || '').includes('text/html')
    setDemo(!ok)
    return ok
  } catch {
    setDemo(true)
    return false
  }
}

function authHeaders(): Record<string, string> {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

function qs(params?: Record<string, string | number | undefined | null>): string {
  if (!params) return ''
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)) })
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function request<T>(method: string, path: string, body?: unknown, demo?: () => T): Promise<T> {
  if (demoMode && demo) return delay(demo())
  let r: Response
  try {
    r = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (e) {
    if (demo) { setDemo(true); return delay(demo()) }
    throw new ApiError(0, 'API’ye ulaşılamıyor')
  }
  if (r.status === 401 && path !== '/auth/login') {
    clearAuth()
    window.location.href = STATIC_DEMO ? '#/login' : '/login'
    throw new ApiError(401, 'Oturum süresi doldu')
  }
  if (!r.ok) {
    let detail = r.statusText
    try { const j = await r.json(); detail = j.detail ?? detail } catch { /* ignore */ }
    throw new ApiError(r.status, typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (r.status === 204) return undefined as T
  return (await r.json()) as T
}

function delay<T>(v: T): Promise<T> { return new Promise((res) => setTimeout(() => res(v), 150)) }
const todayIso = () => new Date().toISOString().slice(0, 10)

// ---- endpoints ----
export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('POST', '/auth/login', { email, password }, () => {
      // demo: e-postaya göre rol seç
      const u = /admin/i.test(email) ? mock.mockUsers.admin : /ayse|manager|yonetici/i.test(email) ? mock.mockUsers.manager : mock.mockUsers.operator
      return { token: 'demo-token', user: u }
    }),
  me: () => request<User>('GET', '/me', undefined, () => getStoredUser() ?? mock.mockUsers.manager),

  customers: () => request<Customer[]>('GET', '/customers', undefined, () => mock.mockCustomers),
  customer: (id: number) => request<Customer>('GET', `/customers/${id}`, undefined, () => mock.mockCustomers.find((c) => c.id === id) ?? mock.mockCustomers[0]),
  createCustomer: (body: Partial<Customer>) => request<Customer>('POST', '/customers', body, () => ({ id: Date.now(), name: body.name ?? '', city: body.city ?? '', contract_start: body.contract_start ?? null, contract_end: body.contract_end ?? null })),
  updateCustomer: (id: number, body: Partial<Customer>) => request<Customer>('PATCH', `/customers/${id}`, body, () => ({ ...(mock.mockCustomers.find((c) => c.id === id) ?? mock.mockCustomers[0]), ...body })),

  sites: (customerId: number) => request<Site[]>('GET', `/customers/${customerId}/sites`, undefined, () => mock.mockSites),
  createSite: (customerId: number, body: { name: string; polygon: GeoJSON.Polygon | null; grass_area_m2?: number; notes?: string }) =>
    request<Site>('POST', `/customers/${customerId}/sites`, body, () => ({ id: Date.now(), customer_id: customerId, name: body.name, polygon: body.polygon, grass_area_m2: body.grass_area_m2 ?? 0 })),

  machines: (customerId: number) => request<Machine[]>('GET', `/customers/${customerId}/machines`, undefined, () => mock.mockMachines),
  createMachine: (customerId: number, body: { name: string; model: string; cut_width_cm: number; device_id: string; assigned_user_id?: number | null }) =>
    request<MachineCreated>('POST', `/customers/${customerId}/machines`, body, () => ({ id: Date.now(), customer_id: customerId, assigned_user_id: null, ...body, device_token: 'demo-' + Math.random().toString(36).slice(2, 18) })),
  updateMachine: (id: number, body: Partial<Machine>) => request<Machine>('PATCH', `/machines/${id}`, body, () => ({ ...(mock.mockMachines.find((m) => m.id === id) ?? mock.mockMachines[0]), ...body })),

  users: (customerId: number) => request<User[]>('GET', `/customers/${customerId}/users`, undefined, () => mock.mockCustomerUsers),
  /** Davet e-postası yok: geçici şifre zorunlu (min 6). assigned_machine_id verilirse makineye atar. */
  inviteUser: (customerId: number, body: { email: string; full_name: string; role: 'manager' | 'operator'; password: string; assigned_machine_id?: number | null }) =>
    request<User>('POST', `/customers/${customerId}/users`, body, () => ({ id: Date.now(), customer_id: customerId, email: body.email, full_name: body.full_name, role: body.role, is_active: true, status: 'active' })),

  live: (customerId?: number | null) => request<LiveMachine[]>('GET', `/machines/live${qs({ customer_id: customerId })}`, undefined, () => mock.mockLive),
  track: (machineId: number, from?: string, to?: string) =>
    request<TrackResponse>('GET', `/machines/${machineId}/track${qs({ from: from ?? todayIso(), to })}`, undefined, () => mock.mockTrack(machineId)),

  sessions: (p: { customer_id?: number | null; machine_id?: number; from?: string; to?: string; operator_id?: number }) =>
    request<Session[]>('GET', `/sessions${qs(p)}`, undefined, () => mock.mockSessions.filter((s) =>
      (!p.machine_id || s.machine_id === p.machine_id) && (!p.from || s.started_at.slice(0, 10) >= p.from) && (!p.to || s.started_at.slice(0, 10) <= p.to))),
  session: (id: number) => request<Session>('GET', `/sessions/${id}`, undefined, () => mock.mockSessions.find((s) => s.id === id) ?? mock.mockSessions[0]),
  patchSession: (id: number, body: { note?: string | null; photos?: string[] }) =>
    request<Session>('PATCH', `/sessions/${id}`, body, () => {
      const s = mock.mockSessions.find((x) => x.id === id) ?? mock.mockSessions[0]
      if (body.note !== undefined) s.note = body.note
      if (body.photos) s.photos = body.photos
      return s
    }),
  closeSession: (id: number) => request<Session>('POST', `/sessions/${id}/close`, undefined, () => {
    const s = mock.mockSessions.find((x) => x.id === id) ?? mock.mockSessions[0]
    s.status = 'closed'; s.ended_at = new Date().toISOString(); return s
  }),
  /** multipart `file` → sunucu UPLOAD_DIR'e yazar, URL'yi photos[]'a ekler; yanıt: oturum + url */
  uploadPhoto: async (id: number, file: File): Promise<SessionPhotoResponse | null> => {
    if (demoMode) return null
    const fd = new FormData(); fd.append('file', file)
    const r = await fetch(`${API_BASE}/sessions/${id}/photos`, { method: 'POST', headers: authHeaders(), body: fd })
    if (r.status === 404 || r.status === 405) return null // uç yok → base64 ile PATCH'e düş
    if (!r.ok) {
      let detail = 'Fotoğraf yüklenemedi'
      try { const j = await r.json(); detail = j.detail ?? detail } catch { /* ignore */ }
      throw new ApiError(r.status, detail)
    }
    return (await r.json()) as SessionPhotoResponse
  },

  dashboard: (p: { customer_id?: number | null; period: 'day' | 'month' | 'season' }) =>
    request<Dashboard>('GET', `/dashboard${qs(p)}`, undefined, () => ({ ...mock.mockDashboard, period: p.period })),
  savings: (p: { customer_id?: number | null; from?: string; to?: string }) =>
    request<SavingsReport>('GET', `/savings${qs(p)}`, undefined, () => mock.mockSavings),

  factors: () => request<Factor[]>('GET', '/factors', undefined, () => mock.mockFactors),
  putFactors: (factors: Factor[]) => request<Factor[]>('PUT', '/factors', factors, () => factors),

  deviceCmd: (deviceId: string, cmd: Record<string, unknown>) => request<{ ok: boolean }>('POST', `/devices/${deviceId}/cmd`, cmd, () => ({ ok: true })),
}
