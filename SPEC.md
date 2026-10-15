# GRIN Takip — Sistem Sözleşmesi (SPEC)

Bu dosya firmware, backend ve web uygulamasının ortak dilidir. Değişiklik buradan başlar.

## 1. Bileşenler

| Bileşen | Teknoloji | Klasör |
|---|---|---|
| Modül yazılımı | Arduino (ESP32-S3 + A7670E) | `firmware/` |
| MQTT broker | Eclipse Mosquitto 2 | `backend/mosquitto/` |
| Veritabanı | PostgreSQL 16 + PostGIS + TimescaleDB | `backend/db/` |
| API + ingest | Python 3.12, FastAPI, SQLAlchemy 2, paho-mqtt, shapely | `backend/app/` |
| Web uygulaması | React 18 + Vite + TypeScript + Leaflet | `web/` |
| Orkestrasyon | Docker Compose | `docker-compose.yml` |

## 2. Roller

| Rol | Görür | Yapar |
|---|---|---|
| `admin` (Arteverte) | Tüm müşteriler | Müşteri, saha, makine, kullanıcı oluşturur; katsayıları düzenler |
| `manager` (müşteri yöneticisi) | Kendi müşterisinin tümü | Kullanıcı davet eder, saha çizer, rapor alır |
| `operator` (saha operatörü) | Atandığı makineler, kendi oturumları | Canlı ekran, iş kartı, not/fotoğraf |

Kimlik: e-posta + şifre (bcrypt), JWT (access 8 saat). Makine kimliği: `device_id` + `device_token` (MQTT kullanıcı adı/şifre).

## 3. MQTT

Broker: `mqtt://<sunucu>:1883` (pilot), TLS 8883 (üretim). Her cihazın kullanıcı adı = `device_id`, şifre = `device_token`.

| Konu | Yön | İçerik |
|---|---|---|
| `grin/<device_id>/telemetry` | cihaz → bulut | 1 Hz telemetri (aşağıda) |
| `grin/<device_id>/status` | cihaz → bulut | 30 sn'de bir sağlık (pil, sinyal, sürüm) |
| `grin/<device_id>/event` | cihaz → bulut | oturum başı/sonu, hata |
| `grin/<device_id>/cmd` | bulut → cihaz | `{"cmd":"reboot"}`, `{"cmd":"interval","sec":1}` (1–60), `{"cmd":"calibrate"}`, `{"cmd":"ota","url":"..."}` (henüz yok) |

### 3.1 Telemetri paketi (JSON, QoS 1)

```json
{
  "v": 1,
  "ts": 1759600000,
  "fix": 4,
  "lat": 39.9031234,
  "lon": 32.8541234,
  "hacc": 0.02,
  "spd": 0.9,
  "hdg": 183.4,
  "h_pre": 81,
  "h_post": 40,
  "us_pre": 83,
  "us_post": 41,
  "vib": 2.7,
  "state": "mowing",
  "temp": 24.1,
  "hum": 41,
  "soil": [28, 31],
  "bat": 3.92,
  "seq": 18234
}
```

| Alan | Tip | Açıklama |
|---|---|---|
| `v` | int | paket sürümü |
| `ts` | int | Unix saniye (GNSS UTC) |
| `fix` | int | 0 yok, 1 GPS, 2 DGPS, 4 RTK fix, 5 RTK float |
| `lat`,`lon` | float | derece, 7 ondalık |
| `hacc` | float | yatay doğruluk, m |
| `spd` | float | m/s |
| `hdg` | float | derece |
| `h_pre`,`h_post` | int | ToF ile çim boyu, mm (−1 = ölçüm yok) |
| `us_pre`,`us_post` | int | ultrasonik ile çim boyu, mm |
| `vib` | float | IMU titreşim RMS, m/s² |
| `state` | string | `mowing` / `idle` / `transport` / `off` |
| `temp`,`hum` | float | °C, % |
| `soil` | int[] | toprak nemi %, sensör sırasıyla |
| `bat` | float | pil V |
| `seq` | int | artan sayaç (kayıp tespiti) |

