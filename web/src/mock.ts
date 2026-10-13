// Demo verisi — tasarım ekranlarındaki sayılarla eşleşir. API'ye ulaşılamadığında kullanılır.
import type {
  Customer, Dashboard, Factor, LiveMachine, Machine, SavingsReport, Session, Site, TrackResponse, User,
} from './types'

// İmrahor Millet Bahçesi civarı (Ankara)
const C = { lat: 39.8650, lon: 32.8840 }

export const mockUsers: Record<string, User> = {
  admin: { id: 1, customer_id: null, email: 'admin@arteverte.com', full_name: 'Hasan Uslu', role: 'admin', is_active: true },
  manager: { id: 2, customer_id: 1, email: 'ayse@emlakyonetim.com.tr', full_name: 'Ayşe Kurt', role: 'manager', is_active: true },
  operator: { id: 3, customer_id: 1, email: 'mehmet@emlakyonetim.com.tr', full_name: 'Mehmet Demir', role: 'operator', is_active: true, assigned_machine_id: 1, machine_name: 'GRIN-01' },
}

export const mockCustomers: Customer[] = [
  { id: 1, name: 'Emlak Yönetim Hiz. A.Ş.', city: 'Ankara', contract_start: '2026-03-01', contract_end: '2027-02-28', site_count: 4, machine_count: 5, user_count: 6 },
  { id: 2, name: 'Çankaya Belediyesi', city: 'Ankara', contract_start: '2026-04-01', contract_end: '2027-03-31', site_count: 6, machine_count: 7, user_count: 9 },
]

function rect(lat: number, lon: number, dLat: number, dLon: number): GeoJSON.Polygon {
  return { type: 'Polygon', coordinates: [[[lon, lat], [lon + dLon, lat], [lon + dLon, lat + dLat], [lon, lat + dLat], [lon, lat]]] }
}

export const mockSites: Site[] = [
  { id: 1, customer_id: 1, name: 'İmrahor Millet Bahçesi', district: 'Çankaya', grass_area_m2: 38000, zone_count: 3, week_pct: 72, polygon: rect(C.lat, C.lon, 0.0025, 0.0040) },
  { id: 2, customer_id: 1, name: 'Kuğulu Park', district: 'Çankaya', grass_area_m2: 6400, week_pct: 100, polygon: rect(C.lat + 0.004, C.lon - 0.006, 0.0010, 0.0015) },
  { id: 3, customer_id: 1, name: 'Seğmenler Parkı', district: 'Çankaya', grass_area_m2: 11200, week_pct: 55, polygon: rect(C.lat - 0.004, C.lon + 0.006, 0.0015, 0.0020) },
  { id: 4, customer_id: 1, name: 'Site bahçeleri (12 adet)', district: 'Oran', grass_area_m2: 9800, week_pct: 30, polygon: null },
]

export const mockMachines: Machine[] = [
  { id: 1, customer_id: 1, name: 'GRIN-01', model: 'HM46 Honda', cut_width_cm: 46, device_id: 'MOD-2026-0001', assigned_user_id: 3, assigned_user_name: 'Mehmet Demir', state: 'mowing', month_area_m2: 31200, bat_pct: 78, last_seen: new Date().toISOString() },
  { id: 2, customer_id: 1, name: 'GRIN-02', model: 'HM46 Honda', cut_width_cm: 46, device_id: 'MOD-2026-0002', assigned_user_id: 4, assigned_user_name: 'Ali Kaya', state: 'mowing', month_area_m2: 28900, bat_pct: 64, last_seen: new Date().toISOString() },
  { id: 4, customer_id: 1, name: 'GRIN-04', model: 'PM53', cut_width_cm: 53, device_id: 'MOD-2026-0004', assigned_user_id: 5, assigned_user_name: 'Serkan Yıldız', state: 'idle', month_area_m2: 19400, bat_pct: 12, last_seen: new Date(Date.now() - 2 * 60000).toISOString() },
  { id: 5, customer_id: 1, name: 'GRIN-05', model: 'HM46 B&S', cut_width_cm: 46, device_id: 'MOD-2026-0005', assigned_user_id: 6, assigned_user_name: 'Burak Tan', state: 'mowing', month_area_m2: 24100, bat_pct: 91, last_seen: new Date().toISOString() },
  { id: 6, customer_id: 1, name: 'GRIN-06', model: 'HM46 B&S', cut_width_cm: 46, device_id: 'MOD-2026-0006', assigned_user_id: null, assigned_user_name: null, state: 'transport', month_area_m2: 12000, bat_pct: 55, last_seen: new Date().toISOString() },
  { id: 7, customer_id: 1, name: 'GRIN-07', model: 'HM46 B&S', cut_width_cm: 46, device_id: 'MOD-2026-0007', assigned_user_id: null, assigned_user_name: null, state: 'offline', month_area_m2: 8300, bat_pct: null, last_seen: new Date(Date.now() - 3 * 86400000).toISOString() },
]

