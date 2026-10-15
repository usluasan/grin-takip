// SPEC.md §2–§6 ile uyumlu tipler

export type Role = 'admin' | 'manager' | 'operator'
export type MachineState = 'mowing' | 'idle' | 'transport' | 'off'

export interface User {
  id: number
  customer_id: number | null
  email: string
  full_name: string
  role: Role
  is_active: boolean
  created_at?: string
  assigned_machine_id?: number | null
  machine_name?: string | null
  status?: 'active' | 'invited'
}

export interface LoginResponse {
  token: string
  user: User
}

export interface Customer {
  id: number
  name: string
  city: string | null
  contract_start: string | null
  contract_end: string | null
  created_at?: string
  site_count?: number
  machine_count?: number
  user_count?: number
}

export interface Site {
  id: number
  customer_id: number
  name: string
  polygon: GeoJSON.Polygon | null
  grass_area_m2: number
  notes?: string | null
  district?: string | null   // backend hesaplamaz (yalnız demo)
  zone_count?: number        // backend hesaplamaz (yalnız demo)
  week_pct?: number | null   // bu hafta biçilen alan / çim alanı × 100
}

export interface Machine {
  id: number
  customer_id: number
  name: string
  model: string | null
  cut_width_cm: number
  device_id: string
  assigned_user_id: number | null
  assigned_user_name?: string | null
  created_at?: string
  state?: MachineState | 'offline'
  month_area_m2?: number
  bat_pct?: number | null
  last_seen?: string | null
}

export interface MachineCreated extends Machine {
  device_token: string
}

/** GET /machines/live — makine başına son konum + durum */
export interface LiveMachine {
  machine_id: number
  name: string
  device_id: string
  customer_id: number
  customer_name?: string
  operator_name?: string | null
  site_name?: string | null
  state: MachineState | 'offline'
  lat: number | null
  lon: number | null
  hdg?: number | null
  spd?: number | null
  fix?: number
  hacc?: number | null
  sats?: number | null
  h_pre?: number | null
  h_post?: number | null
  bat?: number | null
  bat_pct?: number | null
  rssi?: number | null
  last_seen: string | null
  session_started_at?: string | null
  today_area_m2?: number
}

/** WS /ws/live — SPEC §3.1 telemetri + device_id */
export interface Telemetry {
  v: number
  ts: number
  fix: number
  lat: number
  lon: number
  hacc: number
  spd: number
  hdg: number
  h_pre: number
  h_post: number
  us_pre: number
  us_post: number
  vib: number
  state: MachineState
  temp: number
  hum: number
  soil: number[]
  bat: number
  seq: number
}
/** SPEC §3.2 durum paketi */
export interface StatusPacket {
  v: number
  ts: number
  bat?: number
  rssi?: number
  fw?: string
  sd_free_mb?: number
  ntrip?: boolean
  sats?: number
  /** fw 0.4.0+: montaj yüksekliği kalibre mi */
  cal?: boolean
}
/** SPEC §3.3 olay paketi */
export interface EventPacket {
  v: number
  ts: number
  type: 'session_start' | 'session_end' | 'calibrated' | 'error'
  msg?: string
}
/** WS mesajı: {device_id, machine_id, type, data}. type ayrıştırıcıdır; ilk mesaj {type:'hello'} istemcide yoksayılır. */
export type LiveMessage =
  | { device_id: string; machine_id?: number; machine?: string; type: 'telemetry'; data: Telemetry }
  | { device_id: string; machine_id?: number; machine?: string; type: 'status'; data: StatusPacket }
  | { device_id: string; machine_id?: number; machine?: string; type: 'event'; data: EventPacket }

export interface TrackResponse {
  machine_id: number
  from: string
  to: string
  track: GeoJSON.LineString | GeoJSON.MultiLineString | null
  swath: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  sessions?: Array<{ id: number; swath: GeoJSON.Polygon | GeoJSON.MultiPolygon | null; is_today: boolean }>
  summary?: { n_points: number; n_good: number; fix_ratio: number; area_m2: number; overlap_m2: number; dist_m: number; h_pre_avg: number | null; h_post_avg: number | null }
}

export interface Savings {
  session_id?: number
  grass_kg: number
  bags: number
  trips: number
  diesel_l: number
  co2_disposal_kg: number
  co2_transport_kg: number
  co2_bags_kg: number
  co2_total_kg: number
  factors_version?: string | null
  computed_at?: string | null
}

export interface Session {
  id: number
  machine_id: number
  machine_name?: string
  machine_model?: string | null
  device_id?: string
  operator_id: number | null
  operator_name?: string | null
  site_id: number | null
  site_name?: string | null
  started_at: string
  ended_at: string | null
  area_m2: number
  overlap_m2: number
  dist_m: number
  h_pre_avg: number | null
  h_post_avg: number | null
  fix_ratio: number | null
  hacc_avg?: number | null
  temp_avg?: number | null
  hum_avg?: number | null
  soil_avg?: number | null
  track?: GeoJSON.LineString | null
  swath?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  note: string | null
  /** URL listesi: /api/v1/uploads/<dosya> (sunucu) ya da data: URL (çevrimdışı geri dönüş) */
  photos: string[]
  status: 'open' | 'closed'
  savings?: Savings | null
}
/** POST /sessions/{id}/photos yanıtı: güncel oturum + yüklenen dosyanın URL'si */
export type SessionPhotoResponse = Session & { url: string }

export interface DashboardAlert {
  level: 'warn' | 'ok' | 'info'
  title: string
  detail: string
}
export interface DashboardMachineRow {
  machine_id: number
  name: string
  state: MachineState | 'offline'
  site_name: string | null
  today_area_m2: number
  last_seen: string | null
}
export interface Dashboard {
  period: 'day' | 'month' | 'season'
  from?: string
  to?: string
  customer_id?: number | null
  sessions?: number
  area_m2: number
  area_change_pct: number | null
  grass_kg: number
  bags: number
  co2_total_kg: number
  machines_active: number
  machines_total: number
  machines_silent: number
  daily: Array<{ date: string; area_m2: number }>
  machines: DashboardMachineRow[]
  alerts: DashboardAlert[]
}

export interface AuditRow {
  item: string
  formula: string
  input: string
  factor: string
  source: string
  is_assumption: boolean
  result: string
}
export interface SavingsReport {
  customer_id: number | null
  customer_name?: string | null
  from: string | null
  to: string | null
  area_m2: number
  h_cut_avg_cm: number | null
  sessions?: number
  totals: Savings
  /** from yılının ayları (Ocak → bugün/Aralık) */
  monthly: Array<{ month: string; co2_total_kg: number }>
  by_site: Array<{ site_id: number; site_name: string; co2_total_kg: number; area_m2?: number }>
  audit: AuditRow[]
  season_total_kg?: number
  season_target_kg?: number   // backend hesaplamaz (hedef tanımı yok)
  factors_version?: string | null
}

export interface Factor {
  key: string
  value: number
  unit: string
  source: string
  is_assumption: boolean
  updated_at?: string
}