Şebeke yokken aynı satırlar SD'ye `buffer.jsonl` olarak yazılır; bağlantı gelince sırayla aynı konuya gönderilir (`ts` orijinal kalır).

### 3.2 Durum paketi

```json
{"v":1,"ts":1759600000,"bat":3.92,"rssi":-71,"fw":"0.4.0","sd_free_mb":28000,"ntrip":true,"sats":14,"cal":true}
```

`cal` (fw 0.4.0+, isteğe bağlı): montaj yüksekliği sahada kalibre edildi mi. `false` ise çim boyu `DEFAULT_MOUNT_HEIGHT_MM` varsayımıyla hesaplanmıştır. Sunucu şimdilik saklamaz.

### 3.3 Olay paketi

```json
{"v":1,"ts":1759600000,"type":"session_start|session_end|calibrated|error","msg":"..."}
```

`calibrated`: montaj yüksekliği kalibre edildi (Serial `c` ya da `{"cmd":"calibrate"}`). Kalibrasyon ölçüm alamazsa `error` / `calibration_failed_no_reading`.

## 4. Veritabanı (PostgreSQL)

```
customers      id, name, city, contract_start, contract_end, created_at
sites          id, customer_id, name, polygon (geography), grass_area_m2, notes
machines       id, customer_id, name, model, cut_width_cm, device_id (uniq), device_token_hash, assigned_user_id, created_at
users          id, customer_id (null=admin), email (uniq), password_hash, full_name, role, is_active, created_at
telemetry      time, device_id, geom (geography point), fix, hacc, spd, hdg, h_pre, h_post, us_pre, us_post, vib, state, temp, hum, soil jsonb, bat, seq   -- Timescale hypertable (time)
device_status  time, device_id, bat, rssi, fw, sd_free_mb, ntrip, sats
sessions       id, machine_id, operator_id, site_id, started_at, ended_at, area_m2, overlap_m2, dist_m, h_pre_avg, h_post_avg, fix_ratio, track (geography linestring), swath (geography polygon), note, photos jsonb, status
savings        session_id (pk), grass_kg, bags, trips, diesel_l, co2_disposal_kg, co2_transport_kg, co2_bags_kg, co2_total_kg, factors_version
factors        key (pk), value numeric, unit, source, is_assumption bool, updated_at
```

Alan hesabı: oturumun `fix>=4` (veya `hacc<=0.5`) noktalarından LineString; `ST_Buffer(line, cut_width/2)` → swath; `ST_Area(swath)` = alan (m²). Çakışma: parça parça buffer'ların toplam alanı − birleşik alan.

## 5. Karbon motoru (factors tablosu, varsayılanlar)

| key | value | unit | source | assumption |
|---|---|---|---|---|
| `grass_kg_per_m2_per_cm` | 0.195 | kg/(m²·cm) | saha kalibrasyonu | **evet** |
| `bag_capacity_kg` | 8 | kg/poşet | varsayım | **evet** |
| `bag_mass_g` | 30 | g | varsayım | **evet** |
| `ef_ldpe_kg_co2e_per_kg` | 2.1 | kgCO₂e/kg | DEFRA 2025 plastik | hayır |
| `truck_capacity_kg` | 900 | kg/sefer | varsayım | **evet** |
| `trip_km` | 18 | km | saha | **evet** |
| `truck_l_per_km` | 0.3 | L/km | varsayım | **evet** |
| `ef_diesel_kg_co2e_per_l` | 2.57 | kgCO₂e/L | DEFRA 2025 | hayır |
| `ef_landfill_kg_co2e_per_t` | 446 | kgCO₂e/t | DEFRA 2025 karışık atık | hayır |

Formüller:
```
grass_kg       = area_m2 × max(0, (h_pre_avg − h_post_avg)/10) × grass_kg_per_m2_per_cm
bags           = grass_kg / bag_capacity_kg
trips          = grass_kg / truck_capacity_kg
diesel_l       = trips × trip_km × truck_l_per_km
co2_bags       = bags × bag_mass_g/1000 × ef_ldpe
co2_transport  = diesel_l × ef_diesel
co2_disposal   = grass_kg/1000 × ef_landfill
co2_total      = toplam
```

