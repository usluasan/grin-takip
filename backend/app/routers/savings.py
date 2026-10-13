from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import carbon, schemas
from ..auth import effective_customer_id, get_current_user
from ..common import UTC, parse_dt
from ..db import get_db
from ..models import Customer, User
from ..sessions_service import load_factors

router = APIRouter(tags=["savings"])

_SAV_COLS = ("grass_kg", "bags", "trips", "diesel_l", "co2_bags_kg", "co2_transport_kg",
             "co2_disposal_kg", "co2_total_kg")


def _tr(v: Any, nd: int = 2) -> str:
    """Sayıyı Türkçe biçimde yaz (1.234,56)."""
    if v is None:
        return "—"
    if isinstance(v, dict):
        return " · ".join(f"{k}={_tr(x)}" for k, x in v.items())
    if isinstance(v, str):
        return v
    f = float(v)
    if f != 0 and abs(f) < 0.01:
        s = f"{f:.4f}"
    elif abs(f) >= 1000 or f == int(f):
        s = f"{f:,.0f}"
    else:
        s = f"{f:,.{nd}f}"
    return s.replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def audit_rows(trace: list[dict]) -> list[dict]:
    """carbon.compute_savings trace → types.ts AuditRow (metin alanlar, kaynak + varsayım bayrağı)."""
    rows = []
    for t in trace:
        src = t.get("kaynak") or "—"
        is_assumption = "[VARSAYIM]" in src
        rows.append({
            "item": t["kalem"], "formula": t["formül"], "input": _tr(t.get("girdi")),
            "factor": _tr(t.get("katsayı")), "source": src.replace(" [VARSAYIM]", "").strip() or "—",
            "is_assumption": is_assumption, "result": f"{_tr(t['sonuç'])} {t['birim']}",
        })
    return rows


@router.get("/savings", response_model=schemas.SavingsReportOut)
def savings(customer_id: Optional[int] = None,
            from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = None,
            db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Aralıktaki kapanmış oturumların kalem kalem toplamı, aylık seri (from yılı), saha dağılımı ve hesap izi.
    from/to: 'YYYY-MM-DD' (gün dahil) veya ISO 8601."""
    cid = effective_customer_id(user, customer_id)
    f, t = parse_dt(from_, name="from"), parse_dt(to, end=True, name="to")
    where, params = ["s.status = 'closed'"], {}
    if cid is not None:
        where.append("m.customer_id = :cid"); params["cid"] = cid
    if user.role == "operator":
        where.append("(m.assigned_user_id = :uid OR s.operator_id = :uid)"); params["uid"] = user.id
    scope = " AND ".join(where)
    rng = []
    if f:
        rng.append("s.started_at >= :f"); params["f"] = f
    if t:
        rng.append("s.started_at <= :t"); params["t"] = t
    w = " AND ".join([scope, *rng])

    tot = db.execute(text(f"""
        SELECT COUNT(s.id) AS sessions, COALESCE(SUM(s.area_m2),0) AS area_m2,
               COALESCE(SUM(sv.grass_kg),0) AS grass_kg, COALESCE(SUM(sv.bags),0) AS bags,
               COALESCE(SUM(sv.trips),0) AS trips, COALESCE(SUM(sv.diesel_l),0) AS diesel_l,
               COALESCE(SUM(sv.co2_bags_kg),0) AS co2_bags_kg,
               COALESCE(SUM(sv.co2_transport_kg),0) AS co2_transport_kg,
               COALESCE(SUM(sv.co2_disposal_kg),0) AS co2_disposal_kg,
               COALESCE(SUM(sv.co2_total_kg),0) AS co2_total_kg,
               CASE WHEN SUM(s.area_m2) > 0 THEN SUM(s.h_pre_avg * s.area_m2)/SUM(s.area_m2) END AS h_pre_w,
               CASE WHEN SUM(s.area_m2) > 0 THEN SUM(s.h_post_avg * s.area_m2)/SUM(s.area_m2) END AS h_post_w
        FROM sessions s JOIN machines m ON m.id = s.machine_id
        LEFT JOIN savings sv ON sv.session_id = s.id
        WHERE {w}
    """), params).mappings().first()

    # Aylık seri: from (yoksa bugün) yılının ayları, o yılın sonuna/bugüne kadar
    year = (f or datetime.now(UTC)).year
    now = datetime.now(UTC)
    last_month = now.month if year == now.year else 12
    monthly_rows = db.execute(text(f"""
        SELECT to_char(s.started_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month, SUM(sv.co2_total_kg) AS co2
        FROM sessions s JOIN machines m ON m.id = s.machine_id
        LEFT JOIN savings sv ON sv.session_id = s.id
        WHERE {scope} AND s.started_at >= :y0 AND s.started_at < :y1
        GROUP BY 1
    """), {**{k: v for k, v in params.items() if k not in ("f", "t")},
           "y0": datetime(year, 1, 1, tzinfo=UTC), "y1": datetime(year + 1, 1, 1, tzinfo=UTC)}).mappings().all()
    by_month = {r["month"]: float(r["co2"] or 0) for r in monthly_rows}
    monthly = [{"month": f"{year}-{mo:02d}", "co2_total_kg": round(by_month.get(f"{year}-{mo:02d}", 0.0), 3)}
               for mo in range(1, last_month + 1)]

    by_site = [{"site_id": int(r["site_id"] or 0), "site_name": r["site_name"] or "Saha atanmamış",
                "co2_total_kg": round(float(r["co2"] or 0), 3), "area_m2": round(float(r["area"] or 0), 1)}
               for r in db.execute(text(f"""
                   SELECT s.site_id, st.name AS site_name, SUM(sv.co2_total_kg) AS co2, SUM(s.area_m2) AS area
                   FROM sessions s JOIN machines m ON m.id = s.machine_id
                   LEFT JOIN sites st ON st.id = s.site_id
                   LEFT JOIN savings sv ON sv.session_id = s.id
                   WHERE {w} GROUP BY s.site_id, st.name ORDER BY 3 DESC NULLS LAST
               """), params).mappings().all()]

    factors = load_factors(db)
    area = float(tot["area_m2"])
    h_pre = float(tot["h_pre_w"]) if tot["h_pre_w"] is not None else None
    h_post = float(tot["h_post_w"]) if tot["h_post_w"] is not None else None
    # Hesap izi: alan-ağırlıklı ortalama boylarla toplam üzerinden (bilgi amaçlı; kesin değer satır toplamıdır)
    trace = carbon.compute_savings(area, h_pre, h_post, factors)["trace"] if factors else []

    totals = {k: float(tot[k]) for k in _SAV_COLS}
    totals["factors_version"] = carbon.factors_version(factors) if factors else None
    customer_name = None
    if cid is not None:
        c = db.get(Customer, cid)
        customer_name = c.name if c else None
    return {
        "customer_id": cid, "customer_name": customer_name, "from": f, "to": t,
        "area_m2": round(area, 1),
        "h_cut_avg_cm": round(max(0.0, (h_pre - h_post) / 10.0), 2) if h_pre is not None and h_post is not None else None,
        "sessions": int(tot["sessions"]),
        "totals": totals, "monthly": monthly, "by_site": by_site,
        "audit": audit_rows(trace),
        "season_total_kg": round(sum(x["co2_total_kg"] for x in monthly), 3),
        "factors_version": totals["factors_version"],
        "trace": trace,
    }
