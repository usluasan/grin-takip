"""Ingest worker: MQTT → PostgreSQL. `python -m app.ingest`

- grin/+/telemetry, grin/+/status, grin/+/event aboneliği (QoS 1)
- JSON doğrulama (v=1), hatalı paket loglanır ve atlanır
- 1 sn'de bir toplu insert
- SPEC §7 oturum kuralı: state=mowing & açık oturum yok → aç; 10 dk mowing yok ya da session_end → kapat
"""
import json
import logging
import queue
import threading
import time
from datetime import datetime, timedelta, timezone

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion
from sqlalchemy import text

from .config import settings
from .db import SessionLocal
from .models import Machine
from .sessions_service import close_session, find_open_session, open_session

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("grin.ingest")

STATES = {"mowing", "idle", "transport", "off"}
IDLE_CLOSE = timedelta(minutes=settings.SESSION_IDLE_MINUTES)

q: "queue.Queue[tuple[str, str, dict]]" = queue.Queue(maxsize=50000)
last_mowing: dict[str, datetime] = {}   # device_id -> son mowing zamanı (ts)


def _ts(v) -> datetime:
    if not isinstance(v, (int, float)) or v < 1_500_000_000 or v > 4_100_000_000:
        raise ValueError("ts geçersiz")
    return datetime.fromtimestamp(v, tz=timezone.utc)


def _num(d, k, lo=None, hi=None, required=False):
    v = d.get(k)
    if v is None:
        if required:
            raise ValueError(f"{k} eksik")
        return None
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError(f"{k} sayı değil")
    if (lo is not None and v < lo) or (hi is not None and v > hi):
        raise ValueError(f"{k} aralık dışı: {v}")
    return v


def validate_telemetry(d: dict) -> dict:
    if d.get("v") != 1:
        raise ValueError("paket sürümü v=1 değil")
    t = _ts(d.get("ts"))
    lat = _num(d, "lat", -90, 90)
    lon = _num(d, "lon", -180, 180)
    fix = _num(d, "fix", 0, 9)
    state = d.get("state")
    if state is not None and state not in STATES:
        raise ValueError(f"state geçersiz: {state}")
    soil = d.get("soil")
    if soil is not None and not isinstance(soil, list):
        raise ValueError("soil liste değil")
    has_pos = lat is not None and lon is not None and (fix or 0) > 0
    return {
        "time": t, "lat": lat if has_pos else None, "lon": lon if has_pos else None,
        "fix": int(fix) if fix is not None else None,
        "hacc": _num(d, "hacc", 0), "spd": _num(d, "spd", 0), "hdg": _num(d, "hdg", 0, 360),
        "h_pre": _smallint(_num(d, "h_pre")), "h_post": _smallint(_num(d, "h_post")),
        "us_pre": _smallint(_num(d, "us_pre")), "us_post": _smallint(_num(d, "us_post")),
        "vib": _num(d, "vib", 0), "state": state, "temp": _num(d, "temp", -60, 90),
        "hum": _num(d, "hum", 0, 100), "soil": json.dumps(soil) if soil is not None else None,
        "bat": _num(d, "bat", 0, 10), "seq": _smallint(_num(d, "seq"), 2_147_483_647),
    }


def _smallint(v, hi=32767):
    if v is None:
        return None
    v = int(v)
    return max(-32768, min(hi, v))


def validate_status(d: dict) -> dict:
    if d.get("v") != 1:
        raise ValueError("paket sürümü v=1 değil")
    return {
        "time": _ts(d.get("ts")), "bat": _num(d, "bat", 0, 10), "rssi": _smallint(_num(d, "rssi", -150, 0)),
        "fw": str(d["fw"])[:32] if d.get("fw") is not None else None,
        "sd_free_mb": _smallint(_num(d, "sd_free_mb", 0), 2_147_483_647),
        "ntrip": bool(d["ntrip"]) if d.get("ntrip") is not None else None,
        "sats": _smallint(_num(d, "sats", 0, 200)),
    }


def validate_event(d: dict) -> dict:
    if d.get("v") != 1:
        raise ValueError("paket sürümü v=1 değil")
    typ = d.get("type")
    if typ not in ("session_start", "session_end", "calibrated", "error"):
        raise ValueError(f"event type geçersiz: {typ}")
    return {"time": _ts(d.get("ts")), "type": typ, "msg": str(d.get("msg", ""))[:500]}


# ---------- MQTT ----------
def on_connect(client, userdata, flags, reason_code, properties=None):
    log.info("MQTT bağlı: %s", reason_code)
    client.subscribe([("grin/+/telemetry", 1), ("grin/+/status", 1), ("grin/+/event", 1)])


def on_message(client, userdata, msg):
    parts = msg.topic.split("/")
    if len(parts) != 3 or parts[0] != "grin":
        return
    device_id, kind = parts[1], parts[2]
    try:
        d = json.loads(msg.payload.decode("utf-8"))
        if not isinstance(d, dict):
            raise ValueError("JSON nesne değil")
        if kind == "telemetry":
            row = validate_telemetry(d)
        elif kind == "status":
            row = validate_status(d)
        elif kind == "event":
            row = validate_event(d)
        else:
            return
    except Exception as e:
        log.warning("hatalı paket %s: %s | %r", msg.topic, e, msg.payload[:200])
        return
    try:
        q.put_nowait((device_id, kind, row))
    except queue.Full:
        log.error("kuyruk dolu, paket düşürüldü: %s", msg.topic)