## 6. REST API (prefix `/api/v1`)

| Yöntem | Uç | Rol | Açıklama |
|---|---|---|---|
| POST | `/auth/login` | — | `{email,password}` → `{token,user}` |
| GET | `/me` | her | kullanıcı |
| GET/POST | `/customers` | admin | |
| GET/PATCH | `/customers/{id}` | admin, manager(kendi) | |
| GET/POST | `/customers/{id}/sites` | admin, manager | polygon GeoJSON |
| GET/POST | `/customers/{id}/machines` | admin, manager | POST → `device_token` bir kez döner |
| PATCH | `/machines/{id}` | admin, manager | atama, kesme genişliği |
| GET/POST | `/customers/{id}/users` | admin, manager | |
| GET | `/machines/live` | her (rolüne göre süzülür) | son konum+durum, makine başına |
| GET | `/machines/{id}/track?from&to` | her | GeoJSON LineString + swath |
| GET | `/sessions?customer_id&machine_id&operator_id&from&to` | her | liste satırlarında `savings` de var |
| GET | `/sessions/{id}` | her | oturum + savings + GeoJSON |
| PATCH | `/sessions/{id}` | operator(kendi), manager | note, photos |
| POST | `/sessions/{id}/close` | operator, manager | alan + tasarruf hesaplar |
| POST | `/sessions/{id}/photos` | operator(kendi), manager | multipart `file` → `UPLOAD_DIR`, yanıt oturum + `url` |
| GET | `/uploads/<dosya>` | — (statik) | yüklenen fotoğraflar |
| GET | `/dashboard?customer_id&period=day|month|season` | her | KPI'lar, günlük seri, uyarılar |
| GET | `/savings?customer_id&from&to` | her | kalem kalem + hesap izi |
| GET/PUT | `/factors` | admin | katsayılar |
| POST | `/devices/{device_id}/cmd` | admin, manager, operator(atandığı makine) | MQTT komut |
| WS | `/ws/live?token=` | her | canlı telemetri yayını |

Hata biçimi: `{"detail":"..."}`. Tarihler ISO 8601 UTC. Alan ayrıntıları için §6.1.

### 6.1 Yanıt şemaları

Sözleşme: `web/src/types.ts` ↔ `backend/app/schemas.py` (OpenAPI: `/docs`). Tarihler ISO 8601 UTC; `from`/`to` sorgu parametreleri `YYYY-MM-DD` (gün dahil, `to` gün sonuna kadar) ya da tam ISO alır. Tüm uçlar `/api/v1` altındadır; hata `{"detail":"..."}`.

**POST `/auth/login` → `{token, user}`**, **GET `/me` → `User`**
```json
{"token":"<jwt>","user":{"id":3,"customer_id":1,"email":"op@x.com","full_name":"Mehmet Demir","role":"operator",
 "is_active":true,"created_at":"2026-09-01T08:00:00Z","assigned_machine_id":1,"machine_name":"GRIN-01","status":"active"}}
```
`assigned_machine_id`/`machine_name`: operatörün ilk atanmış makinesi (yoksa null). `status`: `active` | `invited` (= `!is_active`).

**GET/POST `/customers`, GET/PATCH `/customers/{id}` → `Customer`**
```json
{"id":1,"name":"Emlak Yönetim Hiz. A.Ş.","city":"Ankara","contract_start":"2026-03-01","contract_end":null,
 "created_at":"2026-03-01T09:00:00Z","site_count":2,"machine_count":2,"user_count":3}
```