export const mockCustomerUsers: User[] = [
  { id: 2, customer_id: 1, email: 'ayse@emlakyonetim.com.tr', full_name: 'Ayşe Kurt', role: 'manager', is_active: true, machine_name: 'Tümü', status: 'active' },
  { id: 3, customer_id: 1, email: 'mehmet@emlakyonetim.com.tr', full_name: 'Mehmet Demir', role: 'operator', is_active: true, machine_name: 'GRIN-01', status: 'active' },
  { id: 4, customer_id: 1, email: 'ali@emlakyonetim.com.tr', full_name: 'Ali Kaya', role: 'operator', is_active: true, machine_name: 'GRIN-02', status: 'active' },
  { id: 5, customer_id: 1, email: 'serkan@emlakyonetim.com.tr', full_name: 'Serkan Yıldız', role: 'operator', is_active: false, machine_name: 'GRIN-04', status: 'invited' },
  { id: 1, customer_id: null, email: 'admin@arteverte.com', full_name: 'Hasan Uslu', role: 'admin', is_active: true, machine_name: 'Tüm müşteriler', status: 'active' },
]

const today942 = (() => { const d = new Date(); d.setHours(9, 42, 0, 0); return d.toISOString() })()

export const mockLive: LiveMachine[] = [
  { machine_id: 1, name: 'GRIN-01', device_id: 'MOD-2026-0001', customer_id: 1, operator_name: 'Mehmet D.', site_name: 'İmrahor · A bölgesi', state: 'mowing', lat: C.lat + 0.0008, lon: C.lon + 0.0020, hdg: 90, spd: 0.9, fix: 4, hacc: 0.02, sats: 14, h_pre: 81, h_post: 40, bat: 3.92, bat_pct: 78, rssi: -71, last_seen: new Date().toISOString(), session_started_at: today942, today_area_m2: 2140 },
  { machine_id: 2, name: 'GRIN-02', device_id: 'MOD-2026-0002', customer_id: 1, operator_name: 'Ali K.', site_name: 'İmrahor · C bölgesi', state: 'mowing', lat: C.lat + 0.0015, lon: C.lon + 0.0060, hdg: 270, spd: 0.8, fix: 4, hacc: 0.03, sats: 13, h_pre: 79, h_post: 41, bat: 3.8, bat_pct: 64, rssi: -75, last_seen: new Date().toISOString(), session_started_at: today942, today_area_m2: 1870 },
  { machine_id: 4, name: 'GRIN-04', device_id: 'MOD-2026-0004', customer_id: 1, operator_name: 'Serkan Y.', site_name: 'Kuğulu Park', state: 'idle', lat: C.lat + 0.0045, lon: C.lon - 0.0055, hdg: 0, spd: 0, fix: 4, hacc: 0.02, sats: 12, h_pre: 75, h_post: 40, bat: 3.5, bat_pct: 12, rssi: -80, last_seen: new Date(Date.now() - 2 * 60000).toISOString(), session_started_at: today942, today_area_m2: 960 },
  { machine_id: 5, name: 'GRIN-05', device_id: 'MOD-2026-0005', customer_id: 1, operator_name: 'Burak T.', site_name: 'Seğmenler Parkı', state: 'mowing', lat: C.lat - 0.0035, lon: C.lon + 0.0070, hdg: 180, spd: 0.9, fix: 4, hacc: 0.02, sats: 15, h_pre: 83, h_post: 42, bat: 4.0, bat_pct: 91, rssi: -68, last_seen: new Date().toISOString(), session_started_at: today942, today_area_m2: 1420 },
  { machine_id: 6, name: 'GRIN-06', device_id: 'MOD-2026-0006', customer_id: 1, operator_name: null, site_name: 'Depo', state: 'transport', lat: C.lat - 0.0060, lon: C.lon - 0.0080, hdg: 45, spd: 12.5, fix: 1, hacc: 2.5, sats: 8, h_pre: -1, h_post: -1, bat: 3.7, bat_pct: 55, rssi: -85, last_seen: new Date().toISOString(), today_area_m2: 0 },
  { machine_id: 7, name: 'GRIN-07', device_id: 'MOD-2026-0007', customer_id: 1, operator_name: null, site_name: 'Son: İmrahor B', state: 'offline', lat: C.lat + 0.0005, lon: C.lon - 0.0030, fix: 0, bat: null, bat_pct: null, last_seen: new Date(Date.now() - 3 * 86400000).toISOString(), today_area_m2: 0 },
]

