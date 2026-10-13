// WS /ws/live?token= — canlı telemetri yayını (SPEC §6). Demo modunda sahte hareket üretir.
import { getToken, isDemo } from './api'
import { mockLive } from './mock'
import type { LiveMessage, Telemetry } from './types'

type Listener = (msg: LiveMessage) => void

export function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws/live?token=${encodeURIComponent(getToken() ?? '')}`
}

/** Canlı akışa abone ol. Dönen fonksiyon aboneliği kapatır. */
export function subscribeLive(onMessage: Listener): () => void {
  if (isDemo()) return demoFeed(onMessage)

  let ws: WebSocket | null = null
  let closed = false
  let retry = 1000

  const connect = () => {
    if (closed) return
    try { ws = new WebSocket(wsUrl()) } catch { scheduleRetry(); return }
    ws.onopen = () => { retry = 1000 }
    ws.onmessage = (ev) => {
      try {
        const raw = JSON.parse(ev.data as string)
        // Sunucu: {device_id, machine_id, type: telemetry|status|event, data:{...paket}}; {type:'hello'} yoksayılır.
        // Düz telemetri paketi (ts+lat alanlı) de kabul edilir.
        let msg: LiveMessage | null = null
        if (raw && raw.data && raw.device_id && (raw.type === 'telemetry' || raw.type === 'status' || raw.type === 'event')) msg = raw as LiveMessage
        else if (raw && raw.device_id && typeof raw.ts === 'number' && 'lat' in raw) msg = { device_id: raw.device_id, machine_id: raw.machine_id, type: 'telemetry', data: raw as Telemetry }
        if (msg) onMessage(msg)
      } catch { /* bozuk paket */ }
    }
    ws.onclose = scheduleRetry
    ws.onerror = () => { ws?.close() }
  }
  const scheduleRetry = () => {
    if (closed) return
    setTimeout(connect, retry)
    retry = Math.min(retry * 2, 15000)
  }
  connect()
  return () => { closed = true; ws?.close() }
}

/** Demo: biçen makineleri her saniye doğuya doğru biraz kaydır. */
function demoFeed(onMessage: Listener): () => void {
  const pos = new Map<number, { lat: number; lon: number; dir: number }>()
  mockLive.forEach((m) => { if (m.lat != null && m.lon != null) pos.set(m.machine_id, { lat: m.lat, lon: m.lon, dir: 1 }) })
  const id = setInterval(() => {
    mockLive.forEach((m) => {
      if (m.state !== 'mowing') return
      const p = pos.get(m.machine_id); if (!p) return
      p.lon += 0.0000110 * p.dir
      if (p.lon > (m.lon ?? 0) + 0.0015) { p.dir = -1; p.lat += 0.00012 }
      if (p.lon < (m.lon ?? 0) - 0.0015) { p.dir = 1; p.lat += 0.00012 }
      const t: Telemetry = {
        v: 1, ts: Math.floor(Date.now() / 1000), fix: 4, lat: p.lat, lon: p.lon, hacc: 0.02, spd: 0.9, hdg: p.dir > 0 ? 90 : 270,
        h_pre: m.h_pre ?? 80, h_post: m.h_post ?? 40, us_pre: 83, us_post: 41, vib: 2.7, state: 'mowing', temp: 24.1, hum: 41, soil: [28, 31], bat: m.bat ?? 3.9, seq: Math.floor(Date.now() / 1000) % 100000,
      }
      onMessage({ device_id: m.device_id, machine_id: m.machine_id, type: 'telemetry', data: t })
    })
  }, 1000)
  return () => clearInterval(id)
}
