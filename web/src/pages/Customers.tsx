import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Polygon, useMapEvents } from 'react-leaflet'
import { api } from '../api'
import { useAuth } from '../auth'
import { useCustomer } from '../customer'
import { useAsync } from '../hooks'
import { DEFAULT_CENTER, FitTo, MapContainer, SitePolygon, Tiles } from '../components/Map'
import { IcPin } from '../components/Icons'
import { ErrorBox, Loading, Modal, StatePill } from '../components/ui'
import type { Customer, Machine, MachineCreated, Site, User } from '../types'
import { agoShort, fmt0, fmtDate } from '../util'

type Tab = 'machines' | 'sites' | 'users'
const roleLabel: Record<User['role'], string> = { admin: 'Arteverte admin', manager: 'Müşteri yöneticisi', operator: 'Saha operatörü' }

export default function Customers({ initialTab = 'machines' }: { initialTab?: Tab }) {
  const { user } = useAuth()
  const { customers, selectedId, setSelectedId, selected, reload } = useCustomer()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [showNew, setShowNew] = useState(false)
  const [editCust, setEditCust] = useState(false)

  // Admin müşteri seçmemişse ilkini seç
  useEffect(() => {
    if (user?.role === 'admin' && selectedId == null && customers.length) setSelectedId(customers[0].id)
  }, [user, selectedId, customers, setSelectedId])

  const cid = selectedId
  const machines = useAsync(() => (cid ? api.machines(cid) : Promise.resolve([] as Machine[])), [cid])
  const sites = useAsync(() => (cid ? api.sites(cid) : Promise.resolve([] as Site[])), [cid])
  const users = useAsync(() => (cid ? api.users(cid) : Promise.resolve([] as User[])), [cid])

  const c = selected

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <div className="eyebrow">Müşteriler</div>
          {user?.role === 'admin' && customers.length > 1 ? (
            <h1>
              <select value={cid ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))} style={{ font: 'inherit', border: 'none', background: 'transparent', color: 'inherit', padding: 0, cursor: 'pointer' }}>
                {customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </h1>
          ) : <h1>{c?.name ?? '—'}</h1>}
          <div className="sub">
            {c ? <>{c.city} · Sözleşme: {fmtDate(c.contract_start)} – {fmtDate(c.contract_end)} · {sites.data?.length ?? c.site_count ?? 0} saha · {machines.data?.length ?? c.machine_count ?? 0} makine · {users.data?.length ?? c.user_count ?? 0} kullanıcı</> : 'Müşteri seçilmedi'}
          </div>
        </div>
        <div className="toolbar">
          {c && <button className="btn" onClick={() => setEditCust(true)}>Müşteriyi düzenle</button>}
          {user?.role === 'admin' && <button className="btn primary" onClick={() => setShowNew(true)}>+ Yeni müşteri</button>}
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'machines' ? 'active' : ''} onClick={() => setTab('machines')}>Makineler</button>
        <button className={tab === 'sites' ? 'active' : ''} onClick={() => setTab('sites')}>Sahalar</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Kullanıcılar</button>
      </div>

      {!cid ? <Loading text="Müşteri seçin" /> : (
        <>
          {tab === 'machines' && <MachinesCard customerId={cid} machines={machines.data} loading={machines.loading} error={machines.error} users={users.data ?? []} onChange={machines.reload} />}
          {tab === 'users' && <UsersCard customerId={cid} users={users.data} loading={users.loading} machines={machines.data ?? []} onChange={users.reload} />}
          {tab === 'sites' && <SitesCard customerId={cid} sites={sites.data} loading={sites.loading} onChange={sites.reload} />}
          {tab === 'machines' && (
            <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 20 }}>
              <UsersCard customerId={cid} users={users.data} loading={users.loading} machines={machines.data ?? []} onChange={users.reload} compact />
              <SitesCard customerId={cid} sites={sites.data} loading={sites.loading} onChange={sites.reload} compact />
            </div>
          )}
        </>
      )}

      {showNew && <CustomerModal onClose={() => setShowNew(false)} onSaved={(nc) => { setShowNew(false); reload(); setSelectedId(nc.id) }} />}
      {editCust && c && <CustomerModal customer={c} onClose={() => setEditCust(false)} onSaved={() => { setEditCust(false); reload() }} />}
    </main>
  )
}