function swathStripes(lat0: number, lon0: number, rows: number, w: number): GeoJSON.MultiPolygon {
  const polys: GeoJSON.Position[][][] = []
  for (let i = 0; i < rows; i++) {
    const lat = lat0 + i * 0.00012
    polys.push([[[lon0, lat], [lon0 + w, lat], [lon0 + w, lat + 0.00007], [lon0, lat + 0.00007], [lon0, lat]]])
  }
  return { type: 'MultiPolygon', coordinates: polys }
}

export function mockTrack(machineId: number): TrackResponse {
  const m = mockLive.find((x) => x.machine_id === machineId)
  if (!m || m.state === 'offline' || m.state === 'transport') {
    return { machine_id: machineId, from: new Date().toISOString().slice(0, 10), to: new Date().toISOString(), track: null, swath: null }
  }
  const lat = (m?.lat ?? C.lat) - 0.0010
  const lon = (m?.lon ?? C.lon) - 0.0018
  const rows = machineId === 1 ? 10 : machineId === 2 ? 7 : machineId === 4 ? 3 : 6
  return {
    machine_id: machineId,
    from: new Date().toISOString().slice(0, 10),
    to: new Date().toISOString(),
    track: { type: 'LineString', coordinates: [[lon, lat], [lon + 0.0035, lat], [lon + 0.0035, lat + 0.00012], [lon, lat + 0.00012]] },
    swath: swathStripes(lat, lon, rows, 0.0035),
  }
}

const dayLabels = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (13 - i)); return d.toISOString().slice(0, 10)
})
const dayVals = [6200, 6900, 5600, 7900, 7400, 1800, 900, 6400, 8300, 8800, 7200, 6700, 2800, 8900]

