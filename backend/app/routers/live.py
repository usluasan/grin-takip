"""WS /ws/live?token= — MQTT'ye paho ile abone olup bağlı soketlere yayar (kullanıcı kapsamına göre süzer).

Mesaj: {"device_id","machine_id","machine","type":"telemetry|status|event","data":{...paket}}; ilk mesaj {"type":"hello"}."""
import asyncio
import json
import logging
import threading
import time
from typing import Optional

import paho.mqtt.client as mqtt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from paho.mqtt.enums import CallbackAPIVersion

from ..auth import user_from_token
from ..config import settings
from ..db import SessionLocal
from ..models import Machine

log = logging.getLogger("grin.live")
router = APIRouter()


class LiveHub:
    def __init__(self):
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.clients: dict[WebSocket, dict] = {}   # ws -> {"role","customer_id","user_id"}
        self.devices: dict[str, dict] = {}          # device_id -> {"customer_id","assigned_user_id","machine_id","name"}
        self._dev_ts = 0.0
        self._lock = threading.Lock()
        self._mqtt: Optional[mqtt.Client] = None

    # --- cihaz haritası (60 sn önbellek) ---
    def refresh_devices(self, force=False):
        if not force and time.time() - self._dev_ts < 60:
            return
        try:
            with SessionLocal() as db:
                self.devices = {m.device_id: {"customer_id": m.customer_id, "assigned_user_id": m.assigned_user_id,
                                              "machine_id": m.id, "name": m.name}
                                for m in db.query(Machine).all()}
            self._dev_ts = time.time()
        except Exception as e:
            log.warning("cihaz haritası okunamadı: %s", e)

    def visible(self, scope: dict, dev: dict) -> bool:
        if scope["role"] == "admin":
            return True
        if dev["customer_id"] != scope["customer_id"]:
            return False
        if scope["role"] == "operator":
            return dev["assigned_user_id"] == scope["user_id"]
        return True

    # --- MQTT ---
    def start(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop
        self.refresh_devices(force=True)
        c = mqtt.Client(CallbackAPIVersion.VERSION2, client_id="grin-api-live", clean_session=True)
        c.username_pw_set(settings.MQTT_ADMIN_USER, settings.MQTT_ADMIN_PASSWORD)
        c.on_connect = self._on_connect
        c.on_message = self._on_message
        c.reconnect_delay_set(1, 30)
        self._mqtt = c
        threading.Thread(target=self._run, daemon=True, name="live-mqtt").start()

    def _run(self):
        while True:
            try:
                self._mqtt.connect(settings.MQTT_HOST, settings.MQTT_PORT, keepalive=30)
                self._mqtt.loop_forever(retry_first_connection=True)
            except Exception as e:
                log.warning("live MQTT bağlantı hatası: %s — 5 sn sonra tekrar", e)
                time.sleep(5)

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        log.info("live MQTT bağlı (%s)", reason_code)
        client.subscribe([("grin/+/telemetry", 0), ("grin/+/status", 0), ("grin/+/event", 0)])

    def _on_message(self, client, userdata, msg):
        parts = msg.topic.split("/")
        if len(parts) != 3:
            return
        device_id, kind = parts[1], parts[2]
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            return
        self.refresh_devices()
        dev = self.devices.get(device_id)
        if not dev:
            return
        # web/src/ws.ts LiveMessage: {device_id, machine_id, type: telemetry|status|event, data}
        event = {"device_id": device_id, "machine_id": dev["machine_id"], "machine": dev["name"],
                 "type": kind, "data": payload}
        if self.loop and self.clients:
            asyncio.run_coroutine_threadsafe(self.broadcast(dev, event), self.loop)

    async def broadcast(self, dev: dict, event: dict):
        text = json.dumps(event)
        dead = []
        for ws, scope in list(self.clients.items()):
            if not self.visible(scope, dev):
                continue
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.pop(ws, None)


hub = LiveHub()


@router.websocket("/ws/live")
async def ws_live(ws: WebSocket, token: Optional[str] = None):
    if not token:
        await ws.close(code=4401)
        return
    try:
        with SessionLocal() as db:
            user = user_from_token(token, db)
            scope = {"role": user.role, "customer_id": user.customer_id, "user_id": user.id}
    except Exception:
        await ws.close(code=4401)
        return
    await ws.accept()
    hub.clients[ws] = scope
    try:
        await ws.send_text(json.dumps({"type": "hello", "role": user.role, "data": None}))
        while True:
            # istemciden gelen mesajlar yoksayılır; ping/pong için bekle
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        hub.clients.pop(ws, None)
