import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import geo, schemas
from ..auth import (can_see_machine, check_customer_scope, get_current_user, hash_password,
                    new_device_token, require_roles)
from ..common import UTC, aware, build_live, day_start, parse_dt
from ..config import settings
from ..db import get_db
from ..models import Machine, User
from ..mosquitto_passwd import remove_user, set_user
from .customers import get_customer_or_404

log = logging.getLogger("grin.machines")
router = APIRouter(tags=["machines"])


def _mqtt_user(device_id: str, token: Optional[str]) -> None:
    try:
        if token is None:
            remove_user(settings.MQTT_PASSWD_FILE, device_id)
        else:
            set_user(settings.MQTT_PASSWD_FILE, device_id, token)
    except OSError as e:
        log.warning("Mosquitto passwd dosyası yazılamadı (%s): %s", settings.MQTT_PASSWD_FILE, e)


def _machine_q(db: Session, user: User):
    q = db.query(Machine)
    if user.role != "admin":
        q = q.filter(Machine.customer_id == user.customer_id)
    if user.role == "operator":
        q = q.filter(Machine.assigned_user_id == user.id)
    return q


def machines_out(db: Session, machines: list[Machine]) -> list[dict]:
    """MachineOut + assigned_user_name, state, month_area_m2, bat_pct, last_seen."""
    if not machines:
        return []
    now = datetime.now(UTC)
    month0 = day_start(now).replace(day=1)
    live = {r["machine_id"]: r for r in build_live(db, machines)}
    month = {r["machine_id"]: float(r["area_m2"] or 0) for r in db.execute(text("""
        SELECT machine_id, SUM(area_m2) AS area_m2 FROM sessions
        WHERE machine_id = ANY(:ids) AND status = 'closed' AND started_at >= :m0 GROUP BY machine_id
    """), {"ids": [m.id for m in machines], "m0": month0}).mappings().all()}
    out = []
    for m in machines:
        d = schemas.MachineOut.model_validate(m).model_dump()
        lv = live.get(m.id, {})
        d.update(assigned_user_name=lv.get("operator_name"), state=lv.get("state", "offline"),
                 month_area_m2=round(month.get(m.id, 0.0), 1), bat_pct=lv.get("bat_pct"),
                 last_seen=lv.get("last_seen"))
        out.append(d)
    return out


@router.get("/customers/{cid}/machines", response_model=list[schemas.MachineOut])
def list_machines(cid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    check_customer_scope(user, cid)
    return machines_out(db, _machine_q(db, user).filter(Machine.customer_id == cid).order_by(Machine.id).all())


@router.post("/customers/{cid}/machines", response_model=schemas.MachineCreated, status_code=201)
def create_machine(cid: int, body: schemas.MachineIn, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("admin", "manager"))):
    check_customer_scope(user, cid)
    get_customer_or_404(db, cid)
    if db.query(Machine).filter(Machine.device_id == body.device_id).first():
        raise HTTPException(409, "Bu device_id zaten kayıtlı")
    if body.assigned_user_id is not None:
        u = db.get(User, body.assigned_user_id)
        if not u or u.customer_id != cid:
            raise HTTPException(400, "Atanacak kullanıcı bu müşteriye ait değil")
    token = new_device_token()
    m = Machine(customer_id=cid, name=body.name, model=body.model, cut_width_cm=body.cut_width_cm,
                device_id=body.device_id, device_token_hash=hash_password(token),
                assigned_user_id=body.assigned_user_id)
    db.add(m)
    db.commit()
    _mqtt_user(m.device_id, token)
    out = machines_out(db, [m])[0]
    out["device_token"] = token
    return out


