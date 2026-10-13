import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { CustomerSelect, useCustomer } from '../customer'
import { useAsync } from '../hooks'
import { Bars, ErrorBox, Loading, Modal } from '../components/ui'
import type { Factor } from '../types'
import { fmt0, fmt1, fmt2, fmtMonth, kgToTon } from '../util'

function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const from = `${ym}-01`
  const to = new Date(y, m, 0).toISOString().slice(0, 10)
  return { from, to }
}
const monthOptions = () => {
  const out: string[] = []
  const d = new Date(); d.setDate(1)
  for (let i = 0; i < 12; i++) { out.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() - 1) }
  return out
}

export default function Carbon() {
  const { selectedId, selected } = useCustomer()
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7))
  const [showFactors, setShowFactors] = useState(false)
  const { from, to } = monthRange(ym)
  const rep = useAsync(() => api.savings({ customer_id: selectedId, from, to }), [selectedId, from, to])
  const r = rep.data
  const t = r?.totals
  const title = new Date(`${ym}-01`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  const maxSite = Math.max(1, ...(r?.by_site ?? []).map((s) => s.co2_total_kg))
  // 1 binek araç ~ 0,2 kg CO₂e/km (varsayım, bilgilendirme amaçlı)
  const carKm = t ? Math.round(t.co2_total_kg / 0.2 / 1000) * 1000 : 0

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <div className="eyebrow">Karbon ve tasarruf raporu</div>
          <h1>{title} · {r?.customer_name ?? selected?.name ?? 'Tüm müşteriler'}</h1>
          <div className="sub">Torbalı klasik biçime kıyasla · Tüm katsayılar kaynaklı, denetlenebilir</div>
        </div>
        <div className="toolbar">
          <CustomerSelect />
          <div className="select-wrap">
            <label>Ay</label>
            <select value={ym} onChange={(e) => setYm(e.target.value)}>
              {monthOptions().map((m) => <option key={m} value={m}>{new Date(`${m}-01`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</option>)}
            </select>
          </div>
          <button className="btn" onClick={() => setShowFactors(true)}>Katsayıları gör</button>
          <button className="btn primary" onClick={() => window.print()}>Kurum raporu (PDF)</button>
        </div>
      </div>
      <ErrorBox error={rep.error} />
      {rep.loading && !r ? <Loading /> : r && t && (
        <>
          <div className="kpis" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
            <div className="card kpi dark" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <div className="label">Toplam önlenen emisyon</div>
                <div className="value" style={{ fontSize: 48 }}>{kgToTon(t.co2_total_kg, 2)}<small>ton CO₂e</small></div>
                <div className="foot">= 1 binek aracın ~{fmt0(carKm)} km yolu <span title="Varsayım: 0,2 kg CO₂e/km ortalama binek araç; yalnız anlatım amaçlı, hesap izine dahil değil">ⓘ</span> · {fmt0(r.area_m2)} m² biçildi</div>
              </div>
              <div style={{ borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: 20, alignSelf: 'center' }}>
                <div className="kv"><span style={{ color: 'rgba(255,255,255,0.75)' }}>Bertaraf (depolama)</span><b>{kgToTon(t.co2_disposal_kg, 2)} t</b></div>
                <div className="kv"><span style={{ color: 'rgba(255,255,255,0.75)' }}>Atık nakliyesi</span><b>{kgToTon(t.co2_transport_kg, 2)} t</b></div>
                <div className="kv"><span style={{ color: 'rgba(255,255,255,0.75)' }}>Çöp poşeti üretimi</span><b>{kgToTon(t.co2_bags_kg, 2)} t</b></div>
              </div>
            </div>
            <div className="card kpi">
              <div className="label">Sahada kalan çim</div>
              <div className="value">{kgToTon(t.grass_kg)}<small>ton</small></div>
              <div className="foot">{fmt0(t.bags)} poşet · {fmt0(t.trips)} kamyon seferi</div>
            </div>
            <div className="card kpi">
              <div className="label">Önlenen yakıt</div>
              <div className="value">{fmt0(t.diesel_l)}<small>L dizel</small></div>
              <div className="foot">+ {fmt0(t.grass_kg * 0.012)} kg gübre eşdeğeri azot <span title="Varsayım: taze çimde ≈ %1,2 N; doğrulanmalı, hesap izine dahil değil">ⓘ (varsayım)</span></div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-head"><h2>Aylık önlenen CO₂e · {ym.slice(0, 4)} sezonu</h2><span className="hint">ton CO₂e</span></div>
              <Bars labelTop height={240} data={r.monthly.map((m) => ({ label: fmtMonth(m.month), value: m.co2_total_kg, display: kgToTon(m.co2_total_kg) }))} />
              <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 0 }}>
                Sezon toplamı {kgToTon(r.season_total_kg ?? r.monthly.reduce((a, m) => a + m.co2_total_kg, 0))} t CO₂e
                {r.season_target_kg ? <> · Hedef {kgToTon(r.season_target_kg)} t</> : null}
              </p>
            </div>
            <div className="card">
              <div className="card-head"><h2>Saha bazında</h2></div>
              {r.by_site.map((s) => (
                <div className="site-bar" key={s.site_id}>
                  <div className="row"><span>{s.site_name}</span><span>{kgToTon(s.co2_total_kg, 2)} t</span></div>
                  <div className="track"><i style={{ width: `${(s.co2_total_kg / maxSite) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>Hesap izi · denetim için</h2><span className="hint">Her satır formül + kaynak gösterir</span></div>
            <table>
              <thead><tr><th>Kalem</th><th>Formül</th><th>Girdi</th><th>Katsayı</th><th>Kaynak</th><th className="num">Sonuç</th></tr></thead>
              <tbody>
                {r.audit.map((a, i) => (
                  <tr key={i}>
                    <td><b>{a.item}</b></td>
                    <td className="mono">{a.formula}</td>
                    <td>{a.input}</td>
                    <td>{a.factor}</td>
                    <td style={{ color: a.is_assumption ? 'var(--warn)' : 'var(--forest)', fontWeight: 600 }}>{a.source}</td>
                    <td className="num"><b>{a.result}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {showFactors && <FactorsModal onClose={() => { setShowFactors(false); rep.reload() }} />}
    </main>
  )
}

const factorLabel: Record<string, string> = {
  grass_kg_per_m2_per_cm: 'Çim yoğunluğu (kesilen cm başına)',
  bag_capacity_kg: 'Poşet kapasitesi',
  bag_mass_g: 'Poşet kütlesi',
  ef_ldpe_kg_co2e_per_kg: 'EF · LDPE plastik',
  truck_capacity_kg: 'Kamyon kapasitesi',
  trip_km: 'Sefer mesafesi (gidiş-dönüş)',
  truck_l_per_km: 'Kamyon yakıt tüketimi',
  ef_diesel_kg_co2e_per_l: 'EF · dizel',
  ef_landfill_kg_co2e_per_t: 'EF · depolama (karışık atık)',
}

function FactorsModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin'
  const f = useAsync(() => api.factors(), [])
  const [edit, setEdit] = useState<Factor[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const rows = edit ?? f.data ?? []
  const save = async () => {
    if (!edit) return
    setBusy(true); setErr(null)
    try { await api.putFactors(edit); onClose() } catch (ex) { setErr(ex) } finally { setBusy(false) }
  }
  return (
    <Modal title="Katsayılar" onClose={onClose}>
      <p style={{ color: 'var(--muted)', marginTop: -8 }}>SPEC §5 — turuncu satırlar <b>varsayım</b>, saha ölçümüyle güncellenmeli.</p>
      <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Katsayı</th><th className="num">Değer</th><th>Birim</th><th>Kaynak</th></tr></thead>
          <tbody>
            {rows.map((x, i) => (
              <tr key={x.key} style={{ color: x.is_assumption ? 'var(--warn)' : undefined }}>
                <td><b style={{ color: 'var(--ink)' }}>{factorLabel[x.key] ?? x.key}</b><br /><span className="mono" style={{ color: 'var(--muted)' }}>{x.key}</span></td>
                <td className="num">
                  {canEdit ? (
                    <input type="number" step="any" value={x.value} style={{ width: 90, border: '1px solid var(--border)', borderRadius: 8, padding: 6, textAlign: 'right' }}
                      onChange={(e) => { const n = [...rows]; n[i] = { ...x, value: Number(e.target.value) }; setEdit(n) }} />
                  ) : (x.value < 1 ? fmt2(x.value) : x.value < 10 ? fmt1(x.value) : fmt0(x.value))}
                </td>
                <td>{x.unit}</td>
                <td>{canEdit ? (
                  <input value={x.source} style={{ width: 150, border: '1px solid var(--border)', borderRadius: 8, padding: 6 }}
                    onChange={(e) => { const n = [...rows]; n[i] = { ...x, source: e.target.value, is_assumption: /varsay/i.test(e.target.value) }; setEdit(n) }} />
                ) : x.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ErrorBox error={err} />
      <div className="actions">
        <button className="btn" onClick={onClose}>Kapat</button>
        {canEdit && <button className="btn primary" disabled={!edit || busy} onClick={save}>Kaydet (PUT /factors)</button>}
      </div>
    </Modal>
  )
}
