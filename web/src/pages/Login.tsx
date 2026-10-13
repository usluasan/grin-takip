import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { homeFor, useAuth } from '../auth'
import { IcQr, Logo } from '../components/Icons'

export default function Login() {
  const { user, login, demo, ready } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (ready && user) return <Navigate to={homeFor(user.role)} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const u = await login(email.trim(), password)
      if (!remember) { try { sessionStorage.setItem('grin.session-only', '1') } catch { /* yok */ } }
      nav(homeFor(u.role), { replace: true })
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Giriş başarısız')
    } finally { setBusy(false) }
  }

  return (
    <div className="login">
      {demo && <div className="demo-banner">API'ye ulaşılamıyor — demo verisi</div>}
      <div className="login-card">
        <div className="login-hero">
          <div className="logo"><Logo size={32} /></div>
          <h1>GRIN Takip</h1>
          <p>Biçtiğin her metrekare sayılıyor. Çim sahada kalıyor, karbon raporda.</p>
        </div>
        <form className="login-sheet" onSubmit={submit}>
          <h2>Giriş yap</h2>
          <div className="field">
            <label htmlFor="email">E-posta veya telefon</label>
            <input id="email" type="text" inputMode="email" autoComplete="username" placeholder="mehmet@emlakyonetim.com.tr" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="pw">Şifre</label>
            <input id="pw" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="login-row">
            <label><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Beni hatırla</label>
            <a href="#" onClick={(e) => { e.preventDefault(); alert('Şifre sıfırlama için şirket yöneticinize başvurun.') }}>Şifremi unuttum</a>
          </div>
          {err && <p className="error">{err}</p>}
          <button className="btn primary block" type="submit" disabled={busy} style={{ padding: 18, fontSize: 18 }}>
            {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
          <div className="or">veya</div>
          <button type="button" className="btn block" style={{ padding: 18, fontSize: 17 }} onClick={() => alert('QR ile giriş bir sonraki sürümde.')}>
            <IcQr /> Makinedeki QR kodu okut
          </button>
          {demo && (
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 18 }}>
              Demo: <b>admin@…</b> → Arteverte admin, <b>ayse@…</b> → müşteri yöneticisi, diğer e-postalar → saha operatörü. Şifre herhangi bir şey.
            </p>
          )}
          <div className="login-foot">
            Hesabın yoksa şirket yöneticinden davet iste.<br />Arteverte Peyzaj Mimarlık · GRIN Türkiye
          </div>
        </form>
      </div>
    </div>
  )
}