**GET/POST `/customers/{id}/sites` → `Site`** (POST gövdesi `{name, polygon, grass_area_m2?, notes?}`; `grass_area_m2` boşsa poligondan hesaplanır)
```json
{"id":1,"customer_id":1,"name":"Site A","polygon":{"type":"Polygon","coordinates":[[[32.86,39.86],[32.861,39.86],[32.861,39.861],[32.86,39.861],[32.86,39.86]]]},
 "grass_area_m2":12100.0,"notes":null,"week_pct":42}
```
`week_pct`: bu hafta (Pazartesi 00:00 UTC'den) bu sahada kapanan oturum alanı / `grass_area_m2` × 100 (alan 0 ise null).

**GET `/customers/{id}/machines` → `Machine[]`**, **POST → `Machine & {device_token}`**, **PATCH `/machines/{id}` → `Machine & {device_token?}`** (`rotate_token:true` ise dolu)
```json
{"id":1,"customer_id":1,"name":"GRIN-01","model":"GRIN HWL 46","cut_width_cm":46,"device_id":"GRIN-01","assigned_user_id":3,
 "assigned_user_name":"Mehmet Demir","created_at":"2026-03-01T09:00:00Z","state":"mowing","month_area_m2":31200.0,"bat_pct":69,"last_seen":"2026-10-04T09:41:58Z"}
```

**GET/POST `/customers/{id}/users` → `User`** (POST gövdesi `{email, password(≥6), full_name, role: manager|operator, assigned_machine_id?}`; davet e-postası yok, kullanıcı aktif oluşur)

**GET `/machines/live?customer_id=` → `LiveMachine[]`** (admin `customer_id` ile süzer; manager kendi müşterisi; operator atandığı makineler)
```json
{"machine_id":1,"name":"GRIN-01","device_id":"GRIN-01","customer_id":1,"customer_name":"Emlak Yönetim Hiz. A.Ş.",
 "operator_name":"Mehmet Demir","site_name":"Site A","state":"mowing","lat":39.8601234,"lon":32.8601234,"hdg":183.4,"spd":0.9,
 "fix":4,"hacc":0.02,"sats":14,"h_pre":81,"h_post":40,"bat":3.92,"bat_pct":69,"rssi":-71,
 "last_seen":"2026-10-04T09:41:58Z","session_started_at":"2026-10-04T06:42:10Z","today_area_m2":2140.0}
```
`state`: son telemetri `state`'i; telemetri yoksa, `off` ise veya 10 dk'dan eskiyse `offline`. `last_seen` = max(telemetri, durum paketi). `bat_pct` = Li-ion 1S kaba yaklaşım (3,3 V→%0, 4,2 V→%100; **varsayım**, firmware yüzde göndermez). `site_name`: makinenin saha atanmış son oturumu. `today_area_m2`: bugün (UTC) başlayan kapanmış oturumların toplamı.

**GET `/machines/{id}/track?from&to` → `TrackResponse`** (varsayılan son 24 saat)
```json
{"machine_id":1,"from":"2026-10-04T00:00:00Z","to":"2026-10-04T09:42:00Z",
 "track":{"type":"LineString","coordinates":[[32.86,39.86],[32.8605,39.86]]},
 "swath":{"type":"MultiPolygon","coordinates":[[[[32.86,39.8599977],[32.8605,39.8599977],[32.8605,39.8600023],[32.86,39.8600023],[32.86,39.8599977]]]]},
 "sessions":[{"id":17,"swath":{"type":"MultiPolygon","coordinates":[]},"is_today":true}],
 "summary":{"n_points":1200,"n_good":1164,"fix_ratio":0.97,"area_m2":2140.3,"overlap_m2":90.1,"dist_m":4650.2,"h_pre_avg":81.0,"h_post_avg":40.2}}
```
`track`/`swath` aralıktaki iyi noktalardan anlık hesaplanır; `sessions` aralıkta başlayan, swath'ı kayıtlı oturumlar.

**GET `/sessions?customer_id&machine_id&operator_id&site_id&from&to&status&limit` → `Session[]`**, **GET `/sessions/{id}` → `Session` (+ `hacc_avg, temp_avg, hum_avg, soil_avg, track, swath, trace`)**, **PATCH `/sessions/{id}` `{note?, photos?, site_id?}` → `Session`**, **POST `/sessions/{id}/close` → `Session` (detay)**
```json
{"id":17,"machine_id":1,"machine_name":"GRIN-01","machine_model":"GRIN HWL 46","device_id":"GRIN-01",
 "operator_id":3,"operator_name":"Mehmet Demir","site_id":1,"site_name":"Site A",
 "started_at":"2026-10-04T06:42:10Z","ended_at":"2026-10-04T09:33:00Z",
 "area_m2":3420.5,"overlap_m2":140.2,"dist_m":7430.0,"h_pre_avg":81.0,"h_post_avg":40.2,"fix_ratio":0.97,
 "note":null,"photos":["/api/v1/uploads/s17-3f9a….jpg"],"status":"closed",
 "savings":{"session_id":17,"grass_kg":272.1,"bags":34.0,"trips":0.302,"diesel_l":1.63,"co2_disposal_kg":121.4,
            "co2_transport_kg":4.2,"co2_bags_kg":2.1,"co2_total_kg":127.7,"factors_version":"a1b2c3d4e5f6","computed_at":"2026-10-04T09:33:01Z"},
 "hacc_avg":0.021,"temp_avg":24.1,"hum_avg":41.0,"soil_avg":29.5,
 "track":{"type":"LineString","coordinates":[]},"swath":{"type":"MultiPolygon","coordinates":[]},"trace":[]}
```
Liste satırlarında `savings` vardır (açık oturumda null); `hacc_avg…trace` yalnız detayda. Çim boyları mm, `hacc_avg` m.

**POST `/sessions/{id}/photos`** (multipart `file`: JPEG/PNG/WebP/HEIC, ≤15 MB) **→ `Session & {url}`**; dosya `UPLOAD_DIR`'e yazılır, `/api/v1/uploads/<dosya>` adresinden (kimlik doğrulamasız) servis edilir ve `photos[]`'a eklenir.
```json
{"id":17,"...":"(yukarıdaki detay)","photos":["/api/v1/uploads/s17-3f9a….jpg"],"url":"/api/v1/uploads/s17-3f9a….jpg"}
```

**GET `/dashboard?customer_id&period=day|month|season` → `Dashboard`**
```json
{"period":"month","from":"2026-10-01T00:00:00Z","to":"2026-10-04T09:42:00Z","customer_id":1,
 "area_m2":124300.0,"area_change_pct":12.3,"grass_kg":9900.0,"bags":1240.0,"co2_total_kg":4620.1,"sessions":48,
 "machines_active":3,"machines_total":5,"machines_silent":1,
 "daily":[{"date":"2026-09-21","area_m2":6200.0},{"date":"2026-10-04","area_m2":2140.0}],
 "machines":[{"machine_id":1,"name":"GRIN-01","state":"mowing","site_name":"Site A","today_area_m2":2140.0,"last_seen":"2026-10-04T09:41:58Z"}],
 "alerts":[{"level":"warn","title":"GRIN-07 çevrimdışı","detail":"Son veri: 3 gün önce · Site B"}]}
```
`area_change_pct`: önceki eş döneme göre (day→önceki gün, month→önceki ayın aynı gününe kadar, season→geçen yılın aynı aralığı); önceki dönem 0 ise null. `machines_active`: `state=mowing`. `machines_silent`: 3 günden uzun veri yok. `daily`: son 14 gün (UTC), boş günler 0. `alerts.level`: `warn` (çevrimdışı, pil < 3,5 V) · `info` (biçerken RTK fix yok) · `ok` (uyarı yok).

**GET `/savings?customer_id&from&to` → `SavingsReport`**
```json
{"customer_id":1,"customer_name":"Emlak Yönetim Hiz. A.Ş.","from":"2026-09-01T00:00:00Z","to":"2026-10-01T00:00:00Z",
 "area_m2":124300.0,"h_cut_avg_cm":4.1,"sessions":48,
 "totals":{"grass_kg":9900.0,"bags":1237.5,"trips":11.0,"diesel_l":59.4,"co2_disposal_kg":4415.4,"co2_transport_kg":152.7,"co2_bags_kg":78.0,"co2_total_kg":4646.1,"factors_version":"a1b2c3d4e5f6"},
 "monthly":[{"month":"2026-01","co2_total_kg":0.0},{"month":"2026-09","co2_total_kg":4646.1},{"month":"2026-10","co2_total_kg":312.0}],
 "by_site":[{"site_id":1,"site_name":"Site A","co2_total_kg":2610.0,"area_m2":70100.0}],
 "audit":[{"item":"Çim kütlesi","formula":"area_m2 × kesilen_cm × grass_kg_per_m2_per_cm","input":"area_m2=124.300 · kesilen_cm=4,10",
           "factor":"0,195","source":"Saha kalibrasyonu (…)","is_assumption":true,"result":"9.900 kg"}],
 "season_total_kg":19800.0,"factors_version":"a1b2c3d4e5f6","trace":[]}
```
`totals`: aralıktaki kapanmış oturumların `savings` satır toplamı (kesin değer). `audit`/`trace`: toplam alan ve alan-ağırlıklı ortalama boylarla mevcut katsayılardan yeniden üretilen hesap izi (bilgi amaçlı; satır sayıları Türkçe biçimde metin). `monthly`: `from` yılının ayları, Ocak'tan bugüne (geçmiş yılsa Aralık'a). `by_site`: aralıkta saha bazında (`site_id` 0 = saha atanmamış). `h_cut_avg_cm` = (h_pre − h_post)/10 alan-ağırlıklı. `season_target_kg` üretilmez (hedef tanımı yok).

