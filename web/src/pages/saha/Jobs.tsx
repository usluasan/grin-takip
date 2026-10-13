import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { useAsync } from '../../hooks'
import { DEFAULT_CENTER, FitTo, MapContainer, Swath, Tiles, geoPoints } from '../../components/Map'
import { IcBack } from '../../components/Icons'
import { ErrorBox, Loading } from '../../components/ui'
import type { Session } from '../../types'
import { daysAgoIso, duration, fmt0, fmt1, fmtDateLong, fmtTime, mmToCm } from '../../util'

export function JobList() {
  const { user } = useAuth()
  const s = useAsync(() => api.sessions({ from: daysAgoIso(30), operator_id: user?.id }), [user?.id])
  const byDay = new Map<string, Session[]>()
  ;(s.data ?? []).forEach((x) => { const k = x.started_at.slice(0, 10); byDay.set(k, [...(byDay.get(k) ?? []), x]) })
  return (
    <div className="op-body">
      <div className="op-head"><div><div className="hi">Son 30 gün</div><h1>İşlerim</h1></div></div>
      <ErrorBox error={s.error} />
      {s.loading && !s.data ? <Loading /> : (
        <div className="jobs">
          {[...byDay.entries()].map(([day, list]) => (
            <div key={day}>
              <div className="eyebrow" style={{ margin: '14px 0 8px' }}>{fmtDateLong(day)}</div>
              {list.map((x) => (
                <Link to={`/saha/isler/${x.id}`} className="job" key={x.id}>
                  <div>
                    <b>{x.site_name ?? x.machine_name ?? `İş #${x.id}`}</b>
                    <span>{fmtTime(x.started_at)} – {x.ended_at ? fmtTime(x.ended_at) : 'devam ediyor'} · {duration(x.started_at, x.ended_at, 'words')}</span>
                  </div>
                  <div className="r"><b>{fmt0(x.area_m2)} m²</b><span>{x.savings ? `${fmt0(x.savings.co2_total_kg)} kg CO₂e` : (x.status === 'open' ? 'açık' : '—')}</span></div>
                </Link>
              ))}
            </div>
          ))}
          {s.data && s.data.length === 0 && <Loading text="Henüz iş yok." />}
        </div>
      )}
    </div>
  )
}

