import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMap } from 'react-leaflet'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { useAsync } from '../../hooks'
import { subscribeLive } from '../../ws'
import { DEFAULT_CENTER, MachineMarker, MapContainer, Swath, Tiles } from '../../components/Map'
import { IcBattery, IcLocate, IcSave, IcSignal } from '../../components/Icons'
import { ErrorBox, StatePill } from '../../components/ui'
import type { LiveMachine, Session } from '../../types'
import { ago, batPct, duration, fixLabel, fmt0, fmt1, mmToCm, signalLabel, todayIso, uiState } from '../../util'

function Recenter({ pos, trigger }: { pos: [number, number] | null; trigger: number }) {
  const map = useMap()
  useEffect(() => { if (pos) map.setView(pos, Math.max(map.getZoom(), 18)) }, [trigger]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pos && trigger === 0) map.setView(pos, 18) }, [pos != null]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export default function OperatorLive() {
  const { user } = useAuth()
  const nav = useNavigate()
  const live = useAsync(() => api.live(), [], { interval: 30000 })
  const [m, setM] = useState<LiveMachine | null>(null)
  const [tick, setTick] = useState(0)
  const [recenter, setRecenter] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)

  // Operatörün makinesi: atanmış olan, yoksa ilk
  useEffect(() => {
    if (!live.data?.length) return
    const mine = live.data.find((x) => x.machine_id === user?.assigned_machine_id) ?? live.data.find((x) => x.operator_name && user?.full_name.startsWith(x.operator_name.split(' ')[0])) ?? live.data[0]
    setM((prev) => (prev && prev.machine_id === mine.machine_id ? { ...mine, lat: prev.lat ?? mine.lat, lon: prev.lon ?? mine.lon } : mine))
  }, [live.data, user])

  useEffect(() => {
    if (!m) return
    const off = subscribeLive((msg) => {
      if (msg.type !== 'telemetry') return
      if (msg.device_id !== m.device_id && msg.machine_id !== m.machine_id) return
      setM((p) => p && { ...p, lat: msg.data.lat, lon: msg.data.lon, fix: msg.data.fix, hacc: msg.data.hacc, h_pre: msg.data.h_pre, h_post: msg.data.h_post, bat: msg.data.bat, state: msg.data.state, last_seen: new Date(msg.data.ts * 1000).toISOString() })
    })
    return off
  }, [m?.machine_id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id) }, [])

  const track = useAsync(() => (m ? api.track(m.machine_id, todayIso()) : Promise.resolve(null)), [m?.machine_id], { interval: 60000 })
  const sessions = useAsync(() => (m ? api.sessions({ machine_id: m.machine_id, from: todayIso() }) : Promise.resolve([] as Session[])), [m?.machine_id], { interval: 30000 })
  const open = useMemo(() => (sessions.data ?? []).find((s) => s.status === 'open') ?? null, [sessions.data])
  const todayArea = (sessions.data ?? []).reduce((a, s) => a + (s.area_m2 || 0), 0) || m?.today_area_m2 || 0
  const todaySav = (sessions.data ?? []).reduce((a, s) => ({ kg: a.kg + (s.savings?.grass_kg ?? 0), bags: a.bags + (s.savings?.bags ?? 0), co2: a.co2 + (s.savings?.co2_total_kg ?? 0) }), { kg: 0, bags: 0, co2: 0 })

  const st = uiState(m?.state, m?.last_seen)
  const pos: [number, number] | null = m && m.lat != null ? [m.lat, m.lon!] : null
  const since = open?.started_at ?? m?.session_started_at ?? null
  void tick

  const finish = async () => {
    if (!open) { setErr(new Error('Açık iş yok.')); return }
    if (!confirm('İş bitirilsin mi? Alan ve tasarruf hesaplanacak.')) return
    setBusy(true); setErr(null)
    try { const s = await api.closeSession(open.id); nav(`/saha/isler/${s.id}`) } catch (ex) { setErr(ex) } finally { setBusy(false) }
  }
  const pause = async () => {
    if (!m) return
    setBusy(true); setErr(null)
    try { await api.deviceCmd(m.device_id, { cmd: 'interval', sec: 30 }); alert('Mola: modül 30 sn aralığa geçti. Biçmeye başlayınca otomatik devam eder.') } catch (ex) { setErr(ex) } finally { setBusy(false) }
  }

  return (
    <div className="op-body">
      <div className="op-head">
        <div>
          <div className="hi">Merhaba {user?.full_name.split(' ')[0]}</div>
          <h1>{m?.name ?? '—'} · {(m?.site_name ?? '').split(' ·')[0] || '—'}</h1>
        </div>
        <StatePill state={m?.state} lastSeen={m?.last_seen} />
      </div>

      <div className="op-map">
        <MapContainer center={pos ?? DEFAULT_CENTER} zoom={17} style={{ height: '100%' }} zoomControl={false} attributionControl={false}>
          <Tiles />
          <Recenter pos={pos} trigger={recenter} />
          {track.data && <Swath id={`sw-${m?.machine_id}`} data={track.data.swath} />}
          {m && <MachineMarker m={m} selected />}
        </MapContainer>
        <div className="rtk-pill">
          <i className="dot" style={{ background: (m?.fix ?? 0) >= 4 ? 'var(--forest)' : 'var(--warn)' }} />
          <span style={{ color: (m?.fix ?? 0) >= 4 ? 'var(--forest)' : 'var(--warn)' }}>{fixLabel(m?.fix)}</span>
          <span>{m?.hacc != null ? `${fmt1(m.hacc * 100)} cm` : ''}{m?.sats != null ? ` · ${m.sats} uydu` : ''}</span>
        </div>
        <button className="locate-btn" onClick={() => setRecenter((x) => x + 1)} aria-label="Konumuma git"><IcLocate /></button>
      </div>

      <div className="tiles">
        <div className="tile"><div className="l">Bugün</div><div className="v">{fmt0(todayArea)}</div><div className="u">m²</div></div>
        <div className="tile"><div className="l">Çim boyu</div><div className="v">{mmToCm(m?.h_pre)}→{mmToCm(m?.h_post)}</div><div className="u">cm önce → sonra</div></div>
        <div className="tile"><div className="l">Süre</div><div className="v">{since ? duration(since) : '—'}</div><div className="u">{since ? `${new Date(since).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'den beri` : 'iş yok'}</div></div>
      </div>

      <div className="save-card">
        <IcSave className="lime-ic" width={32} height={32} />
        <div>
          <b>Bugün {fmt0(todaySav.kg)} kg çim sahada kaldı</b>
          <span>≈ {fmt0(todaySav.bags)} poşet · {fmt0(todaySav.co2)} kg CO₂e önlendi</span>
        </div>
      </div>

      <div className="status-line">
        <span><IcBattery style={{ verticalAlign: -4 }} /> Modül pil %{m?.bat_pct ?? batPct(m?.bat) ?? '—'}</span>
        <span><IcSignal style={{ verticalAlign: -4 }} /> {signalLabel(m?.rssi)}</span>
        <span>Son veri: {ago(m?.last_seen)}</span>
      </div>
      <ErrorBox error={err ?? live.error} />
      <div className="op-actions">
        <button className="btn" onClick={finish} disabled={busy || !open}>İşi bitir</button>
        <button className="btn primary" onClick={pause} disabled={busy || st === 'offline'}>Mola ver</button>
      </div>
    </div>
  )
}
