# GRIN Takip — Backend (API + Ingest)

FastAPI + SQLAlchemy 2 + paho-mqtt. Şema `db/init.sql`, sözleşme `../SPEC.md`.

## 1. Kurulum

```bash
cd grin-takip
cp .env.example .env   # yoksa: DB_PASSWORD, JWT_SECRET, MQTT_ADMIN_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD, SEED_DEMO
docker compose up -d --build
docker compose logs -f api ingest
```

Servisler: `db` (5432, sadece localhost), `mqtt` (1883), `api` (8000), `ingest`, `web` (8080).
Sağlık: `curl http://localhost:8000/health` · Swagger: `http://localhost:8000/docs`

### Mosquitto parola dosyası (önemli)

`api` açılışta `/mosquitto/passwd/passwd` dosyasına `grin-api` kullanıcısını ve her yeni cihazı
`mosquitto_passwd` uyumlu `$7$101$<salt>$<hash>` (PBKDF2-SHA512) biçiminde yazar.
Mosquitto bu dosyayı **yalnızca açılışta ve SIGHUP ile** okur; cihaz ekledikten sonra:

```bash
docker compose kill -s HUP mqtt
```

İlk `up` sırasında dosya henüz yokken `mqtt` birkaç kez yeniden başlayabilir (restart policy);
`api` dosyayı yazdıktan sonra kendiliğinden ayağa kalkar. Pilotta kolaylık isteniyorsa
`mosquitto.conf` içinde `allow_anonymous true` yapılabilir (üretimde **yapma**).

## 2. İlk admin

`ADMIN_EMAIL` / `ADMIN_PASSWORD` (varsayılan `admin@arteverte.com` / `admin123`) yoksa açılışta oluşturulur.

```bash
TOKEN=$(curl -s -X POST localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@arteverte.com","password":"admin123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s localhost:8000/api/v1/me -H "Authorization: Bearer $TOKEN"
```