export const mockDashboard: Dashboard = {
  period: 'month',
  area_m2: 124300,
  area_change_pct: 12,
  grass_kg: 9900,
  bags: 1240,
  co2_total_kg: 4620,
  machines_active: 7,
  machines_total: 12,
  machines_silent: 1,
  daily: dayLabels.map((date, i) => ({ date, area_m2: dayVals[i] })),
  machines: [
    { machine_id: 1, name: 'GRIN-01', state: 'mowing', site_name: 'İmrahor Millet Bahçesi · A bölgesi', today_area_m2: 2140, last_seen: new Date().toISOString() },
    { machine_id: 2, name: 'GRIN-02', state: 'mowing', site_name: 'İmrahor Millet Bahçesi · C bölgesi', today_area_m2: 1870, last_seen: new Date().toISOString() },
    { machine_id: 4, name: 'GRIN-04', state: 'idle', site_name: 'Kuğulu Park', today_area_m2: 960, last_seen: new Date().toISOString() },
    { machine_id: 5, name: 'GRIN-05', state: 'mowing', site_name: 'Seğmenler Parkı', today_area_m2: 1420, last_seen: new Date().toISOString() },
    { machine_id: 7, name: 'GRIN-07', state: 'offline', site_name: 'Son görüldü: İmrahor, 3 gün önce', today_area_m2: 0, last_seen: new Date(Date.now() - 3 * 86400000).toISOString() },
  ],
  alerts: [
    { level: 'warn', title: 'GRIN-07 çevrimdışı', detail: 'Son veri: 3 gün önce · İmrahor' },
    { level: 'warn', title: 'GRIN-03 pil %12', detail: 'Tahmini 50 dk kaldı' },
    { level: 'ok', title: 'Eylül raporu hazır', detail: 'Çankaya Belediyesi · 48 sayfa' },
  ],
}

export const mockFactors: Factor[] = [
  { key: 'grass_kg_per_m2_per_cm', value: 0.195, unit: 'kg/(m²·cm)', source: 'saha kalibrasyonu', is_assumption: true },
  { key: 'bag_capacity_kg', value: 8, unit: 'kg/poşet', source: 'varsayım', is_assumption: true },
  { key: 'bag_mass_g', value: 30, unit: 'g', source: 'varsayım', is_assumption: true },
  { key: 'ef_ldpe_kg_co2e_per_kg', value: 2.1, unit: 'kgCO₂e/kg', source: 'DEFRA 2025 plastik', is_assumption: false },
  { key: 'truck_capacity_kg', value: 900, unit: 'kg/sefer', source: 'varsayım', is_assumption: true },
  { key: 'trip_km', value: 18, unit: 'km', source: 'saha', is_assumption: true },
  { key: 'truck_l_per_km', value: 0.3, unit: 'L/km', source: 'varsayım', is_assumption: true },
  { key: 'ef_diesel_kg_co2e_per_l', value: 2.57, unit: 'kgCO₂e/L', source: 'DEFRA 2025', is_assumption: false },
  { key: 'ef_landfill_kg_co2e_per_t', value: 446, unit: 'kgCO₂e/t', source: 'DEFRA 2025 karışık atık', is_assumption: false },
]

export const mockSavings: SavingsReport = {
  customer_id: 1,
  customer_name: 'Emlak Yönetim Hiz. A.Ş.',
  from: '2026-09-01',
  to: '2026-09-30',
  area_m2: 124300,
  h_cut_avg_cm: 4.1,
  totals: { grass_kg: 9900, bags: 1240, trips: 11, diesel_l: 49, co2_disposal_kg: 4410, co2_transport_kg: 130, co2_bags_kg: 80, co2_total_kg: 4620, factors_version: '2026-09' },
  monthly: [
    { month: '2026-03', co2_total_kg: 900 }, { month: '2026-04', co2_total_kg: 2400 }, { month: '2026-05', co2_total_kg: 3800 },
    { month: '2026-06', co2_total_kg: 4100 }, { month: '2026-07', co2_total_kg: 3600 }, { month: '2026-08', co2_total_kg: 3400 }, { month: '2026-09', co2_total_kg: 4620 },
  ],
  by_site: [
    { site_id: 1, site_name: 'İmrahor Millet Bahçesi', co2_total_kg: 2610 },
    { site_id: 3, site_name: 'Seğmenler Parkı', co2_total_kg: 880 },
    { site_id: 4, site_name: 'Site bahçeleri', co2_total_kg: 710 },
    { site_id: 2, site_name: 'Kuğulu Park', co2_total_kg: 420 },
  ],
  audit: [
    { item: 'Kesilen çim kütlesi', formula: 'alan × (h_önce − h_sonra) × yoğunluk', input: '124.300 m² · 4,1 cm', factor: '0,195 kg/m² per cm', source: 'Varsayım · saha kalibrasyonu', is_assumption: true, result: '9,9 t' },
    { item: 'Bertaraf emisyonu', formula: 'kütle × EF_depolama', input: '9,9 t', factor: '446 kg CO₂e/t', source: 'DEFRA 2025, karışık atık depolama', is_assumption: false, result: '4,41 t' },
    { item: 'Nakliye emisyonu', formula: 'sefer × km × L/km × EF_dizel', input: '11 sefer · 18 km', factor: '2,57 kg CO₂e/L', source: 'DEFRA 2025, dizel', is_assumption: false, result: '0,13 t' },
    { item: 'Poşet üretimi', formula: 'adet × g/poşet × EF_LDPE', input: '1.240 adet · 30 g', factor: '2,1 kg CO₂e/kg', source: 'Ecoinvent / DEFRA plastik', is_assumption: false, result: '0,08 t' },
  ],
  season_total_kg: 19800,
  season_target_kg: 24000,
}

