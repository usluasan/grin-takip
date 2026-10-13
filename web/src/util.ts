import type { MachineState } from './types'

const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmt0 = (n: number | null | undefined) => (n == null ? '—' : nf0.format(n))
export const fmt1 = (n: number | null | undefined) => (n == null ? '—' : nf1.format(n))
export const fmt2 = (n: number | null | undefined) => (n == null ? '—' : nf2.format(n))
/** kg → "4,6" ton */
export const kgToTon = (kg: number | null | undefined, d: 1 | 2 = 1) => (kg == null ? '—' : (d === 1 ? nf1 : nf2).format(kg / 1000))
/** mm → cm, 1 ondalık */
export const mmToCm = (mm: number | null | undefined) => (mm == null || mm < 0 ? '—' : nf1.format(mm / 10))

export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—'
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
export const fmtDateLong = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
export const fmtMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('tr-TR', { month: 'short' }).replace('.', '')
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 10) return 'şimdi'
  if (s < 60) return `${Math.round(s)} sn önce`
  if (s < 3600) return `${Math.round(s / 60)} dk önce`
  if (s < 86400) return `${Math.round(s / 3600)} sa önce`
  return `${Math.round(s / 86400)} gün önce`
}
export function agoShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'şimdi'
  if (s < 3600) return `${Math.round(s / 60)} dk`
  if (s < 86400) return `${Math.round(s / 3600)} sa`
  return `${Math.round(s / 86400)} gün`
}

export function duration(startIso: string, endIso?: string | null, style: 'clock' | 'words' = 'clock'): string {
  const ms = (endIso ? new Date(endIso).getTime() : Date.now()) - new Date(startIso).getTime()
  const m = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(m / 60), mm = m % 60
  if (style === 'words') return h ? `${h} sa ${mm} dk` : `${mm} dk`
  return `${h}:${String(mm).padStart(2, '0')}`
}

export type UiState = 'mowing' | 'idle' | 'transport' | 'offline'
export function uiState(s: MachineState | 'offline' | undefined, lastSeen?: string | null): UiState {
  if (!s || s === 'off' || s === 'offline') return 'offline'
  if (lastSeen && Date.now() - new Date(lastSeen).getTime() > 10 * 60000) return 'offline'
  return s
}
export const stateLabel: Record<UiState, string> = { mowing: 'Biçiyor', idle: 'Duruyor', transport: 'Taşınıyor', offline: 'Çevrimdışı' }
export const stateColor: Record<UiState, string> = { mowing: '#1E6B3C', idle: '#C7761B', transport: '#3E6FB8', offline: '#8E9A91' }

export function fixLabel(fix: number | undefined | null): string {
  switch (fix) { case 4: return 'RTK sabit'; case 5: return 'RTK float'; case 2: return 'DGPS'; case 1: return 'GPS'; default: return 'Konum yok' }
}
export function batPct(v: number | null | undefined): number | null {
  if (v == null) return null
  // Li-ion 1S yaklaşık: 3,3 V = %0, 4,2 V = %100 (kaba; firmware gerçek yüzdeyi gönderirse o kullanılır)
  return Math.max(0, Math.min(100, Math.round(((v - 3.3) / 0.9) * 100)))
}
export function signalLabel(rssi: number | null | undefined): string {
  if (rssi == null) return '—'
  if (rssi >= -75) return '4G iyi'
  if (rssi >= -85) return '4G orta'
  return '4G zayıf'
}
export const todayIso = () => new Date().toISOString().slice(0, 10)
export const daysAgoIso = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