// ---------------- Makineler ----------------
export function MachinesCard({ customerId, machines, loading, error, users, onChange, title = 'Makineler' }: { customerId: number; machines: Machine[] | null; loading: boolean; error?: unknown; users: User[]; onChange: () => void; title?: string }) {
  const [show, setShow] = useState(false)
  const exportCsv = () => {
    const rows = [['Makine', 'Model', 'Kesme genişliği (cm)', 'Modül ID', 'Atanan', 'Durum', 'Bu ay m²', 'Pil %'], ...(machines ?? []).map((m) => [m.name, m.model, m.cut_width_cm, m.device_id, m.assigned_user_name ?? '', m.state ?? '', m.month_area_m2 ?? '', m.bat_pct ?? ''])]
    const blob = new Blob(['﻿' + rows.map((r) => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'makineler.csv'; a.click()
  }
  return (
    <div className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <div className="toolbar">
          <button className="btn sm" onClick={exportCsv}>Dışa aktar</button>
          <button className="btn sm primary" onClick={() => setShow(true)}>+ Makine ekle</button>
        </div>
      </div>
      <ErrorBox error={error} />
      {loading && !machines ? <Loading /> : (
        <table>
          <thead><tr><th>Makine</th><th>Model · kesme genişliği</th><th>Modül ID</th><th>Atandığı kullanıcı</th><th>Durum</th><th className="num">Bu ay m²</th><th>Pil</th><th>Son veri</th><th></th></tr></thead>
          <tbody>
            {(machines ?? []).map((m) => (
              <tr key={m.id}>
                <td><b>{m.name}</b></td>
                <td>{m.model} · {m.cut_width_cm} cm</td>
                <td className="mono">{m.device_id}</td>
                <td>{m.assigned_user_name ?? '—'}</td>
                <td><StatePill state={m.state} lastSeen={m.last_seen} /></td>
                <td className="num"><b>{fmt0(m.month_area_m2)}</b></td>
                <td>{m.bat_pct != null ? `%${m.bat_pct}` : '?'}</td>
                <td>{agoShort(m.last_seen)}</td>
                <td><Link to={`/harita?m=${m.id}`}>Haritada</Link></td>
              </tr>
            ))}
            {machines && machines.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--muted)' }}>Henüz makine yok.</td></tr>}
          </tbody>
        </table>
      )}
      {show && <MachineModal customerId={customerId} users={users} onClose={() => setShow(false)} onSaved={onChange} />}
    </div>
  )
}

function MachineModal({ customerId, users, onClose, onSaved }: { customerId: number; users: User[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', model: 'HM46 Honda', cut_width_cm: 46, device_id: '', assigned_user_id: '' })
  const [created, setCreated] = useState<MachineCreated | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      const r = await api.createMachine(customerId, { name: f.name, model: f.model, cut_width_cm: Number(f.cut_width_cm), device_id: f.device_id, assigned_user_id: f.assigned_user_id ? Number(f.assigned_user_id) : null })
      setCreated(r); onSaved()
    } catch (ex) { setErr(ex) } finally { setBusy(false) }
  }
  if (created) {
    return (
      <Modal title="Makine eklendi" onClose={onClose}>
        <p><b>{created.name}</b> · {created.device_id}</p>
        <p style={{ color: 'var(--muted)' }}>Cihaz şifresi (device_token) yalnızca <b>bir kez</b> gösterilir. Firmware'e MQTT şifresi olarak yazın.</p>
        <div className="token-box mono">{created.device_token}</div>
        <div className="actions">
          <button className="btn" onClick={() => { navigator.clipboard?.writeText(created.device_token); setCopied(true) }}>{copied ? 'Kopyalandı ✓' : 'Kopyala'}</button>
          <button className="btn primary" onClick={onClose}>Kapat</button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="Makine ekle" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Makine adı</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="GRIN-08" /></div>
        <div className="field"><label>Model</label>
          <select value={f.model} onChange={(e) => setF({ ...f, model: e.target.value, cut_width_cm: e.target.value.startsWith('PM53') ? 53 : 46 })}>
            <option>HM46 Honda</option><option>HM46 B&S</option><option>PM53</option><option>Diğer</option>
          </select></div>
        <div className="field"><label>Kesme genişliği (cm)</label><input type="number" min={20} max={120} required value={f.cut_width_cm} onChange={(e) => setF({ ...f, cut_width_cm: Number(e.target.value) })} /></div>
        <div className="field"><label>Modül ID (device_id)</label><input required value={f.device_id} onChange={(e) => setF({ ...f, device_id: e.target.value })} placeholder="MOD-2026-0008" /></div>
        <div className="field"><label>Atanan operatör</label>
          <select value={f.assigned_user_id} onChange={(e) => setF({ ...f, assigned_user_id: e.target.value })}>
            <option value="">—</option>
            {users.filter((u) => u.role === 'operator').map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select></div>
        <ErrorBox error={err} />
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button className="btn primary" disabled={busy}>Kaydet</button></div>
      </form>
    </Modal>
  )
}

// ---------------- Kullanıcılar ----------------
export function UsersCard({ customerId, users, loading, machines, onChange, compact = false }: { customerId: number; users: User[] | null; loading: boolean; machines: Machine[]; onChange: () => void; compact?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div className="card">
      <div className="card-head">
        <h2>Kullanıcılar ve roller</h2>
        <button className="btn sm" onClick={() => setShow(true)}>+ Kullanıcı davet et</button>
      </div>
      {loading && !users ? <Loading /> : (
        <table>
          <thead><tr><th>Ad</th><th>Rol</th><th>Makine</th>{!compact && <th>E-posta</th>}<th>Durum</th></tr></thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td><b>{u.full_name}</b></td>
                <td><span className={`pill ${u.role === 'admin' ? 'lime' : u.role === 'manager' ? 'mowing' : 'soft'}`}>{roleLabel[u.role]}</span></td>
                <td>{u.machine_name ?? (u.role === 'operator' ? (machines.find((m) => m.assigned_user_id === u.id)?.name ?? '—') : u.role === 'admin' ? 'Tüm müşteriler' : 'Tümü')}</td>
                {!compact && <td>{u.email}</td>}
                <td style={{ color: u.is_active ? 'var(--forest)' : 'var(--warn)', fontWeight: 700 }}>{u.is_active ? 'Aktif' : 'Davet bekliyor'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 16, marginBottom: 0 }}>
        Roller: <b>Arteverte admin</b> tüm müşterileri görür · <b>Müşteri yöneticisi</b> kendi şirketinin tüm makine, saha ve raporlarını görür · <b>Saha operatörü</b> yalnız atandığı makineyi ve kendi işlerini görür.
      </p>
      {show && <InviteModal customerId={customerId} machines={machines} onClose={() => setShow(false)} onSaved={() => { setShow(false); onChange() }} />}
    </div>
  )
}

function InviteModal({ customerId, machines, onClose, onSaved }: { customerId: number; machines: Machine[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ full_name: '', email: '', role: 'operator' as 'operator' | 'manager', password: '', assigned_machine_id: '' })
  const [err, setErr] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      await api.inviteUser(customerId, { ...f, assigned_machine_id: f.assigned_machine_id ? Number(f.assigned_machine_id) : null })
      onSaved()
    } catch (ex) { setErr(ex) } finally { setBusy(false) }
  }
  return (
    <Modal title="Kullanıcı davet et" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Ad soyad</label><input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
        <div className="field"><label>E-posta</label><input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label>Rol</label>
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'operator' | 'manager' })}>
            <option value="operator">Saha operatörü</option><option value="manager">Müşteri yöneticisi</option>
          </select></div>
        {f.role === 'operator' && (
          <div className="field"><label>Makine</label>
            <select value={f.assigned_machine_id} onChange={(e) => setF({ ...f, assigned_machine_id: e.target.value })}>
              <option value="">—</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select></div>
        )}
        <div className="field"><label>Geçici şifre (en az 6 karakter; kullanıcıya iletin)</label><input required minLength={6} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <ErrorBox error={err} />
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button className="btn primary" disabled={busy}>Kullanıcı oluştur</button></div>
      </form>
    </Modal>
  )
}

// ---------------- Sahalar ----------------
export function SitesCard({ customerId, sites, loading, onChange, compact = false }: { customerId: number; sites: Site[] | null; loading: boolean; onChange: () => void; compact?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div className="card">
      <div className="card-head">
        <h2>Sahalar</h2>
        <button className="btn sm" onClick={() => setShow(true)}>+ Saha çiz</button>
      </div>
      {loading && !sites ? <Loading /> : (
        <div className="machine-list">
          {(sites ?? []).map((s) => (
            <div className="machine-row" key={s.id}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--ok-bg)', display: 'grid', placeItems: 'center', color: 'var(--forest)' }}><IcPin /></div>
              <div>
                <div className="name">{s.name}</div>
                <div className="site">{s.district ? `${s.district} · ` : ''}{fmt0(s.grass_area_m2)} m² çim{s.zone_count ? ` · ${s.zone_count} bölge` : ''}</div>
              </div>
              <div className="right">
                {s.week_pct != null ? <><b>%{s.week_pct}</b><span>bu hafta biçildi</span></> : <span>{s.polygon ? 'Poligon var' : 'Poligon yok'}</span>}
              </div>
            </div>
          ))}
          {sites && sites.length === 0 && <Loading text="Henüz saha yok. “Saha çiz” ile ekleyin." />}
        </div>
      )}
      {!compact && sites && sites.some((s) => s.polygon) && (
        <div className="map-box" style={{ height: 360, marginTop: 16 }}>
          <MapContainer center={DEFAULT_CENTER} zoom={14} style={{ height: '100%' }} scrollWheelZoom={false}>
            <Tiles />
            <FitTo points={sites.flatMap((s) => (s.polygon ? s.polygon.coordinates[0].map((c) => [c[1], c[0]] as [number, number]) : []))} />
            {sites.map((s) => <SitePolygon key={s.id} id={`sp-${s.id}`} polygon={s.polygon} label={s.name} />)}
          </MapContainer>
        </div>
      )}
      {show && <SiteModal customerId={customerId} onClose={() => setShow(false)} onSaved={() => { setShow(false); onChange() }} />}
    </div>
  )
}

