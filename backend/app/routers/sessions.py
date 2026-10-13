import json
import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session, aliased

from .. import carbon, schemas
from ..auth import can_see_session, effective_customer_id, get_current_user
from ..common import UTC, parse_dt
from ..config import settings
from ..db import get_db
from ..models import Machine, MowSession, Saving, Site, User
from ..sessions_service import close_session, load_factors

router = APIRouter(prefix="/sessions", tags=["sessions"])

UPLOAD_URL = "/api/v1/uploads"
PHOTO_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}
PHOTO_MAX_BYTES = 15 * 1024 * 1024

_NUM = ("area_m2", "overlap_m2", "dist_m", "h_pre_avg", "h_post_avg", "fix_ratio")


def _savings_out(sv: Optional[Saving]) -> Optional[dict]:
    if sv is None:
        return None
    d = {"session_id": sv.session_id, "factors_version": sv.factors_version, "computed_at": sv.computed_at}
    for c in ("grass_kg", "bags", "trips", "diesel_l", "co2_disposal_kg", "co2_transport_kg",
              "co2_bags_kg", "co2_total_kg"):
        v = getattr(sv, c)
        d[c] = float(v) if v is not None else 0.0
    return d


def _to_out(s: MowSession, m: Machine, operator_name=None, site_name=None, sv: Optional[Saving] = None) -> dict:
    d = {c: getattr(s, c) for c in ("id", "machine_id", "operator_id", "site_id", "started_at",
                                    "ended_at", "note", "status")}
    for c in _NUM:
        v = getattr(s, c)
        d[c] = float(v) if v is not None else (None if c in ("h_pre_avg", "h_post_avg", "fix_ratio") else 0.0)
    d["photos"] = [str(p) for p in (s.photos or [])]
    d["machine_name"] = m.name
    d["machine_model"] = m.model
    d["device_id"] = m.device_id
    d["operator_name"] = operator_name
    d["site_name"] = site_name
    d["savings"] = _savings_out(sv)
    return d


def _joined_q(db: Session):
    op = aliased(User)
    q = (db.query(MowSession, Machine, op.full_name, Site.name, Saving)
         .join(Machine, Machine.id == MowSession.machine_id)
         .outerjoin(op, op.id == MowSession.operator_id)
         .outerjoin(Site, Site.id == MowSession.site_id)
         .outerjoin(Saving, Saving.session_id == MowSession.id))
    return q


def _get_visible(db: Session, user: User, sid: int):
    row = _joined_q(db).filter(MowSession.id == sid).first()
    if not row:
        raise HTTPException(404, "Oturum bulunamadı")
    s, m = row[0], row[1]
    if not can_see_session(user, s, m):
        raise HTTPException(404, "Oturum bulunamadı")
    return row


def _detail(db: Session, row) -> dict:
    s, m, op_name, site_name, sv = row
    d = _to_out(s, m, op_name, site_name, sv)
    geoms = db.execute(text("SELECT ST_AsGeoJSON(track::geometry) t, ST_AsGeoJSON(swath::geometry) w "
                            "FROM sessions WHERE id = :id"), {"id": s.id}).first()
    d["track"] = json.loads(geoms[0]) if geoms and geoms[0] else None
    d["swath"] = json.loads(geoms[1]) if geoms and geoms[1] else None
    avg = db.execute(text("""
        SELECT AVG(hacc) AS hacc_avg, AVG(temp) AS temp_avg, AVG(hum) AS hum_avg,
               AVG((SELECT AVG(x::numeric) FROM jsonb_array_elements_text(soil) x)) AS soil_avg
        FROM telemetry WHERE device_id = :d AND time >= :a AND time <= :b
    """), {"d": m.device_id, "a": s.started_at, "b": s.ended_at or datetime.now(UTC)}).mappings().first()
    for k in ("hacc_avg", "temp_avg", "hum_avg", "soil_avg"):
        v = avg[k] if avg else None
        d[k] = round(float(v), 3) if v is not None else None
    if sv is not None and s.area_m2 is not None:
        # Hesap izini mevcut katsayılarla yeniden üret (denetim için)
        c = carbon.compute_savings(float(s.area_m2), float(s.h_pre_avg or 0), float(s.h_post_avg or 0),
                                   load_factors(db))
        d["trace"] = c["trace"]
    return d


