import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { IcCog, IcGrid, IcHome, IcLeaf, IcMap, IcUsers, Logo } from '../components/Icons'
import { useCustomerName } from '../customer'

const items = [
  { to: '/', label: 'Genel bakış', Ic: IcGrid, end: true },
  { to: '/harita', label: 'Canlı harita', Ic: IcMap },
  { to: '/musteriler', label: 'Müşteriler', Ic: IcHome },
  { to: '/makineler', label: 'Makineler', Ic: IcCog },
  { to: '/karbon', label: 'Karbon raporu', Ic: IcLeaf },
  { to: '/kullanicilar', label: 'Kullanıcılar', Ic: IcUsers },
]

export default function AdminLayout() {
  const { user, logout, demo } = useAuth()
  const nav = useNavigate()
  const customerName = useCustomerName()
  const roleLabel = user?.role === 'admin' ? 'Arteverte admin' : 'Yönetici'
  return (
    <div className="admin">
      {demo && <div className="demo-banner">API'ye ulaşılamıyor — demo verisi</div>}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><Logo size={26} /></div>
          <div>
            <div className="brand-name">GRIN Takip</div>
            <div className="brand-sub">Arteverte · Sıfır atık</div>
          </div>
        </div>
        <nav className="nav">
          {items.map(({ to, label, Ic, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Ic /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="user-card">
          <b>{user?.full_name}</b>
          <span>{user?.role === 'admin' ? 'Arteverte' : customerName} · {roleLabel}</span>
          <button onClick={() => { logout(); nav('/login') }}>Çıkış yap</button>
        </div>
      </aside>
      <Outlet />
    </div>
  )
}