function ClickCollector({ onAdd }: { onAdd: (p: [number, number]) => void }) {
  useMapEvents({ click: (e) => onAdd([e.latlng.lat, e.latlng.lng]) })
  return null
}

/** Basit poligon alanı (m²) — küçük alanlar için eşit-alan yaklaşımı */
function polygonAreaM2(pts: Array<[number, number]>): number {
  if (pts.length < 3) return 0
  const R = 6378137
  const lat0 = (pts.reduce((a, p) => a + p[0], 0) / pts.length) * Math.PI / 180
  const xy = pts.map(([lat, lon]) => [R * lon * Math.PI / 180 * Math.cos(lat0), R * lat * Math.PI / 180])
  let a = 0
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i]; const [x2, y2] = xy[(i + 1) % xy.length]; a += x1 * y2 - x2 * y1 }
  return Math.abs(a / 2)
}

function SiteModal({ customerId, onClose, onSaved }: { customerId: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [pts, setPts] = useState<Array<[number, number]>>([])
  const [geoText, setGeoText] = useState('')
  const [mode, setMode] = useState<'draw' | 'paste'>('draw')
  const [err, setErr] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const area = useMemo(() => polygonAreaM2(pts), [pts])

  const polygon = (): GeoJSON.Polygon | null => {
    if (mode === 'paste') {
      if (!geoText.trim()) return null
      const g = JSON.parse(geoText) as GeoJSON.GeoJsonObject
      if (g.type === 'Polygon') return g as GeoJSON.Polygon
      if (g.type === 'Feature' && (g as GeoJSON.Feature).geometry.type === 'Polygon') return (g as GeoJSON.Feature).geometry as GeoJSON.Polygon
      throw new Error('GeoJSON Polygon bekleniyor')
    }
    if (pts.length < 3) return null
    const ring = [...pts, pts[0]].map(([lat, lon]) => [lon, lat])
    return { type: 'Polygon', coordinates: [ring] }
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      const p = polygon()
      await api.createSite(customerId, { name, polygon: p, grass_area_m2: p ? Math.round(mode === 'draw' ? area : 0) : 0, notes })
      onSaved()
    } catch (ex) { setErr(ex) } finally { setBusy(false) }
  }
  return (
    <Modal title="Saha çiz" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Saha adı</label><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="İmrahor Millet Bahçesi · A bölgesi" /></div>
        <div className="chips" style={{ marginBottom: 12 }}>
          <button type="button" className={`chip ${mode === 'draw' ? 'active' : ''}`} onClick={() => setMode('draw')}>Haritada çiz</button>
          <button type="button" className={`chip ${mode === 'paste' ? 'active' : ''}`} onClick={() => setMode('paste')}>GeoJSON yapıştır</button>
        </div>
        {mode === 'draw' ? (
          <>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>Köşeleri sırayla tıklayın. {pts.length} nokta · ≈ {fmt0(area)} m²</p>
            <div className="map-box" style={{ height: 300 }}>
              <MapContainer center={DEFAULT_CENTER} zoom={16} style={{ height: '100%' }}>
                <Tiles />
                <ClickCollector onAdd={(p) => setPts((x) => [...x, p])} />
                {pts.length >= 2 && <Polygon positions={pts} pathOptions={{ color: '#1E6B3C', fillColor: '#A6D277', fillOpacity: 0.4 }} />}
              </MapContainer>
            </div>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button type="button" className="btn sm" onClick={() => setPts((x) => x.slice(0, -1))} disabled={!pts.length}>Son noktayı geri al</button>
              <button type="button" className="btn sm" onClick={() => setPts([])} disabled={!pts.length}>Temizle</button>
            </div>
          </>
        ) : (
          <div className="field"><label>GeoJSON Polygon</label><textarea value={geoText} onChange={(e) => setGeoText(e.target.value)} placeholder='{"type":"Polygon","coordinates":[[[32.88,39.86],…]]}' /></div>
        )}
        <div className="field" style={{ marginTop: 12 }}><label>Not</label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <ErrorBox error={err} />
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button className="btn primary" disabled={busy}>Kaydet</button></div>
      </form>
    </Modal>
  )
}