@router.get("", response_model=list[schemas.SessionOut])
def list_sessions(customer_id: Optional[int] = None, machine_id: Optional[int] = None,
                  operator_id: Optional[int] = None, site_id: Optional[int] = None,
                  from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = None,
                  status: Optional[str] = None, limit: int = Query(200, le=1000),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """from/to: 'YYYY-MM-DD' (gün dahil) veya ISO 8601. operator_id ile operatöre göre süzer."""
    cid = effective_customer_id(user, customer_id)
    q = _joined_q(db)
    if cid is not None:
        q = q.filter(Machine.customer_id == cid)
    if user.role == "operator":
        q = q.filter((MowSession.operator_id == user.id) | (Machine.assigned_user_id == user.id))
    if machine_id is not None:
        q = q.filter(MowSession.machine_id == machine_id)
    if operator_id is not None:
        q = q.filter(MowSession.operator_id == operator_id)
    if site_id is not None:
        q = q.filter(MowSession.site_id == site_id)
    f, t = parse_dt(from_, name="from"), parse_dt(to, end=True, name="to")
    if f:
        q = q.filter(MowSession.started_at >= f)
    if t:
        q = q.filter(MowSession.started_at <= t)
    if status:
        q = q.filter(MowSession.status == status)
    return [_to_out(*r) for r in q.order_by(MowSession.started_at.desc()).limit(limit).all()]


@router.get("/{sid}", response_model=schemas.SessionDetail)
def get_session(sid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _detail(db, _get_visible(db, user, sid))


def _can_edit(user: User, s: MowSession, m: Machine):
    if user.role == "operator" and s.operator_id not in (None, user.id) and m.assigned_user_id != user.id:
        raise HTTPException(403, "Yalnızca kendi oturumunuzu düzenleyebilirsiniz")


@router.patch("/{sid}", response_model=schemas.SessionOut)
def patch_session(sid: int, body: schemas.SessionPatch, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    row = _get_visible(db, user, sid)
    s, m = row[0], row[1]
    _can_edit(user, s, m)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    if user.role == "operator" and s.operator_id is None:
        s.operator_id = user.id
    db.commit()
    db.expire_all()
    return _to_out(*_get_visible(db, user, sid))


@router.post("/{sid}/photos", response_model=schemas.SessionPhotoOut, status_code=201)
def upload_photo(sid: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    """multipart/form-data `file` → UPLOAD_DIR'e kaydeder, URL'yi photos[]'a ekler. Yanıt: oturum detayı + url."""
    row = _get_visible(db, user, sid)
    s, m = row[0], row[1]
    _can_edit(user, s, m)
    ext = PHOTO_TYPES.get((file.content_type or "").lower())
    if ext is None:
        raise HTTPException(415, "Yalnızca JPEG, PNG, WebP veya HEIC fotoğraf yüklenebilir")
    data = file.file.read(PHOTO_MAX_BYTES + 1)
    if len(data) > PHOTO_MAX_BYTES:
        raise HTTPException(413, "Fotoğraf 15 MB'tan büyük olamaz")
    name = f"s{sid}-{uuid.uuid4().hex}{ext}"
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    with open(os.path.join(settings.UPLOAD_DIR, name), "wb") as fh:
        fh.write(data)
    url = f"{UPLOAD_URL}/{name}"
    s.photos = [*(s.photos or []), url]
    if user.role == "operator" and s.operator_id is None:
        s.operator_id = user.id
    db.commit()
    db.expire_all()
    d = _detail(db, _get_visible(db, user, sid))
    d["url"] = url
    return d


@router.post("/{sid}/close", response_model=schemas.SessionDetail)
def close(sid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = _get_visible(db, user, sid)
    s = row[0]
    if s.status == "closed":
        close_session(db, sid, ended_at=s.ended_at)   # yeniden hesapla (idempotent)
    else:
        close_session(db, sid)
    db.expire_all()
    return _detail(db, _get_visible(db, user, sid))