**GET/PUT `/factors` → `Factor[]`** — `{key, value, unit, source, is_assumption, updated_at}`.

**POST `/devices/{device_id}/cmd`** (admin/manager kapsamındaki cihaz; operator yalnız atandığı makine) **→** `{"ok":true,"topic":"grin/GRIN-01/cmd","payload":{"cmd":"interval","sec":30}}`

**WS `/ws/live?token=`** — ilk mesaj `{"type":"hello","role":"operator","data":null}` (istemci yoksayar); sonra:
```json
{"device_id":"GRIN-01","machine_id":1,"machine":"GRIN-01","type":"telemetry","data":{"v":1,"ts":1759600000,"fix":4,"lat":39.9031234,"lon":32.8541234,"hacc":0.02,"spd":0.9,"hdg":183.4,"h_pre":81,"h_post":40,"us_pre":83,"us_post":41,"vib":2.7,"state":"mowing","temp":24.1,"hum":41,"soil":[28,31],"bat":3.92,"seq":18234}}
```
`type` ∈ `telemetry|status|event`; `data` ilgili §3 paketidir (ham, dönüştürülmez). Kullanıcı kapsamı dışındaki cihazlar yayılmaz.

## 7. Oturum (session) kuralı

Ingest worker, cihazdan `state=mowing` görünce ve açık oturum yoksa oturum açar; 10 dk boyunca `mowing` gelmezse veya `session_end` olayı gelirse kapatır ve `/sessions/{id}/close` mantığını çalıştırır. Operatör uygulamadan da kapatabilir.

## 8. Firmware pinleri (Waveshare ESP32-S3 A7670E)

| Birim | Pin |
|---|---|
| I²C SDA/SCL | 15 / 16 |
| VL53L1X #2 XSHUT | 7 |
| A02YYUW (ESP RX, yazılım seri 9600; tek sensör → `us_pre`) | 39 |
| GNSS UART (ESP RX / TX) | 41 / 42 |
| Modem UART (ESP RX / TX) | 17 / 18, 115200 baud (AT testiyle doğrulandı, 2026-10-14) |
| microSD (CMD/CLK/DATA) | 4 / 5 / 6 |
| RGB LED | 38 |
| UART dağılımı | UART0 = USB konsol (CDC kapalı), UART1 = modem, UART2 = GNSS, ultrasonik = yazılım seri |
