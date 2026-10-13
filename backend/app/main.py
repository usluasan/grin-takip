import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .auth import hash_password
from .config import settings
from .db import SessionLocal
from .models import Customer, Machine, User
from .mosquitto_passwd import read_passwd, set_user
from .routers import (auth, customers, dashboard, devices, factors, live, machines, savings,
                      sessions, sites, users)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("grin.api")

DEMO_TOKENS = {"GRIN-01": "demo-token-grin-01", "GRIN-02": "demo-token-grin-02"}


def ensure_admin(db):
    email = settings.ADMIN_EMAIL.lower()
    if not db.query(User).filter(User.email == email).first():
        db.add(User(customer_id=None, email=email, password_hash=hash_password(settings.ADMIN_PASSWORD),
                    full_name="Arteverte Admin", role="admin", is_active=True))
        db.commit()
        log.info("Admin kullanıcı oluşturuldu: %s", email)


def ensure_mqtt_admin():
    """grin-api kullanıcısını Mosquitto passwd dosyasına ($7$ PBKDF2-SHA512) yazar."""
    try:
        users = read_passwd(settings.MQTT_PASSWD_FILE)
        if settings.MQTT_ADMIN_USER not in users:
            set_user(settings.MQTT_PASSWD_FILE, settings.MQTT_ADMIN_USER, settings.MQTT_ADMIN_PASSWORD)
            log.info("Mosquitto passwd: %s eklendi (%s). Broker'ın yeniden okuması için: "
                     "docker compose kill -s HUP mqtt", settings.MQTT_ADMIN_USER, settings.MQTT_PASSWD_FILE)
    except OSError as e:
        log.warning("Mosquitto passwd dosyası yazılamadı (%s): %s", settings.MQTT_PASSWD_FILE, e)


def _square(lat, lon, half_deg):
    return {"type": "Polygon", "coordinates": [[
        [lon - half_deg, lat - half_deg], [lon + half_deg, lat - half_deg],
        [lon + half_deg, lat + half_deg], [lon - half_deg, lat + half_deg],
        [lon - half_deg, lat - half_deg]]]}


def seed_demo(db):
    import json
    if db.query(Customer).filter(Customer.name == "Emlak Yönetim Hiz. A.Ş.").first():
        return
    c = Customer(name="Emlak Yönetim Hiz. A.Ş.", city="Ankara", contract_start=datetime.now(timezone.utc).date())
    db.add(c)
    db.flush()
    manager = User(customer_id=c.id, email="manager@demo.com", password_hash=hash_password("demo123"),
                   full_name="Demo Yönetici", role="manager")
    operator = User(customer_id=c.id, email="operator@demo.com", password_hash=hash_password("demo123"),
                    full_name="Demo Operatör", role="operator")
    db.add_all([manager, operator])
    db.flush()
    # ~0.0005° ≈ 55 m → yaklaşık 110 m × 110 m kareler (Çankaya)
    for name, lat, lon in (("Site A — Çankaya Parkı", 39.8600, 32.8600), ("Site B — Konut Bahçesi", 39.8625, 32.8630)):
        db.execute(text("""
            INSERT INTO sites (customer_id, name, polygon, grass_area_m2, notes)
            VALUES (:c, :n, ST_SetSRID(ST_GeomFromGeoJSON(CAST(:p AS text)), 4326)::geography,
                    ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(CAST(:p AS text)), 4326)::geography), 'Demo saha')
        """), {"c": c.id, "n": name, "p": json.dumps(_square(lat, lon, 0.0005))})
    for dev, token in DEMO_TOKENS.items():
        db.add(Machine(customer_id=c.id, name=dev, model="GRIN HWL 46", cut_width_cm=46, device_id=dev,
                       device_token_hash=hash_password(token), assigned_user_id=operator.id))
        try:
            set_user(settings.MQTT_PASSWD_FILE, dev, token)
        except OSError as e:
            log.warning("Mosquitto passwd yazılamadı: %s", e)
    db.commit()
    log.info("DEMO seed: müşteri=%s, manager@demo.com/demo123, operator@demo.com/demo123", c.name)
    for dev, token in DEMO_TOKENS.items():
        log.info("DEMO cihaz: device_id=%s device_token=%s", dev, token)


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    with SessionLocal() as db:
        ensure_admin(db)
        if settings.SEED_DEMO == "1":
            seed_demo(db)
    ensure_mqtt_admin()
    live.hub.start(asyncio.get_running_loop())
    yield


app = FastAPI(title="GRIN Takip API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware,
                   allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")] or ["*"],
                   allow_credentials=False, allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    # SPEC §6: hata biçimi {"detail": "..."}
    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(x) for x in first.get("loc", []) if x != "body")
    return JSONResponse(status_code=422, content={"detail": f"Geçersiz istek: {loc} — {first.get('msg', '')}"})


API = "/api/v1"
for r in (auth.router, customers.router, sites.router, machines.router, users.router,
          sessions.router, dashboard.router, savings.router, factors.router, devices.router):
    app.include_router(r, prefix=API)
# Oturum fotoğrafları: POST /sessions/{id}/photos → UPLOAD_DIR; servis: /api/v1/uploads/<dosya>
try:
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
except OSError as e:
    log.warning("UPLOAD_DIR oluşturulamadı (%s): %s", settings.UPLOAD_DIR, e)
app.mount(f"{API}/uploads", StaticFiles(directory=settings.UPLOAD_DIR, check_dir=False), name="uploads")
app.include_router(live.router)            # /ws/live
app.include_router(live.router, prefix=API)  # /api/v1/ws/live (proxy arkası için)


@app.get("/health")
def health():
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return {"ok": True, "time": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        return JSONResponse(status_code=503, content={"ok": False, "detail": str(e)})
