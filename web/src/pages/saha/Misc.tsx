import { useNavigate } from 'react-router-dom'
import { api, API_BASE } from '../../api'
import { useAuth } from '../../auth'
import { useAsync } from '../../hooks'
import { Bars, ErrorBox, Loading } from '../../components/ui'
import { daysAgoIso, fmt0, fmtMonth, kgToTon } from '../../util'

export function OperatorSavings() {
  const { user } = useAuth()
  const r = useAsync(() => api.savings({ customer_id: user?.customer_id, from: daysAgoIso(180) }), [user?.customer_id])
  const t = r.data?.totals
  return (
    <div className="op-body">
      <div className="op-head"><div><div className="hi">Sezon</div><h1>Tasarruf</h1></div></div>
      <ErrorBox error={r.error} />
      {r.loading && !r.data ? <Loading /> : t && (
        <>
          <div className="card dark dark-list" style={{ padding: 18 }}>
            <div className="lime-t">Toplam önlenen CO₂e</div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 40, fontWeight: 700 }}>{kgToTon(t.co2_total_kg, 2)} <small style={{ fontSize: 16, fontWeight: 500 }}>ton</small></div>
            <div className="kv"><span>Sahada kalan çim</span><b>{kgToTon(t.grass_kg)} t</b></div>
            <div className="kv"><span>Kullanılmayan poşet</span><b>{fmt0(t.bags)} adet</b></div>
            <div className="kv"><span>Önlenen dizel</span><b>{fmt0(t.diesel_l)} L</b></div>
          </div>
          <div className="card" style={{ padding: 18, marginTop: 12 }}>
            <div className="card-head"><h3>Aylık · ton CO₂e</h3></div>
            <Bars labelTop height={180} data={(r.data?.monthly ?? []).map((m) => ({ label: fmtMonth(m.month), value: m.co2_total_kg, display: kgToTon(m.co2_total_kg) }))} />
          </div>
        </>
      )}
    </div>
  )
}

export function OperatorProfile() {
  const { user, logout, demo } = useAuth()
  const nav = useNavigate()
  return (
    <div className="op-body">
      <div className="op-head"><div><div className="hi">Hesap</div><h1>{user?.full_name}</h1></div></div>
      <div className="card" style={{ padding: 18 }}>
        <div className="kv"><span>E-posta</span><b>{user?.email}</b></div>
        <div className="kv"><span>Rol</span><b>Saha operatörü</b></div>
        <div className="kv"><span>Makine</span><b>{user?.machine_name ?? '—'}</b></div>
        <div className="kv"><span>Sunucu</span><b className="mono">{demo ? 'demo' : API_BASE}</b></div>
        <div className="kv"><span>Sürüm</span><b>web 0.1.0</b></div>
      </div>
      <button className="btn block" style={{ marginTop: 16, padding: 16 }} onClick={() => { logout(); nav('/login') }}>Çıkış yap</button>
    </div>
  )
}
