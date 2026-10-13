import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import { AuthProvider, RequireRole } from './auth'
import { CustomerProvider } from './customer'
import AdminLayout from './layouts/AdminLayout'
import OperatorLayout from './layouts/OperatorLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import LiveMap from './pages/LiveMap'
import Customers from './pages/Customers'
import MachinesPage from './pages/MachinesPage'
import Carbon from './pages/Carbon'
import OperatorLive from './pages/saha/Live'
import { JobCard, JobList } from './pages/saha/Jobs'
import { OperatorProfile, OperatorSavings } from './pages/saha/Misc'

// VITE_STATIC_DEMO=1: statik hostta (artifact) hash yönlendirme, service worker yok
const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1'
if (!STATIC_DEMO) registerSW({ immediate: true })
const Router = STATIC_DEMO ? HashRouter : BrowserRouter

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireRole roles={['admin', 'manager']}><CustomerProvider><AdminLayout /></CustomerProvider></RequireRole>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/harita" element={<LiveMap />} />
            <Route path="/musteriler" element={<Customers />} />
            <Route path="/makineler" element={<MachinesPage kind="machines" />} />
            <Route path="/kullanicilar" element={<MachinesPage kind="users" />} />
            <Route path="/karbon" element={<Carbon />} />
          </Route>
          <Route path="/saha" element={<RequireRole roles={['operator', 'manager', 'admin']}><OperatorLayout /></RequireRole>}>
            <Route index element={<OperatorLive />} />
            <Route path="isler" element={<JobList />} />
            <Route path="isler/:id" element={<JobCard />} />
            <Route path="tasarruf" element={<OperatorSavings />} />
            <Route path="profil" element={<OperatorProfile />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
