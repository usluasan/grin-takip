import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useCustomer } from '../customer'
import { useAsync } from '../hooks'
import { subscribeLive } from '../ws'
import { DEFAULT_CENTER, FitTo, FlyTo, MachineMarker, MapContainer, SitePolygon, Swath, Tiles } from '../components/Map'
import { IcSearch } from '../components/Icons'
import { ErrorBox } from '../components/ui'
import type { LiveMachine, TrackResponse } from '../types'
import { agoShort, daysAgoIso, fixLabel, fmt0, fmt1, fmtTime, kgToTon, mmToCm, stateColor, stateLabel, todayIso, uiState } from '../util'

type Filter = 'live' | 'today' | 'week'
const filterFrom: Record<Filter, string> = { live: todayIso(), today: todayIso(), week: daysAgoIso(7) }

export default function LiveMap() {
  const { selectedId } = useCustomer()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('live')
  const [q, setQ] = useState('')
  const [satellite, setSatellite] = useState(true)
  const selected = params.get('m') ? Number(params.get('m')) : null
  const setSelected = (id: number | null) => setParams(id ? { m: String(id) } : {})

  const live = useAsync(() => api.live(selectedId), [selectedId], { interval: 30000 })
  const sites = useAsync(() => (selectedId ? api.sites(selectedId) : Promise.resolve([])), [selectedId])
  const sessions = useAsync(() => api.sessions({ customer_id: selectedId, from: todayIso() }), [selectedId], { interval: 60000 })
  const [machines, setMachines] = useState<LiveMachine[]>([])
  useEffect(() => { if (live.data) setMachines(live.data) }, [live.data])

  // WS canlı güncelleme
  useEffect(() => {
    const off = subscribeLive((msg) => {
      if (msg.type !== 'telemetry') return
      setMachines((prev) => prev.map((m) => (m.device_id === msg.device_id || (msg.machine_id != null && m.machine_id === msg.machine_id))
        ? { ...m, lat: msg.data.lat, lon: msg.data.lon, hdg: msg.data.hdg, spd: msg.data.spd, fix: msg.data.fix, hacc: msg.data.hacc, h_pre: msg.data.h_pre, h_post: msg.data.h_post, bat: msg.data.bat, state: msg.data.state, last_seen: new Date(msg.data.ts * 1000).toISOString() }
        : m))
    })
    return off
  }, [live.data == null]) // eslint-disable-line react-hooks/exhaustive-deps

  // Şeritler: seçili filtreye göre tüm makinelerin track'i
  const [tracks, setTracks] = useState<Record<number, TrackResponse>>({})
  useEffect(() => {
    let alive = true
    const ids = machines.map((m) => m.machine_id)
    Promise.all(ids.map((id) => api.track(id, filterFrom[filter]).then((t) => [id, t] as const).catch(() => null))).then((rs) => {
      if (!alive) return
      const o: Record<number, TrackResponse> = {}
      rs.forEach((r) => { if (r) o[r[0]] = r[1] })
      setTracks(o)
    })
    return () => { alive = false }
  }, [machines.map((m) => m.machine_id).join(','), filter]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase()
    return machines.filter((m) => !t || [m.name, m.site_name, m.operator_name, m.customer_name].some((x) => x?.toLowerCase().includes(t)))
  }, [machines, q])
  const sel = machines.find((m) => m.machine_id === selected) ?? null
  const points = machines.filter((m) => m.lat != null).map((m) => [m.lat!, m.lon!] as [number, number])
  const running = machines.filter((m) => uiState(m.state, m.last_seen) === 'mowing').length

  const todaySum = useMemo(() => {
    const s = sessions.data ?? []
    return { n: s.length, area: s.reduce((a, x) => a + (x.area_m2 || 0), 0), kg: s.reduce((a, x) => a + (x.savings?.grass_kg ?? 0), 0), co2: s.reduce((a, x) => a + (x.savings?.co2_total_kg ?? 0), 0) }
  }, [sessions.data])

  return (
    <main className="main flush">
      <div className="live-head">
        <h1>Canlı harita</h1>
        <div className="toolbar">
          <div className="chips">
            {(['live', 'today', 'week'] as Filter[]).map((f) => (
              <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'live' ? 'Canlı' : f === 'today' ? 'Bugün' : 'Bu hafta'}
              </button>
            ))}
            <button className="chip" onClick={() => setSatellite((s) => !s)}>{satellite ? 'Harita' : 'Uydu'}</button>
          </div>
          <div className="search"><IcSearch /><input placeholder="Makine, saha veya müşteri ara" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
      </div>
      <ErrorBox error={live.error} />
      <div className="live-wrap">
        <div className="live-map">
          <MapContainer center={DEFAULT_CENTER} zoom={15} style={{ height: '100%' }} attributionControl={true}>
            <Tiles satellite={satellite} />
            {!selected && <FitTo points={points} />}
            <FlyTo pos={sel && sel.lat != null ? [sel.lat, sel.lon!] : null} />
            {(sites.data ?? []).map((s) => <SitePolygon key={s.id} id={`site-${s.id}`} polygon={s.polygon} label={`${s.name} · ${fmt0(s.grass_area_m2)} m²`} />)}
            {Object.values(tracks).map((t) => (
              t.sessions?.length
                ? t.sessions.map((s) => <Swath key={`${t.machine_id}-${s.id}`} id={`sw-${t.machine_id}-${s.id}`} data={s.swath} past={!s.is_today} />)
                : <Swath key={t.machine_id} id={`sw-${t.machine_id}-${filter}`} data={t.swath} past={filter === 'week'} />
            ))}
            {visible.map((m) => (
              <MachineMarker key={m.machine_id} m={m} selected={m.machine_id === selected} onClick={() => setSelected(m.machine_id)}
                popup={<MachinePopup m={m} />} />
            ))}
          </MapContainer>
          <div className="legend">
            <span><i className="line" />Bugün biçildi</span>
            <span><i className="line" style={{ background: '#A6D277' }} />Daha önce biçildi</span>
            <span><i className="line" style={{ background: '#D6E8C4' }} />Biçilmedi</span>
          </div>
          <div className="map-note">Harita: {import.meta.env.VITE_GOOGLE_MAPS_KEY ? 'Google Maps' : 'OpenStreetMap'} · Konum: RTK/TUSAGA-Aktif</div>
        </div>
        <aside className="live-side">
          <div className="card-head" style={{ marginBottom: 12 }}>
            <h2>Makineler</h2>
            <span className="hint">{running} çalışıyor · {machines.length} toplam</span>
          </div>
          {visible.map((m) => {
            const s = uiState(m.state, m.last_seen)
            const right = s === 'mowing' ? fmtTime(m.session_started_at) : s === 'idle' ? agoShort(m.last_seen) : s === 'transport' ? `${fmt0((m.spd ?? 0) * 3.6)} km/sa` : agoShort(m.last_seen)
            return (
              <div key={m.machine_id} className={`mcard ${m.machine_id === selected ? 'sel' : ''}`} onClick={() => setSelected(m.machine_id === selected ? null : m.machine_id)}>
                <i className="dot" style={{ background: stateColor[s] }} />
                <div>
                  <div className="t">{m.name} <span>· {m.operator_name ?? '—'}</span></div>
                  <div className="s">{m.site_name ?? '—'}</div>
                </div>
                <div className="r"><b>{stateLabel[s]}</b><span>{right}</span></div>
              </div>
            )
          })}
          <div className="today-box">
            <b>Bugün toplam</b>
            {todaySum.n} oturum · {fmt0(todaySum.area)} m² · {fmt0(todaySum.kg)} kg çim sahada kaldı · {fmt0(todaySum.co2)} kg CO₂e önlendi
            {todaySum.co2 > 1000 && <> ({kgToTon(todaySum.co2)} t)</>}
          </div>
        </aside>
      </div>
    </main>
  )
}

function MachinePopup({ m }: { m: LiveMachine }) {
  const s = uiState(m.state, m.last_seen)
  return (
    <>
      <b>{m.name} · {stateLabel[s]}</b><br />
      {m.operator_name ?? '—'}{m.session_started_at ? ` · ${fmtTime(m.session_started_at)}'den beri` : ''}<br />
      Çim {mmToCm(m.h_pre)} → {mmToCm(m.h_post)} cm · {fmt0(m.today_area_m2)} m²<br />
      <span className="lime">{fixLabel(m.fix)}{m.hacc != null ? ` · ${fmt1(m.hacc * 100)} cm` : ''}</span>
    </>
  )
}
