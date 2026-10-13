import { useEffect, useMemo, type ReactNode } from 'react'
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { LiveMachine } from '../types'
import { stateColor, uiState, type UiState } from '../util'

const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined) || ''

/** Google anahtarı varsa Google tile'ları (lyrs=m: yol, lyrs=s: uydu+etiket).
 *  Yoksa: uydu = Esri World Imagery + yol/yer adı katmanı, harita = OpenStreetMap. */
export function Tiles({ satellite = true }: { satellite?: boolean }) {
  if (GOOGLE_KEY) {
    return (
      <TileLayer
        url={`https://mt1.google.com/vt/lyrs=${satellite ? 'y' : 'm'}&x={x}&y={y}&z={z}&key=${GOOGLE_KEY}`}
        attribution="Harita: Google Maps"
        maxZoom={21}
      />
    )
  }
  if (satellite) {
    return (
      <>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Uydu: Esri, Maxar, Earthstar Geographics"
          maxZoom={20}
          maxNativeZoom={19}
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
          maxZoom={20}
          maxNativeZoom={19}
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          maxZoom={20}
          maxNativeZoom={19}
        />
      </>
    )
  }
  return (
    <TileLayer
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      maxZoom={20}
      maxNativeZoom={19}
    />
  )
}

export function machineIcon(state: UiState, selected = false): L.DivIcon {
  const size = selected ? 22 : 16
  return L.divIcon({
    className: '',
    html: `<div class="marker-pin ${state === 'mowing' ? 'pulse' : ''}" style="width:${size}px;height:${size}px;background:${stateColor[state]}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

export function MachineMarker({ m, selected, onClick, popup }: { m: LiveMachine; selected?: boolean; onClick?: () => void; popup?: ReactNode }) {
  const st = uiState(m.state, m.last_seen)
  const icon = useMemo(() => machineIcon(st, selected), [st, selected])
  if (m.lat == null || m.lon == null) return null
  return (
    <Marker position={[m.lat, m.lon]} icon={icon} eventHandlers={onClick ? { click: onClick } : undefined} zIndexOffset={st === 'mowing' ? 500 : 0}>
      {popup && <Popup>{popup}</Popup>}
    </Marker>
  )
}

/** Bugün biçilen şerit (swath) — koyu yeşil; geçmiş — açık yeşil */
export function Swath({ data, past = false, id }: { data: GeoJSON.GeoJsonObject | null | undefined; past?: boolean; id: string }) {
  if (!data) return null
  return (
    <GeoJSON
      key={id}
      data={data as GeoJSON.GeoJsonObject}
      style={{ color: past ? '#A6D277' : '#1E6B3C', weight: 1, fillColor: past ? '#A6D277' : '#1E6B3C', fillOpacity: 0.65 }}
    />
  )
}

export function SitePolygon({ polygon, label, id }: { polygon: GeoJSON.Polygon | null; label?: string; id: string }) {
  if (!polygon) return null
  return (
    <GeoJSON
      key={id}
      data={polygon}
      style={{ color: '#9CC97E', weight: 1.5, fillColor: '#C8E0B2', fillOpacity: 0.4, dashArray: '4 3' }}
      onEachFeature={(_f, layer) => { if (label) layer.bindTooltip(label, { permanent: true, direction: 'top', className: 'site-label' }) }}
    />
  )
}

/** Verilen noktalara sığdır */
export function FitTo({ points, pad = 40 }: { points: Array<[number, number]>; pad?: number }) {
  const map = useMap()
  const key = points.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (!points.length) return
    if (points.length === 1) { map.setView(points[0], Math.max(map.getZoom(), 17)); return }
    map.fitBounds(L.latLngBounds(points), { padding: [pad, pad] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

export function FlyTo({ pos, zoom = 18 }: { pos: [number, number] | null; zoom?: number }) {
  const map = useMap()
  useEffect(() => { if (pos) map.flyTo(pos, Math.max(map.getZoom(), zoom), { duration: 0.6 }) }, [pos?.[0], pos?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/** Küçük yardımcı: GeoJSON polygon/multipolygon'dan tüm noktaları çıkar */
export function geoPoints(g: GeoJSON.GeoJsonObject | null | undefined): Array<[number, number]> {
  if (!g) return []
  const out: Array<[number, number]> = []
  const walk = (c: unknown) => {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number') { out.push([c[1] as number, c[0] as number]); return }
    c.forEach(walk)
  }
  if ('coordinates' in g) walk((g as GeoJSON.Polygon).coordinates)
  return out
}

export const DEFAULT_CENTER: [number, number] = [39.8650, 32.8840]

export { MapContainer }