# ---------- DB yazıcı ----------
TELEMETRY_SQL = text("""
INSERT INTO telemetry (time, device_id, geom, fix, hacc, spd, hdg, h_pre, h_post, us_pre, us_post,
                       vib, state, temp, hum, soil, bat, seq)
VALUES (:time, :device_id,
        CASE WHEN :lat IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography END,
        :fix, :hacc, :spd, :hdg, :h_pre, :h_post, :us_pre, :us_post, :vib, :state, :temp, :hum,
        CAST(:soil AS jsonb), :bat, :seq)
""")
STATUS_SQL = text("""
INSERT INTO device_status (time, device_id, bat, rssi, fw, sd_free_mb, ntrip, sats)
VALUES (:time, :device_id, :bat, :rssi, :fw, :sd_free_mb, :ntrip, :sats)
""")

_known_devices: dict[str, Machine] = {}
_known_ts = 0.0


def machine_for(db, device_id: str):
    global _known_ts
    if time.time() - _known_ts > 60:
        _known_devices.clear()
        for m in db.query(Machine).all():
            _known_devices[m.device_id] = m
        _known_ts = time.time()
    return _known_devices.get(device_id)


def handle_sessions(db, telemetry: list[dict], events: list[dict]):
    """Oturum aç/kapat kuralı (SPEC §7)."""
    # telemetri: cihaz başına son mowing zamanı ve en erken mowing
    by_dev: dict[str, list[dict]] = {}
    for r in telemetry:
        by_dev.setdefault(r["device_id"], []).append(r)
    for device_id, rows in by_dev.items():
        m = machine_for(db, device_id)
        if not m:
            continue
        mowing = [r["time"] for r in rows if r["state"] == "mowing"]
        if mowing:
            first, last = min(mowing), max(mowing)
            prev = last_mowing.get(device_id)
            last_mowing[device_id] = max(last, prev) if prev else last
            s = find_open_session(db, m.id)
            if s is None:
                open_session(db, m, first)
            elif prev and first - prev > IDLE_CLOSE:
                # uzun boşluk (örn. SD tamponundan geç gelen veri): eskiyi kapat, yenisini aç
                close_session(db, s.id, ended_at=prev)
                open_session(db, m, first)
    # event: session_end → kapat; session_start → yoksa aç
    for e in events:
        m = machine_for(db, e["device_id"])
        if not m:
            continue
        s = find_open_session(db, m.id)
        if e["type"] == "session_end" and s is not None:
            close_session(db, s.id, ended_at=e["time"])
            last_mowing.pop(e["device_id"], None)
        elif e["type"] == "session_start" and s is None:
            open_session(db, m, e["time"])
            last_mowing[e["device_id"]] = e["time"]
        elif e["type"] == "error":
            log.warning("cihaz hatası %s: %s", e["device_id"], e["msg"])


def close_idle_sessions(db):
    """10 dk boyunca mowing gelmeyen açık oturumları kapat (duvar saatine göre)."""
    now = datetime.now(timezone.utc)
    cutoff = now - IDLE_CLOSE
    rows = db.execute(text("""
        SELECT s.id, m.device_id, s.started_at,
               (SELECT MAX(time) FROM telemetry t WHERE t.device_id = m.device_id
                 AND t.state = 'mowing' AND t.time >= s.started_at) AS last_mow
        FROM sessions s JOIN machines m ON m.id = s.machine_id
        WHERE s.status = 'open'
    """)).all()
    for sid, device_id, started_at, last_mow in rows:
        ref = last_mow or started_at
        if ref < cutoff:
            try:
                close_session(db, sid, ended_at=ref)
                last_mowing.pop(device_id, None)
            except Exception as e:
                db.rollback()
                log.exception("oturum %s kapatılamadı: %s", sid, e)


def writer_loop():
    last_idle_check = 0.0
    while True:
        time.sleep(1.0)
        batch = []
        try:
            while True:
                batch.append(q.get_nowait())
        except queue.Empty:
            pass
        if not batch and time.time() - last_idle_check < 30:
            continue
        tele = [{"device_id": d, **r} for d, k, r in batch if k == "telemetry"]
        stat = [{"device_id": d, **r} for d, k, r in batch if k == "status"]
        evts = [{"device_id": d, **r} for d, k, r in batch if k == "event"]
        try:
            with SessionLocal() as db:
                if tele:
                    db.execute(TELEMETRY_SQL, tele)
                if stat:
                    db.execute(STATUS_SQL, stat)
                db.commit()
                if tele or evts:
                    handle_sessions(db, tele, evts)
                if time.time() - last_idle_check >= 30:
                    close_idle_sessions(db)
                    last_idle_check = time.time()
            if batch:
                log.debug("yazıldı: %d telemetri, %d durum, %d olay", len(tele), len(stat), len(evts))
        except Exception as e:
            log.exception("DB yazma hatası (%d paket kaybedildi): %s", len(batch), e)


def main():
    threading.Thread(target=writer_loop, daemon=True, name="writer").start()
    client = mqtt.Client(CallbackAPIVersion.VERSION2, client_id="grin-ingest", clean_session=False)
    client.username_pw_set(settings.MQTT_ADMIN_USER, settings.MQTT_ADMIN_PASSWORD)
    client.on_connect = on_connect
    client.on_message = on_message
    client.reconnect_delay_set(1, 60)
    while True:
        try:
            client.connect(settings.MQTT_HOST, settings.MQTT_PORT, keepalive=60)
            client.loop_forever(retry_first_connection=True)
        except Exception as e:
            log.warning("MQTT bağlantı hatası: %s — 5 sn sonra tekrar", e)
            time.sleep(5)


if __name__ == "__main__":
    main()