// ---------------- Müşteri formu ----------------
function CustomerModal({ customer, onClose, onSaved }: { customer?: Customer; onClose: () => void; onSaved: (c: Customer) => void }) {
  const [f, setF] = useState({ name: customer?.name ?? '', city: customer?.city ?? '', contract_start: customer?.contract_start ?? '', contract_end: customer?.contract_end ?? '' })
  const [err, setErr] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      const body = { ...f, contract_start: f.contract_start || null, contract_end: f.contract_end || null }
      const r = customer ? await api.updateCustomer(customer.id, body) : await api.createCustomer(body)
      onSaved(r)
    } catch (ex) { setErr(ex) } finally { setBusy(false) }
  }
  return (
    <Modal title={customer ? 'Müşteriyi düzenle' : 'Yeni müşteri'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Şirket / kurum adı</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label>Şehir</label><input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
        <div className="field"><label>Sözleşme başlangıcı</label><input type="date" value={f.contract_start} onChange={(e) => setF({ ...f, contract_start: e.target.value })} /></div>
        <div className="field"><label>Sözleşme bitişi</label><input type="date" value={f.contract_end} onChange={(e) => setF({ ...f, contract_end: e.target.value })} /></div>
        <ErrorBox error={err} />
        <div className="actions"><button type="button" className="btn" onClick={onClose}>Vazgeç</button><button className="btn primary" disabled={busy}>Kaydet</button></div>
      </form>
    </Modal>
  )
}
