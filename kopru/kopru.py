#!/usr/bin/env python3
"""GRIN USB köprüsü (masa testi).
Kart (13_kopru) USB'den her saniye bir JSON satırı yollar; bu program satırı okur,
saat (ts) ekler ve sunucudaki MQTT'ye grin/<cihaz>/telemetry olarak gönderir.
4G modem çalışınca bu programa gerek kalmayacak (kart aynı paketi kendisi yollayacak).

Kullanım:  python3 kopru.py            (portu kendisi bulur)
           python3 kopru.py --konum-yok (haritada test konumu gösterme)
"""
import argparse, glob, json, sys, time

import paho.mqtt.client as mqtt
import serial

p = argparse.ArgumentParser()
p.add_argument("--port", default=None, help="örn. /dev/cu.usbmodem5B910428841")
p.add_argument("--host", default="localhost")
p.add_argument("--cihaz", default="GRIN-01")
p.add_argument("--token", default="demo-token-grin-01")
p.add_argument("--konum-yok", action="store_true")
# Masa testi: GPS henüz yok. Haritada görünsün diye demo Site A'nın ortasına SABİT test konumu konur.
# fix=1 / hacc=5 m olduğu için alan ve karbon hesabına GİRMEZ (alan için fix>=4 gerekiyor).
p.add_argument("--lat", type=float, default=39.8600)
p.add_argument("--lon", type=float, default=32.8600)
a = p.parse_args()

port = a.port or next(iter(sorted(glob.glob("/dev/cu.usbmodem*"))), None)
if not port:
    sys.exit("Kart bulunamadı: USB kablosu takılı mı? Arduino Serial Monitor açıksa KAPAT (portu o tutuyor).")

cli = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"kopru-{a.cihaz}")
cli.username_pw_set(a.cihaz, a.token)
cli.on_connect = lambda c, u, f, rc, pr=None: print(f"MQTT bağlandı ({rc})")
cli.connect(a.host, 1883, 30)
cli.loop_start()

print(f"Kart: {port}  →  MQTT {a.host}:1883  konu grin/{a.cihaz}/telemetry")
ser = serial.Serial(port, 115200, timeout=2)
n = 0
while True:
    try:
        line = ser.readline().decode("utf-8", "ignore").strip()
    except serial.SerialException as e:
        print("Port koptu:", e, "- 3 sn sonra tekrar"); time.sleep(3)
        try: ser = serial.Serial(port, 115200, timeout=2)
        except Exception: pass
        continue
    if not line.startswith("{"):
        if line: print("  kart:", line)
        continue
    try:
        d = json.loads(line)
    except json.JSONDecodeError:
        continue
    d["ts"] = int(time.time())
    if not a.konum_yok:
        d.update({"lat": a.lat, "lon": a.lon, "fix": 1, "hacc": 5.0, "spd": 0, "hdg": 0})
    cli.publish(f"grin/{a.cihaz}/telemetry", json.dumps(d), qos=1)
    n += 1
    print(f"#{n} gönderildi: ön {d.get('h_pre')} mm | arka {d.get('h_post')} mm | ultra {d.get('us_pre')} mm | "
          f"{d.get('temp')}°C %{d.get('hum')} | titreşim {d.get('vib')} {d.get('state')} | pil {d.get('bat')} V")
