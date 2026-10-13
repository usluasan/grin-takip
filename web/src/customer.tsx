import { store } from './api'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'
import { useAuth } from './auth'
import type { Customer } from './types'

interface CustomerCtx {
  customers: Customer[]
  /** null = tüm müşteriler (yalnız admin) */
  selectedId: number | null
  setSelectedId: (id: number | null) => void
  selected: Customer | null
  reload: () => void
}
const Ctx = createContext<CustomerCtx | null>(null)
const KEY = 'grin.customer'

export function CustomerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedId, setSel] = useState<number | null>(() => {
    const s = store.get(KEY); return s ? Number(s) : null
  })
  const [v, setV] = useState(0)

  useEffect(() => {
    if (!user) return
    if (user.role === 'admin') {
      api.customers().then(setCustomers).catch(() => setCustomers([]))
    } else if (user.customer_id != null) {
      setSel(user.customer_id)
      api.customer(user.customer_id).then((c) => setCustomers([c])).catch(() => setCustomers([]))
    }
  }, [user, v])

  const setSelectedId = (id: number | null) => {
    setSel(id)
    if (id == null) store.del(KEY); else store.set(KEY, String(id))
  }
  const effectiveId = user?.role === 'admin' ? selectedId : (user?.customer_id ?? null)
  const selected = customers.find((c) => c.id === effectiveId) ?? null
  const value = useMemo(() => ({ customers, selectedId: effectiveId, setSelectedId, selected, reload: () => setV((x) => x + 1) }), [customers, effectiveId, selected]) // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCustomer(): CustomerCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('CustomerProvider eksik')
  return c
}
export function useCustomerName(): string {
  const c = useContext(Ctx)
  return c?.selected?.name ?? 'Tüm müşteriler'
}

/** Admin için müşteri seçici; manager'da gizli */
export function CustomerSelect() {
  const { user } = useAuth()
  const { customers, selectedId, setSelectedId } = useCustomer()
  if (user?.role !== 'admin') return null
  return (
    <div className="select-wrap">
      <label>Müşteri</label>
      <select value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Tüm müşteriler</option>
        {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  )
}