@router.patch("/machines/{mid}", response_model=schemas.MachinePatched)
def patch_machine(mid: int, body: schemas.MachinePatch, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("admin", "manager"))):
    """rotate_token=true gönderilirse yanıta yeni device_token eklenir (MachineCreated biçimi)."""
    m = db.get(Machine, mid)
    if not m:
        raise HTTPException(404, "Makine bulunamadı")
    check_customer_scope(user, m.customer_id)
    data = body.model_dump(exclude_unset=True)
    rotate = data.pop("rotate_token", False)
    if "assigned_user_id" in data and data["assigned_user_id"] is not None:
        u = db.get(User, data["assigned_user_id"])
        if not u or u.customer_id != m.customer_id:
            raise HTTPException(400, "Atanacak kullanıcı bu müşteriye ait değil")
    for k, v in data.items():
        setattr(m, k, v)
    new_token = None
    if rotate:
        new_token = new_device_token()
        m.device_token_hash = hash_password(new_token)
    db.commit()
    out = machines_out(db, [m])[0]
    if new_token:
        _mqtt_user(m.device_id, new_token)
        out["device_token"] = new_token
    return out


@router.get("/machines/live", response_model=list[schemas.LiveMachine])
def machines_live(customer_id: Optional[int] = None, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    """Makine başına son konum + durum (düz satır). admin ?customer_id= ile süzer; diğer roller kendi kapsamında."""
    q = _machine_q(db, user)
    if customer_id is not None:
        check_customer_scope(user, customer_id)
        q = q.filter(Machine.customer_id == customer_id)
    return build_live(db, q.order_by(Machine.id).all())


@router.get("/machines/{mid}/track", response_model=schemas.TrackOut)
def machine_track(mid: int,
                  from_: Optional[str] = Query(None, alias="from"),
                  to: Optional[str] = None,
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Aralıktaki iz (LineString) + swath (MultiPolygon) ve aralıktaki kapanmış oturumların swath'ları.
    from/to: 'YYYY-MM-DD' (gün dahil) veya ISO 8601. Varsayılan: son 24 saat."""
    m = db.get(Machine, mid)
    if not m or not can_see_machine(user, m):
        raise HTTPException(404, "Makine bulunamadı")
    now = datetime.now(UTC)
    t_to = parse_dt(to, end=True, name="to") or now
    t_from = parse_dt(from_, name="from") or (t_to - timedelta(hours=24))
    rows = db.execute(text("""
        SELECT time, ST_X(geom::geometry) AS lon, ST_Y(geom::geometry) AS lat,
               fix, hacc, h_pre, h_post, us_pre, us_post, state
        FROM telemetry WHERE device_id = :d AND time >= :a AND time <= :b AND geom IS NOT NULL
        ORDER BY time
    """), {"d": m.device_id, "a": t_from, "b": t_to}).mappings().all()
    g = geo.compute_area([dict(r) for r in rows], float(m.cut_width_cm))
    track = swath = None
    if g["track_wkt"]:
        from shapely import wkt
        track = json.loads(json.dumps(wkt.loads(g["track_wkt"]).__geo_interface__))
        swath = json.loads(json.dumps(wkt.loads(g["swath_wkt"]).__geo_interface__))
    d0 = day_start(now)
    sessions = [{"id": r["id"], "swath": json.loads(r["swath"]) if r["swath"] else None,
                 "is_today": aware(r["started_at"]) >= d0}
                for r in db.execute(text("""
                    SELECT id, started_at, ST_AsGeoJSON(swath::geometry) AS swath FROM sessions
                    WHERE machine_id = :m AND started_at >= :a AND started_at <= :b AND swath IS NOT NULL
                    ORDER BY started_at
                """), {"m": mid, "a": t_from, "b": t_to}).mappings().all()]
    return {"machine_id": mid, "from": t_from, "to": t_to, "track": track, "swath": swath, "sessions": sessions,
            "summary": {"n_points": g["n_points"], "n_good": g["n_good"], "fix_ratio": round(g["fix_ratio"], 3),
                        "area_m2": round(g["area_m2"], 1), "overlap_m2": round(g["overlap_m2"], 1),
                        "dist_m": round(g["dist_m"], 1), "h_pre_avg": g["h_pre_avg"], "h_post_avg": g["h_post_avg"]}}

