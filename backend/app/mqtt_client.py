"""MQTT yardımcıları: tek seferlik komut yayını."""
import json
import logging

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion

from .config import settings

log = logging.getLogger("grin.mqtt")


def publish_cmd(device_id: str, payload: dict) -> None:
    c = mqtt.Client(CallbackAPIVersion.VERSION2, client_id=f"grin-api-cmd-{device_id}")
    c.username_pw_set(settings.MQTT_ADMIN_USER, settings.MQTT_ADMIN_PASSWORD)
    c.connect(settings.MQTT_HOST, settings.MQTT_PORT, keepalive=10)
    c.loop_start()
    try:
        info = c.publish(f"grin/{device_id}/cmd", json.dumps(payload), qos=1)
        info.wait_for_publish(timeout=5)
    finally:
        c.loop_stop()
        c.disconnect()
