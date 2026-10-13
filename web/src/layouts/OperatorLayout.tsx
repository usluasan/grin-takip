import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'
import { IcLeaf, IcList, IcMap, IcUser } from '../components/Icons'

export default function OperatorLayout() {
  const { demo } = useAuth()
  return (
    <div className="op">
      {demo && <div className="demo-banner">API'ye ulaşılamıyor — demo verisi</div>}
      <Outlet />
      <nav className="bottom-nav">
        <NavLink to="/saha" end className={({ isActive }) => (isActive ? 'active' : '')}><IcMap /><span>Canlı</span></NavLink>
        <NavLink to="/saha/isler" className={({ isActive }) => (isActive ? 'active' : '')}><IcList /><span>İşlerim</span></NavLink>
        <NavLink to="/saha/tasarruf" className={({ isActive }) => (isActive ? 'active' : '')}><IcLeaf /><span>Tasarruf</span></NavLink>
        <NavLink to="/saha/profil" className={({ isActive }) => (isActive ? 'active' : '')}><IcUser /><span>Profil</span></NavLink>
      </nav>
    </div>
  )
}