`SEED_DEMO=1` ise demo veri gelir: müşteri **Emlak Yönetim Hiz. A.Ş.**, 2 saha (Çankaya),
makineler `GRIN-01`/`GRIN-02` (token'lar api logunda: `docker compose logs api | grep "DEMO cihaz"`),
`manager@demo.com` / `demo123`, `operator@demo.com` / `demo123`.

## 3. Müşteri, saha, cihaz ekleme ve token alma

```bash
# Müşteri
curl -s -X POST localhost:8000/api/v1/customers -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"Örnek Site Yönetimi","city":"Ankara"}'

# Saha (GeoJSON Polygon, lon/lat sırası)
curl -s -X POST localhost:8000/api/v1/customers/1/sites -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"Ön bahçe","polygon":{"type":"Polygon","coordinates":[[[32.8595,39.8595],[32.8605,39.8595],[32.8605,39.8605],[32.8595,39.8605],[32.8595,39.8595]]]}}'

# Makine → device_token YALNIZCA bu yanıtta döner, firmware'e yaz
curl -s -X POST localhost:8000/api/v1/customers/1/machines -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"GRIN-03","model":"GRIN HWL 46","cut_width_cm":46,"device_id":"GRIN-03"}'
docker compose kill -s HUP mqtt   # broker yeni cihazı tanısın

# Token yenileme / atama / kesme genişliği
curl -s -X PATCH localhost:8000/api/v1/machines/3 -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"assigned_user_id":3,"cut_width_cm":46,"rotate_token":false}'

# Kullanıcı (manager|operator)
curl -s -X POST localhost:8000/api/v1/customers/1/users -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"email":"saha@ornek.com","password":"gizli123","full_name":"Saha Operatörü","role":"operator"}'
```

## 4. MQTT test (cihazı taklit et)

```bash
# telemetri (1 Hz) — kullanıcı adı = device_id, şifre = device_token
mosquitto_pub -h localhost -p 1883 -u GRIN-01 -P demo-token-grin-01 -q 1 \
  -t grin/GRIN-01/telemetry -m '{"v":1,"ts":'$(date +%s)',"fix":4,"lat":39.8601,"lon":32.8601,"hacc":0.02,"spd":0.9,"hdg":183.4,"h_pre":81,"h_post":40,"us_pre":83,"us_post":41,"vib":2.7,"state":"mowing","temp":24.1,"hum":41,"soil":[28,31],"bat":3.92,"seq":1}'

# durum (30 sn)
mosquitto_pub -h localhost -u GRIN-01 -P demo-token-grin-01 -t grin/GRIN-01/status \
  -m '{"v":1,"ts":'$(date +%s)',"bat":3.92,"rssi":-71,"fw":"0.3.1","sd_free_mb":28000,"ntrip":true,"sats":14}'

# oturumu bitir
mosquitto_pub -h localhost -u GRIN-01 -P demo-token-grin-01 -t grin/GRIN-01/event \
  -m '{"v":1,"ts":'$(date +%s)',"type":"session_end","msg":"operatör bitirdi"}'

# cihaza komut göndermeyi izle
mosquitto_sub -h localhost -u GRIN-01 -P demo-token-grin-01 -t grin/GRIN-01/cmd -v
```

Kısa bir simülasyon (100 m düz iz, ~46 m²):

```bash
for i in $(seq 0 100); do
  LAT=$(python3 -c "print(round(39.8600 + $i/111320, 7))")
  mosquitto_pub -h localhost -u GRIN-01 -P demo-token-grin-01 -q 1 -t grin/GRIN-01/telemetry \
    -m '{"v":1,"ts":'$(( $(date +%s) - 100 + i ))',"fix":4,"lat":'$LAT',"lon":32.8600,"hacc":0.02,"spd":1,"hdg":0,"h_pre":81,"h_post":40,"us_pre":83,"us_post":41,"vib":2,"state":"mowing","temp":24,"hum":40,"soil":[30],"bat":3.9,"seq":'$i'}'
done
```

Oturum kuralı: `state=mowing` görülünce oturum açılır; 10 dk `mowing` gelmezse ya da `session_end`
olayı gelince kapatılır (alan + karbon hesaplanır). Uygulamadan da kapatılabilir:
`POST /api/v1/sessions/{id}/close`.

## 5. API örnekleri

```bash
H="Authorization: Bearer $TOKEN"
curl -s "localhost:8000/api/v1/machines/live" -H "$H"
curl -s "localhost:8000/api/v1/machines/1/track?from=2026-10-01T00:00:00Z&to=2026-10-05T00:00:00Z" -H "$H"
curl -s "localhost:8000/api/v1/sessions?customer_id=1" -H "$H"
curl -s "localhost:8000/api/v1/sessions/1" -H "$H"              # oturum + savings + GeoJSON + hesap izi
curl -s -X POST "localhost:8000/api/v1/sessions/1/close" -H "$H"
curl -s -X PATCH "localhost:8000/api/v1/sessions/1" -H "$H" -H 'Content-Type: application/json' -d '{"note":"Yağmur sonrası","photos":["/uploads/a.jpg"]}'
curl -s "localhost:8000/api/v1/dashboard?customer_id=1&period=month" -H "$H"
curl -s "localhost:8000/api/v1/savings?customer_id=1&from=2026-03-01T00:00:00Z" -H "$H"
curl -s "localhost:8000/api/v1/factors" -H "$H"
curl -s -X PUT "localhost:8000/api/v1/factors" -H "$H" -H 'Content-Type: application/json' \
  -d '[{"key":"trip_km","value":22,"unit":"km/sefer","source":"Saha: Mamak tesisi gidiş-dönüş","is_assumption":true}]'
curl -s -X POST "localhost:8000/api/v1/devices/GRIN-01/cmd" -H "$H" -H 'Content-Type: application/json' -d '{"cmd":"interval","sec":2}'
```

WebSocket canlı yayın: `ws://localhost:8000/ws/live?token=$TOKEN` (ayrıca `/api/v1/ws/live`).
Mesaj: `{"kind":"telemetry|status|event","device_id":"GRIN-01","machine_id":1,"machine":"GRIN-01","data":{...}}`
Kullanıcının rolüne göre süzülür (operator → sadece atandığı makineler).

## 6. Hesaplar

- **Alan (SPEC §4):** `fix>=4` veya `hacc<=0.5` noktalar → UTM'de LineString → her parça
  `cut_width/2` buffer → birleşim = swath, `area_m2` = birleşim alanı,
  `overlap_m2` = parça alanları toplamı − birleşim. `h_pre_avg/h_post_avg`: ToF (−1 yoksayılır), yoksa ultrasonik.
- **Karbon (SPEC §5):** `app/carbon.py`, katsayılar `factors` tablosundan. Her oturumda
  `savings.factors_version` (katsayı setinin imzası) saklanır; `GET /sessions/{id}` ve `GET /savings`
  kalem kalem **hesap izi** (`trace`: kalem, formül, girdi, katsayı, kaynak, sonuç) döner.

## 7. Geliştirme / test

```bash
cd backend
pip install -r requirements.txt
pytest tests            # DB gerekmez (carbon, geo, mosquitto passwd)
uvicorn app.main:app --reload   # DATABASE_URL, MQTT_HOST env ile
python -m app.ingest
```
