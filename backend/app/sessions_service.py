"""Oturum kapatma — ingest ve router tarafından ortak kullanılır."""
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from . import carbon, geo
from .models import Factor, Machine, MowSession, Saving

log = logging.getLogger("grin.sessions")


def load_factors(db: Session) -> dict:
    return {
        f.key: {"value": float(f.value), "unit": f.unit, "source": f.source,
                "is_assumption": f.is_assumption}
        for f in db.query(Factor).all()
    }


def fetch_points(db: Session, device_id: str, start: datetime, end: datetime) -> list[dict]:
    rows = db.execute(text("""
        SELECT ST_X(geom::geometry) AS lon, ST_Y(geom::geometry) AS lat,
               fix, hacc, h_pre, h_post, us_pre, us_post
        FROM telemetry
        WHERE device_id = :d AND time >= :a AND time <= :b AND geom IS NOT NULL
        ORDER BY time
    """), {"d": device_id, "a": start, "b": end}).mappings().all()
    return [dict(r) for r in rows]


def guess_site_id(db: Session, machine: Machine, track_wkt: Optional[str]) -> Optional[int]:
    if not track_wkt:
        return None
    row = db.execute(text("""
        SELECT id FROM sites
        WHERE customer_id = :c AND polygon IS NOT NULL
        ORDER BY ST_Length(ST_Intersection(polygon, ST_GeogFromText(:w))) DESC
        LIMIT 1
    """), {"c": machine.customer_id, "w": f"SRID=4326;{track_wkt}"}).first()
    return row[0] if row else None


def close_session(db: Session, session_id: int, ended_at: Optional[datetime] = None) -> MowSession:
    s = db.get(MowSession, session_id)
    if s is None:
        raise ValueError("Oturum bulunamadı")
    m = db.get(Machine, s.machine_id)
    end = ended_at or s.ended_at or datetime.now(timezone.utc)

    pts = fetch_points(db, m.device_id, s.started_at, end)
    g = geo.compute_area(pts, float(m.cut_width_cm))
    factors = load_factors(db)
    c = carbon.compute_savings(g["area_m2"], g["h_pre_avg"], g["h_post_avg"], factors)

    s.ended_at = end
    s.status = "closed"
    s.area_m2 = round(g["area_m2"], 2)
    s.overlap_m2 = round(g["overlap_m2"], 2)
    s.dist_m = round(g["dist_m"], 2)
    s.h_pre_avg = round(g["h_pre_avg"], 1) if g["h_pre_avg"] is not None else None
    s.h_post_avg = round(g["h_post_avg"], 1) if g["h_post_avg"] is not None else None
    s.fix_ratio = round(g["fix_ratio"], 4)
    if s.site_id is None:
        s.site_id = guess_site_id(db, m, g["track_wkt"])
    db.flush()

    # Geography kolonlarını WKT üzerinden yaz (geoalchemy2 tipini atlayıp doğrudan SQL).
    # CAST şart: değer None olunca PostgreSQL parametre türünü çıkaramıyor (AmbiguousParameter).
    db.execute(text("""
        UPDATE sessions SET
          track = CASE WHEN CAST(:t AS text) IS NULL THEN NULL ELSE ST_GeogFromText(CAST(:t AS text)) END,
          swath = CASE WHEN CAST(:w AS text) IS NULL THEN NULL ELSE ST_GeogFromText(CAST(:w AS text)) END
        WHERE id = :id
    """), {"t": f"SRID=4326;{g['track_wkt']}" if g["track_wkt"] else None,
           "w": f"SRID=4326;{g['swath_wkt']}" if g["swath_wkt"] else None, "id": s.id})

    sv = db.get(Saving, s.id) or Saving(session_id=s.id)
    sv.grass_kg = round(c["grass_kg"], 4)
    sv.bags = round(c["bags"], 4)
    sv.trips = round(c["trips"], 6)
    sv.diesel_l = round(c["diesel_l"], 4)
    sv.co2_bags_kg = round(c["co2_bags_kg"], 6)
    sv.co2_transport_kg = round(c["co2_transport_kg"], 6)
    sv.co2_disposal_kg = round(c["co2_disposal_kg"], 6)
    sv.co2_total_kg = round(c["co2_total_kg"], 6)
    sv.factors_version = carbon.factors_version(factors)
    sv.computed_at = datetime.now(timezone.utc)
    db.add(sv)
    db.commit()
    log.info("session %s closed: area=%.1f m2 co2=%.3f kg (points=%d good=%d)",
             s.id, g["area_m2"], c["co2_total_kg"], g["n_points"], g["n_good"])
    return s


def open_session(db: Session, machine: Machine, started_at: datetime) -> MowSession:
    s = MowSession(machine_id=machine.id, operator_id=machine.assigned_user_id,
                   started_at=started_at, status="open", photos=[])
    db.add(s)
    db.commit()
    log.info("session %s opened for %s", s.id, machine.device_id)
    return s


def find_open_session(db: Session, machine_id: int) -> Optional[MowSession]:
    return (db.query(MowSession)
            .filter(MowSession.machine_id == machine_id, MowSession.status == "open")
            .order_by(MowSession.started_at.desc()).first())
