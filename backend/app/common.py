"""Router'ların ortak yardımcıları: tarih aralığı ayrıştırma, kullanıcı/makine zenginleştirme."""
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from .models import Machine, User

UTC = timezone.utc
OFFLINE_AFTER = timedelta(minutes=10)   # web/util.ts uiState ile aynı eşik
SILENT_AFTER = timedelta(days=3)        # dashboard: "3 gündür veri yollamadı"


def aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def parse_dt(value: Optional[str], *, end: bool = False, name: str = "tarih") -> Optional[datetime]:
    """'YYYY-MM-DD' → gün başı (end=True ise ertesi gün 00:00, yani gün sonu dahil); ISO 8601 → aynen (UTC varsayılır)."""
    if value is None or value == "":
        return None
    v = value.strip()
    try:
        if len(v) == 10:
            d = date.fromisoformat(v)
            dt = datetime.combine(d, time.min, tzinfo=UTC)
            return dt + timedelta(days=1) if end else dt
        return aware(datetime.fromisoformat(v.replace("Z", "+00:00")))
    except ValueError:
        raise HTTPException(422, f"Geçersiz istek: {name} — ISO 8601 bekleniyor")


def day_start(now: Optional[datetime] = None) -> datetime:
    now = now or datetime.now(UTC)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def bat_pct(v: Optional[float]) -> Optional[int]:
    """Li-ion 1S kaba yaklaşım: 3,3 V = %0, 4,2 V = %100 (web/util.ts batPct ile aynı). Firmware yüzde göndermez."""
    if v is None:
        return None
    return max(0, min(100, round((float(v) - 3.3) / 0.9 * 100)))


def live_state(state: Optional[str], last_seen: Optional[datetime], now: Optional[datetime] = None) -> str:
    now = now or datetime.now(UTC)
    if not state or state == "off" or last_seen is None or now - aware(last_seen) > OFFLINE_AFTER:
        return "offline"
    return state


def user_out(db: Session, u: User) -> dict:
    """UserOut sözlüğü: operatör için atanmış ilk makine eklenir."""
    d = {c: getattr(u, c) for c in ("id", "customer_id", "email", "full_name", "role", "is_active", "created_at")}
    d["status"] = "active" if u.is_active else "invited"
    d["assigned_machine_id"] = None
    d["machine_name"] = None
    if u.role == "operator":
        m = db.query(Machine).filter(Machine.assigned_user_id == u.id).order_by(Machine.id).first()
        if m:
            d["assigned_machine_id"] = m.id
            d["machine_name"] = m.name
    return d


def users_out(db: Session, users: list[User]) -> list[dict]:
    ids = [u.id for u in users if u.role == "operator"]
    first_machine: dict[int, Machine] = {}
    if ids:
        for m in db.query(Machine).filter(Machine.assigned_user_id.in_(ids)).order_by(Machine.id).all():
            first_machine.setdefault(m.assigned_user_id, m)
    out = []
    for u in users:
        d = {c: getattr(u, c) for c in ("id", "customer_id", "email", "full_name", "role", "is_active", "created_at")}
        d["status"] = "active" if u.is_active else "invited"
        m = first_machine.get(u.id)
        d["assigned_machine_id"] = m.id if m else None
        d["machine_name"] = m.name if m else None
        out.append(d)
    return out


def build_live(db: Session, machines: list[Machine]) -> list[dict]:
    """GET /machines/live satırları (types.ts LiveMachine). Dashboard da kullanır."""
    if not machines:
        return []
    now = datetime.now(UTC)
    dev_ids = [m.device_id for m in machines]
    m_ids = [m.id for m in machines]
    last = {r["device_id"]: dict(r) for r in db.execute(text("""
        SELECT device_id, time, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon,
               fix, hacc, spd, hdg, h_pre, h_post, state, bat
        FROM machine_last WHERE device_id = ANY(:ids)
    """), {"ids": dev_ids}).mappings().all()}
    status = {r["device_id"]: dict(r) for r in db.execute(text("""
        SELECT DISTINCT ON (device_id) device_id, time, bat, rssi, sats
        FROM device_status WHERE device_id = ANY(:ids) ORDER BY device_id, time DESC
    """), {"ids": dev_ids}).mappings().all()}
    # açık oturum + bugünkü alan + bugünkü/son saha
    sess = {r["machine_id"]: dict(r) for r in db.execute(text("""
        SELECT s.machine_id,
               MAX(s.started_at) FILTER (WHERE s.status = 'open') AS open_started_at,
               COALESCE(SUM(s.area_m2) FILTER (WHERE s.started_at >= :d0), 0) AS today_area_m2
        FROM sessions s WHERE s.machine_id = ANY(:ids) GROUP BY s.machine_id
    """), {"ids": m_ids, "d0": day_start(now)}).mappings().all()}
    site = {r["machine_id"]: r["site_name"] for r in db.execute(text("""
        SELECT DISTINCT ON (s.machine_id) s.machine_id, st.name AS site_name
        FROM sessions s JOIN sites st ON st.id = s.site_id
        WHERE s.machine_id = ANY(:ids) ORDER BY s.machine_id, s.started_at DESC
    """), {"ids": m_ids}).mappings().all()}
    cust = {r["id"]: r["name"] for r in db.execute(text(
        "SELECT id, name FROM customers WHERE id = ANY(:ids)"),
        {"ids": list({m.customer_id for m in machines})}).mappings().all()}
    op_ids = list({m.assigned_user_id for m in machines if m.assigned_user_id})
    ops = {u.id: u.full_name for u in db.query(User).filter(User.id.in_(op_ids)).all()} if op_ids else {}

    out = []
    for m in machines:
        t = last.get(m.device_id, {})
        st = status.get(m.device_id, {})
        s = sess.get(m.id, {})
        t_time, s_time = aware(t.get("time")), aware(st.get("time"))
        last_seen = max([x for x in (t_time, s_time) if x], default=None)
        bat = t.get("bat") if t.get("bat") is not None else st.get("bat")
        out.append({
            "machine_id": m.id, "name": m.name, "device_id": m.device_id, "customer_id": m.customer_id,
            "customer_name": cust.get(m.customer_id), "operator_name": ops.get(m.assigned_user_id),
            "site_name": site.get(m.id),
            "state": live_state(t.get("state"), t_time, now),
            "lat": t.get("lat"), "lon": t.get("lon"), "hdg": t.get("hdg"), "spd": t.get("spd"),
            "fix": t.get("fix"), "hacc": t.get("hacc"), "sats": st.get("sats"),
            "h_pre": t.get("h_pre"), "h_post": t.get("h_post"),
            "bat": bat, "bat_pct": bat_pct(bat), "rssi": st.get("rssi"),
            "last_seen": last_seen, "session_started_at": aware(s.get("open_started_at")),
            "today_area_m2": round(float(s.get("today_area_m2") or 0), 1),
        })
    return out
