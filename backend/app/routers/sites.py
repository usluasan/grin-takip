import json
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import schemas
from ..auth import check_customer_scope, get_current_user, require_roles
from ..common import day_start
from ..db import get_db
from ..models import User
from .customers import get_customer_or_404

router = APIRouter(prefix="/customers/{cid}/sites", tags=["sites"])

_SELECT = """
SELECT st.id, st.customer_id, st.name, ST_AsGeoJSON(st.polygon::geometry) AS polygon,
       st.grass_area_m2, st.notes,
       (SELECT COALESCE(SUM(s.area_m2), 0) FROM sessions s
         WHERE s.site_id = st.id AND s.status = 'closed' AND s.started_at >= :w0) AS week_area_m2
FROM sites st WHERE {where} ORDER BY st.id
"""


def _week_start():
    d0 = day_start()
    return d0 - timedelta(days=d0.weekday())  # Pazartesi 00:00 UTC


def _row_to_site(r) -> dict:
    d = dict(r)
    d["polygon"] = json.loads(d["polygon"]) if d["polygon"] else None
    area = float(d["grass_area_m2"]) if d["grass_area_m2"] is not None else 0.0
    d["grass_area_m2"] = area
    week = float(d.pop("week_area_m2") or 0)
    d["week_pct"] = round(min(100.0, week / area * 100), 0) if area > 0 else None
    return d


@router.get("", response_model=list[schemas.SiteOut])
def list_sites(cid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    check_customer_scope(user, cid)
    rows = db.execute(text(_SELECT.format(where="st.customer_id = :c")),
                      {"c": cid, "w0": _week_start()}).mappings().all()
    return [_row_to_site(r) for r in rows]


@router.post("", response_model=schemas.SiteOut, status_code=201)
def create_site(cid: int, body: schemas.SiteIn, db: Session = Depends(get_db),
                user: User = Depends(require_roles("admin", "manager"))):
    check_customer_scope(user, cid)
    get_customer_or_404(db, cid)
    poly = json.dumps(body.polygon) if body.polygon else None
    # grass_area_m2 verilmemiş ya da 0 ise poligondan hesapla
    area = body.grass_area_m2 if body.grass_area_m2 else None
    try:
        row = db.execute(text("""
            INSERT INTO sites (customer_id, name, polygon, grass_area_m2, notes)
            VALUES (:c, :n, CASE WHEN :p IS NULL THEN NULL
                                 ELSE ST_SetSRID(ST_GeomFromGeoJSON(CAST(:p AS text)), 4326)::geography END,
                    COALESCE(:a, CASE WHEN :p IS NULL THEN NULL
                                      ELSE ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(CAST(:p AS text)), 4326)::geography) END),
                    :notes)
            RETURNING id
        """), {"c": cid, "n": body.name, "p": poly, "a": area, "notes": body.notes}).first()
        db.commit()
    except Exception as e:  # geçersiz GeoJSON vb.
        db.rollback()
        raise HTTPException(400, f"Saha kaydedilemedi: {e.__class__.__name__}")
    r = db.execute(text(_SELECT.format(where="st.id = :id")), {"id": row[0], "w0": _week_start()}).mappings().first()
    return _row_to_site(r)
