import { useEffect } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { CustomerSelect, useCustomer } from '../customer'
import { useAsync } from '../hooks'
import { Loading } from '../components/ui'
import { MachinesCard, UsersCard } from './Customers'

/** /makineler ve /kullanicilar — müşteri bazlı tablo (Customers bileşenlerini yeniden kullanır) */
export default function MachinesPage({ kind }: { kind: 'machines' | 'users' }) {
  const { user } = useAuth()
  const { customers, selectedId, setSelectedId } = useCustomer()
  useEffect(() => {
    if (user?.role === 'admin' && selectedId == null && customers.length) setSelectedId(customers[0].id)
  }, [user, selectedId, customers, setSelectedId])
  const cid = selectedId
  const machines = useAsync(() => (cid ? api.machines(cid) : Promise.resolve([])), [cid], { interval: 30000 })
  const users = useAsync(() => (cid ? api.users(cid) : Promise.resolve([])), [cid])

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <div className="eyebrow">{kind === 'machines' ? 'Makineler' : 'Kullanıcılar'}</div>
          <h1>{kind === 'machines' ? 'Filo' : 'Kullanıcılar ve roller'}</h1>
        </div>
        <div className="toolbar"><CustomerSelect /></div>
      </div>
      {!cid ? <Loading text="Müşteri seçin" /> : kind === 'machines'
        ? <MachinesCard customerId={cid} machines={machines.data} loading={machines.loading} error={machines.error} users={users.data ?? []} onChange={machines.reload} />
        : <UsersCard customerId={cid} users={users.data} loading={users.loading} machines={machines.data ?? []} onChange={users.reload} />}
    </main>
  )
}