export function JobCard() {
  const { id } = useParams()
  const nav = useNavigate()
  const sid = Number(id)
  const s = useAsync(() => api.session(sid), [sid])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [err, setErr] = useState<unknown>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const x = s.data
  useEffect(() => { if (x) setNote(x.note ?? '') }, [x?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveNote = async () => {
    if (!x) return
    setSaving('saving'); setErr(null)
    try { const r = await api.patchSession(x.id, { note }); s.setData({ ...x, ...r, note }); setSaving('saved'); setTimeout(() => setSaving('idle'), 1500) } catch (ex) { setErr(ex); setSaving('idle') }
  }
  const addPhoto = async (file: File) => {
    if (!x) return
    setErr(null)
    try {
      const up = await api.uploadPhoto(x.id, file)
      if (up) { s.setData(up); return }
      // Uç yoksa: küçültülmüş base64'ü photos dizisine PATCH'le
      const b64 = await shrink(file, 1024)
      const photos = [...(x.photos ?? []), b64]
      const r = await api.patchSession(x.id, { photos })
      s.setData({ ...x, ...r, photos })
    } catch (ex) { setErr(ex) }
  }
  const share = async () => {
    if (!x) return
    const text = [
      `GRIN Takip · İş kartı #${x.id}`,
      `${x.site_name ?? ''} · ${fmtDateLong(x.started_at)} ${fmtTime(x.started_at)}–${fmtTime(x.ended_at)}`,
      `Biçilen alan: ${fmt0(x.area_m2)} m² · Çim boyu ${mmToCm(x.h_pre_avg)} → ${mmToCm(x.h_post_avg)} cm`,
      x.savings ? `Sahada kalan çim: ${fmt0(x.savings.grass_kg)} kg · Kullanılmayan poşet: ${fmt0(x.savings.bags)} · Önlenen CO₂e: ${fmt0(x.savings.co2_total_kg)} kg` : '',
      `Operatör: ${x.operator_name ?? '—'} · Makine: ${x.machine_name ?? '—'}`,
      x.note ? `Not: ${x.note}` : '',
      `${location.origin}/saha/isler/${x.id}`,
    ].filter(Boolean).join('\n')
    if (navigator.share) { try { await navigator.share({ title: `İş kartı #${x.id}`, text }) } catch { /* iptal */ } }
    else { await navigator.clipboard?.writeText(text); alert('Rapor özeti panoya kopyalandı.') }
  }

  if (s.loading && !x) return <div className="op-body"><Loading /></div>
  if (!x) return <div className="op-body"><ErrorBox error={s.error ?? 'İş bulunamadı'} /></div>
  const sv = x.savings
  const pts = geoPoints(x.swath ?? x.track ?? null)

  return (
    <div className="op-body">
      <div className="op-head" style={{ alignItems: 'center' }}>
        <button className="back-btn" onClick={() => nav(-1)} aria-label="Geri"><IcBack /></button>
        <div style={{ flex: 1, marginLeft: 12 }}>
          <div className="hi">İş kartı · #{x.id}</div>
          <h1 style={{ fontSize: 22 }}>{x.site_name ?? x.machine_name}</h1>
        </div>
        <span className={`pill ${x.status === 'closed' ? 'mowing' : 'idle'}`}>{x.status === 'closed' ? 'Tamamlandı' : 'Devam ediyor'}</span>
      </div>

      {pts.length > 0 && (
        <div className="op-map" style={{ height: 200, marginBottom: 12 }}>
          <MapContainer center={DEFAULT_CENTER} zoom={17} style={{ height: '100%' }} zoomControl={false} attributionControl={false} dragging={false} scrollWheelZoom={false}>
            <Tiles />
            <FitTo points={pts} pad={20} />
            <Swath id={`sw-${x.id}`} data={x.swath} />
          </MapContainer>
        </div>
      )}

      <div className="card" style={{ padding: 18 }}>
        <div className="stat-grid">
          <div><div className="l">Biçilen alan</div><div className="v">{fmt0(x.area_m2)}<small>m²</small></div></div>
          <div><div className="l">Süre</div><div className="v">{duration(x.started_at, x.ended_at, 'words')}</div></div>
          <div><div className="l">Çim boyu önce → sonra</div><div className="v">{mmToCm(x.h_pre_avg)} → {mmToCm(x.h_post_avg)}<small>cm</small></div></div>
          <div><div className="l">Konum doğruluğu</div><div className="v">{x.hacc_avg != null ? `${fmt0(x.hacc_avg * 100)} cm` : '—'}<small style={{ color: 'var(--forest)' }}>{x.fix_ratio != null ? `RTK %${Math.round(x.fix_ratio * 100)}` : ''}</small></div></div>
        </div>
      </div>

      <div className="card dark dark-list" style={{ padding: 18, marginTop: 12 }}>
        <div className="lime-t">Bu işin çevresel katkısı</div>
        <div className="kv"><span>Sahada kalan çim</span><b>{fmt0(sv?.grass_kg)} kg</b></div>
        <div className="kv"><span>Kullanılmayan poşet</span><b>{fmt0(sv?.bags)} adet</b></div>
        <div className="kv"><span>Önlenen nakliye</span><b>{fmt1(sv?.trips)} sefer · {fmt1(sv?.diesel_l)} L</b></div>
        <div className="kv total"><span>Önlenen CO₂e</span><b>{fmt0(sv?.co2_total_kg)} kg</b></div>
        {!sv && <div style={{ opacity: 0.7, fontSize: 13 }}>Tasarruf iş kapatılınca hesaplanır.</div>}
      </div>

      <div className="card" style={{ padding: 18, marginTop: 12 }}>
        <h3 style={{ marginBottom: 6 }}>Detaylar</h3>
        <div className="kv"><span>Operatör</span><b>{x.operator_name ?? '—'}</b></div>
        <div className="kv"><span>Makine</span><b>{x.machine_name ?? '—'}{x.machine_model ? ` · ${x.machine_model}` : ''}</b></div>
        <div className="kv"><span>Başlangıç / bitiş</span><b>{fmtTime(x.started_at)} – {fmtTime(x.ended_at)}</b></div>
        <div className="kv"><span>Hava</span><b>{x.temp_avg != null ? `${fmt0(x.temp_avg)} °C · %${fmt0(x.hum_avg)} nem` : '—'}</b></div>
        <div className="kv"><span>Toprak nemi</span><b>{x.soil_avg != null ? `%${fmt0(x.soil_avg)} · ${x.soil_avg < 25 ? 'sulama önerilir' : 'sulama önerilmez'}` : '—'}</b></div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label>Not (isteğe bağlı)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note !== (x.note ?? '')) saveNote() }} placeholder="Örn. kuzey köşe çok ıslaktı, atlandı" />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{saving === 'saving' ? 'Kaydediliyor…' : saving === 'saved' ? 'Kaydedildi ✓' : 'Alandan çıkınca otomatik kaydedilir'}</span>
      </div>

      <div className="field">
        <label>Fotoğraflar</label>
        <div className="photos">
          {(x.photos ?? []).map((p, i) => <img key={i} src={p} alt={`Fotoğraf ${i + 1}`} />)}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = '' }} />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>+ Fotoğraf ekle</button>
      </div>
      <ErrorBox error={err} />
      <button className="btn primary block" style={{ padding: 18, fontSize: 17, marginTop: 8 }} onClick={share}>Raporu müşteriyle paylaş</button>
    </div>
  )
}

/** Görseli canvas ile küçültüp JPEG base64 döndür */
function shrink(file: File, max: number): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      res(c.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => rej(new Error('Görsel okunamadı'))
    img.src = url
  })
}
