from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import effective_customer_id, get_current_user
from ..common import SILENT_AFTER, UTC, aware, build_live, day_start
from ..db import get_db
from ..models import Machine, User

router = APIRouter(tags=["dashboard"])

LOW_BAT_V = 3.5


def period_range(period: str, now: datetime) -> tuple[datetime, datetime, datetime]:
    """(start, prev_start, prev_end) — önceki dönem aynı uzunlukta/karşılıkta."""
    if period == "day":
        start = day_start(now)
        return start, start - timedelta(days=1), start
    if period == "month":
        start = day_start(now).replace(day=1)
        prev = (start - timedelta(days=1)).replace(day=1)
        # önceki ayın aynı gününe kadar (kıyas adil olsun)
        prev_end = min(prev + (now - start), start)
        return start, prev, prev_end
    # season: Mart–Kasım biçme sezonu; sezon dışı ise yılbaşı. Önceki dönem = geçen yılın aynı aralığı
    y = now.year
    start = datetime(y, 3, 1, tzinfo=UTC)
    if now < start:
        start = datetime(y, 1, 1, tzinfo=UTC)
    prev = start.replace(year=y - 1)
    return start, prev, prev + (now - start)


def _scope_sql(user: User, cid: Optional[int]) -> tuple[str, dict]:
    where, params = ["1=1"], {}
    if cid is not None:
        where.append("m.customer_id = :cid")
        params["cid"] = cid
    if user.role == "operator":
        where.append("(m.assigned_user_id = :uid OR s.operator_id = :uid)")
        params["uid"] = user.id
    return " AND ".join(where), params


def _kpi(db: Session, where: str, params: dict, a: datetime, b: datetime):
    return db.execute(text(f"""
        SELECT COALESCE(SUM(s.area_m2),0) AS area_m2, COALESCE(SUM(sv.grass_kg),0) AS grass_kg,
               COALESCE(SUM(sv.bags),0) AS bags,
               COALESCE(SUM(sv.co2_total_kg),0) AS co2_total_kg, COUNT(s.id) AS sessions
        FROM sessions s JOIN machines m ON m.id = s.machine_id
        LEFT JOIN savings sv ON sv.session_id = s.id
        WHERE {where} AND s.status = 'closed' AND s.started_at >= :a AND s.started_at < :b
    """), {**params, "a": a, "b": b}).mappings().first()


@router.get("/dashboard", response_model=schemas.DashboardOut)
def dashboard(customer_id: Optional[int] = None,
              period: str = Query("month", pattern="^(day|month|season)$"),
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """KPI'lar (dönem), önceki döneme göre değişim, son 14 gün günlük alan, makine satırları, uyarılar."""
    cid = effective_customer_id(user, customer_id)
    now = datetime.now(UTC)
    start, prev_start, prev_end = period_range(period, now)
    where, params = _scope_sql(user, cid)

    kpi = _kpi(db, where, params, start, now + timedelta(seconds=1))
    prev = _kpi(db, where, params, prev_start, prev_end)
    area = float(kpi["area_m2"])
    prev_area = float(prev["area_m2"])
    change = round((area - prev_area) / prev_area * 100, 1) if prev_area > 0 else None

    # makineler: kullanıcı kapsamı (operatör → atanmış makineler)
    mq = db.query(Machine)
    if cid is not None:
        mq = mq.filter(Machine.customer_id == cid)
    if user.role == "operator":
        mq = mq.filter(Machine.assigned_user_id == user.id)
    machines = mq.order_by(Machine.id).all()
    live = build_live(db, machines)
    active = sum(1 for r in live if r["state"] == "mowing")
    silent = [r for r in live if r["last_seen"] is None or now - aware(r["last_seen"]) > SILENT_AFTER]
    silent_ids = {r["machine_id"] for r in silent}

    rows = db.execute(text(f"""
        SELECT (s.started_at AT TIME ZONE 'UTC')::date AS d, SUM(s.area_m2) AS area_m2
        FROM sessions s JOIN machines m ON m.id = s.machine_id
        WHERE {where} AND s.status = 'closed' AND s.started_at >= :d14
        GROUP BY 1 ORDER BY 1
    """), {**params, "d14": day_start(now) - timedelta(days=13)}).mappings().all()
    by_day = {r["d"]: float(r["area_m2"] or 0) for r in rows}
    daily = []
    for i in range(13, -1, -1):
        d: date = (now - timedelta(days=i)).date()
        daily.append({"date": d.isoformat(), "area_m2": round(by_day.get(d, 0.0), 1)})

    alerts = []
    for r in silent:
        seen = aware(r["last_seen"])
        detail = f"Son veri: {int((now - seen).total_seconds() // 86400)} gün önce" if seen else "Hiç veri gelmedi"
        alerts.append({"level": "warn", "title": f"{r['name']} çevrimdışı",
                       "detail": detail + (f" · {r['site_name']}" if r["site_name"] else "")})
    for r in live:
        if r["bat"] is not None and float(r["bat"]) < LOW_BAT_V and r["machine_id"] not in silent_ids:
            pct = f" %{r['bat_pct']}" if r["bat_pct"] is not None else ""
            alerts.append({"level": "warn", "title": f"{r['name']} pil düşük{pct}",
                           "detail": f"Modül pili {float(r['bat']):.2f} V · şarj edin"})
    for r in live:
        if r["state"] != "offline" and r["fix"] is not None and r["fix"] < 4 and r["state"] == "mowing":
            alerts.append({"level": "info", "title": f"{r['name']} RTK düzeltmesi yok",
                           "detail": "Konum doğruluğu düşük; alan hesabı bu noktaları dışlar"})
    if not alerts and live:
        alerts.append({"level": "ok", "title": "Tüm makineler veri yolluyor", "detail": "Uyarı yok"})

    return {
        "period": period, "from": start, "to": now, "customer_id": cid,
        "area_m2": round(area, 1), "area_change_pct": change,
        "grass_kg": round(float(kpi["grass_kg"]), 1), "bags": round(float(kpi["bags"]), 1),
        "co2_total_kg": round(float(kpi["co2_total_kg"]), 3), "sessions": int(kpi["sessions"]),
        "machines_active": active, "machines_total": len(live), "machines_silent": len(silent),
        "daily": daily,
        "machines": [{"machine_id": r["machine_id"], "name": r["name"], "state": r["state"],
                      "site_name": r["site_name"], "today_area_m2": r["today_area_m2"],
                      "last_seen": r["last_seen"]} for r in live],
        "alerts": alerts,
    }