const sessStart = (h: number, m: number, dayOffset = 0) => { const d = new Date(); d.setDate(d.getDate() - dayOffset); d.setHours(h, m, 0, 0); return d.toISOString() }

export const mockSessions: Session[] = [
  {
    id: 20260918, machine_id: 1, machine_name: 'GRIN-01', machine_model: 'HM46 Honda', operator_id: 3, operator_name: 'Mehmet Demir', site_id: 1, site_name: 'İmrahor · A Bölgesi',
    started_at: sessStart(9, 42), ended_at: null, area_m2: 2140, overlap_m2: 90, dist_m: 4650, h_pre_avg: 81, h_post_avg: 40, fix_ratio: 0.97, hacc_avg: 0.02, temp_avg: 24, hum_avg: 41, soil_avg: 28,
    swath: mockTrack(1).swath, note: null, photos: [], status: 'open',
    savings: { grass_kg: 171, bags: 21, trips: 0.19, diesel_l: 1.0, co2_disposal_kg: 76, co2_transport_kg: 2.6, co2_bags_kg: 1.3, co2_total_kg: 79 },
  },
  {
    id: 20260917, machine_id: 1, machine_name: 'GRIN-01', machine_model: 'HM46 Honda', operator_id: 3, operator_name: 'Mehmet Demir', site_id: 1, site_name: 'İmrahor · A Bölgesi',
    started_at: sessStart(9, 42, 1), ended_at: sessStart(12, 33, 1), area_m2: 3420, overlap_m2: 140, dist_m: 7430, h_pre_avg: 81, h_post_avg: 40, fix_ratio: 0.97, hacc_avg: 0.02, temp_avg: 24, hum_avg: 41, soil_avg: 28,
    swath: mockTrack(1).swath, note: null, photos: [], status: 'closed',
    savings: { grass_kg: 273, bags: 34, trips: 0.3, diesel_l: 1.4, co2_disposal_kg: 122, co2_transport_kg: 3.6, co2_bags_kg: 2.1, co2_total_kg: 127 },
  },
  {
    id: 20260916, machine_id: 1, machine_name: 'GRIN-01', machine_model: 'HM46 Honda', operator_id: 3, operator_name: 'Mehmet Demir', site_id: 1, site_name: 'İmrahor · B Bölgesi',
    started_at: sessStart(8, 15, 2), ended_at: sessStart(11, 2, 2), area_m2: 2980, overlap_m2: 120, dist_m: 6480, h_pre_avg: 78, h_post_avg: 41, fix_ratio: 0.95, hacc_avg: 0.03, temp_avg: 22, hum_avg: 48, soil_avg: 31,
    swath: mockTrack(1).swath, note: 'Kuzey köşe çok ıslaktı, atlandı', photos: [], status: 'closed',
    savings: { grass_kg: 215, bags: 27, trips: 0.24, diesel_l: 1.1, co2_disposal_kg: 96, co2_transport_kg: 2.8, co2_bags_kg: 1.7, co2_total_kg: 100 },
  },
]
