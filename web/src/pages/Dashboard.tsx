import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { CustomerSelect, useCustomer } from '../customer'
import { useAsync } from '../hooks'
import { DEFAULT_CENTER, FitTo, MachineMarker, MapContainer, Swath, Tiles } from '../components/Map'
import { Bars, ErrorBox, Loading } from '../components/ui'
import { fmt0, kgToTon, stateColor, uiState } from '../util'

type Period = 'day' | 'month' | 'season'
const periodLabel: Record<Period, string> = { day: 'Bugün', month: 'Bu ay', season: 'Sezon' }

export default function Dashboard() {
  const { selectedId } = useCustomer()
  const [period, setPeriod] = useState<Period>('month')
  const dash = useAsync(() => api.dashboard({ customer_id: selectedId, period }), [selectedId, period], { interval: 60000 })
  const live = useAsync(() => api.live(selectedId), [selectedId], { interval: 15000 })
  const d = dash.data
  const mowing = (live.data ?? []).filter((m) => uiState(m.state, m.last_seen) === 'mowing')
  const track = useAsync(async () => {
    const ids = mowing.slice(0, 4).map((m) => m.machine_id)
    const r = await Promise.all(ids.map((id) => api.track(id).catch(() => null)))
    return r.filter(Boolean)
  }, [mowing.map((m) => m.machine_id).join(',')])

  const points = (live.data ?? []).filter((m) => m.lat != null && m.lon != null).map((m) => [m.lat!, m.lon!] as [number, number])

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <div className="eyebrow">Genel bakış</div>
          <h1>Bugün sahada ne oluyor?</h1>
        </div>
        <div className="toolbar">
          <CustomerSelect />
          <div className="select-wrap">
            <label>Dönem</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              {(Object.keys(periodLabel) as Period[]).map((p) => <option key={p} value={p}>{periodLabel[p]}</option>)}
            </select>
          </div>
          <button className="btn primary" onClick={() => window.print()}>Rapor indir (PDF)</button>
        </div>
      </div>

      <ErrorBox error={dash.error} />
      <div className="kpis">
        <div className="card kpi">
          <div className="label">Biçilen alan · {periodLabel[period].toLowerCase()}</div>
          <div className="value">{fmt0(d?.area_m2)}<small>m²</small></div>
          <div className={`foot ${d?.area_change_pct != null && d.area_change_pct >= 0 ? 'up' : 'warn'}`}>
            {d?.area_change_pct != null ? `${d.area_change_pct >= 0 ? '▲' : '▼'} %${Math.abs(d.area_change_pct)} önceki döneme göre` : '—'}
          </div>
        </div>
        <div className="card kpi">
          <div className="label">Önlenen atık</div>
          <div className="value">{kgToTon(d?.grass_kg)}<small>ton çim</small></div>
          <div className="foot">≈ {fmt0(d?.bags)} çöp poşeti</div>
        </div>
        <div className="card kpi dark">
          <div className="label">Önlenen CO₂e</div>
          <div className="value">{kgToTon(d?.co2_total_kg)}<small>ton</small></div>
          <div className="foot">nakliye + bertaraf, DEFRA 2025</div>
        </div>
        <div className="card kpi">
          <div className="label">Makineler</div>
          <div className="value">{d?.machines_active ?? '—'}<small>/ {d?.machines_total ?? '—'} çalışıyor</small></div>
          <div className={`foot ${d?.machines_silent ? 'warn' : ''}`}>
            {d?.machines_silent ? `${d.machines_silent} makine 3 gündür veri yollamadı` : 'Tüm makineler veri yolluyor'}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Canlı filo</h2>
            <Link to="/harita">Tam haritayı aç →</Link>
          </div>
          <div className="map-box" style={{ height: 420 }}>
            <MapContainer center={DEFAULT_CENTER} zoom={15} style={{ height: '100%' }} scrollWheelZoom={false} zoomControl={false} attributionControl={false}>
              <Tiles />
              <FitTo points={points} />
              {(track.data ?? []).map((t) => t && <Swath key={t.machine_id} id={`sw-${t.machine_id}`} data={t.swath} />)}
              {(live.data ?? []).map((m) => (
                <MachineMarker key={m.machine_id} m={m} popup={<><b>{m.name}</b><br />{m.site_name ?? '—'}</>} />
              ))}
            </MapContainer>
            <div className="legend">
              <span><i className="dot" style={{ background: stateColor.mowing }} />Biçiyor</span>
              <span><i className="dot" style={{ background: stateColor.idle }} />Duruyor</span>
              <span><i className="dot" style={{ background: stateColor.offline }} />Çevrimdışı</span>
              <span><i className="line" />Bugün biçilen</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>Makine durumu</h2></div>
          {dash.loading && !d ? <Loading /> : (
            <div className="machine-list">
              {(d?.machines ?? []).map((m) => {
                const s = uiState(m.state, m.last_seen)
                return (
                  <div className="machine-row" key={m.machine_id}>
                    <i className="dot" style={{ background: stateColor[s] }} />
                    <div>
                      <div className="name">{m.name}</div>
                      <div className="site">{m.site_name ?? '—'}</div>
                    </div>
                    <div className="right"><b>{fmt0(m.today_area_m2)}</b><span>m² bugün</span></div>
                  </div>
                )
              })}
            </div>
          )}
          <p style={{ marginTop: 14, marginBottom: 0 }}><Link to="/makineler">Tüm makineler →</Link></p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Günlük biçilen alan · son 14 gün</h2>
            <span className="hint">m² / gün</span>
          </div>
          <Bars data={(d?.daily ?? []).slice(-14).map((x) => ({ label: String(new Date(x.date).getDate()), value: x.area_m2, display: fmt0(x.area_m2) }))} />
        </div>
        <div className="card">
          <div className="card-head"><h2>Uyarılar</h2></div>
          {(d?.alerts ?? []).map((a, i) => (
            <div className={`alert ${a.level}`} key={i}>
              <span className="ic">{a.level === 'ok' ? '✓' : '!'}</span>
              <div><b>{a.title}</b><span>{a.detail}</span></div>
            </div>
          ))}
          {d && d.alerts.length === 0 && <Loading text="Uyarı yok" />}
        </div>
      </div>
    </main>
  )
}
