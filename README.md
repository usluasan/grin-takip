# GRIN Akıllı Çim Biçme Takip Sistemi — Kod Deposu

Arteverte / GRIN Türkiye pilot projesi. Üç parça, tek depo:

| Klasör | Ne | Teknoloji |
|---|---|---|
| `firmware/` | Makineye takılan modülün yazılımı (Waveshare ESP32-S3 A7670E) | Arduino C++ |
| `backend/` | Veri alma (MQTT ingest) + REST API + veritabanı | Python FastAPI, PostgreSQL/PostGIS/TimescaleDB, Mosquitto |
| `web/` | Yönetici paneli + saha (mobil PWA) arayüzü | React + TypeScript + Leaflet |
| `SPEC.md` | Üç parçanın ortak sözleşmesi: veri formatı, MQTT konuları, API, DB şeması, karbon formülleri | — |

Önce `SPEC.md`'yi oku; her şey oraya göre yazıldı.

## 1. Sunucuda çalıştırma (5 dakika)

Gerekli: Docker + Docker Compose (SAP sunucusunda ayrı bir VM/kullanıcı önerilir, 2 vCPU / 4 GB yeter).

```bash
unzip grin-takip.zip && cd grin-takip
cp .env.example .env
nano .env            # DB_PASSWORD, JWT_SECRET, MQTT_ADMIN_PASSWORD, ADMIN_PASSWORD → değiştir
docker compose up -d --build
docker compose logs -f api ingest    # "Uvicorn running" ve "MQTT bağlı" görünce hazır
```

Açılan adresler (sunucu IP'si ile):

| Adres | Ne |
|---|---|
| `http://SUNUCU:8080` | Web uygulaması |
| `http://SUNUCU:8000/docs` | API dokümanı (Swagger) |
| `SUNUCU:1883` | MQTT (modüller buraya bağlanır) — güvenlik duvarında bu portu aç |

Giriş: `.env`'deki `ADMIN_EMAIL` / `ADMIN_PASSWORD` (varsayılan `admin@arteverte.com` / `admin123`).
`SEED_DEMO=1` iken demo veri de gelir: `manager@demo.com` ve `operator@demo.com` (şifre `demo123`), makineler `GRIN-01`/`GRIN-02`.

Web uygulaması API'ye ulaşamazsa kendiliğinden **demo moduna** geçer (sahte veriyle çalışır) — tasarımı göstermek için yeterli.

## 2. Yeni makine ekleme → modül token'ı

1. Web → Müşteriler → müşteri seç → Makine ekle (`device_id` örn. `GRIN-03`).
2. Dönen **device_token yalnızca bir kez gösterilir**; kopyala.
3. `firmware/grin_module/config.h` içine `DEVICE_ID` ve `DEVICE_TOKEN` yaz.
4. Sunucuda: `docker compose kill -s HUP mqtt` (broker yeni cihazı tanısın).

Ayrıntı ve curl örnekleri: `backend/README.md`.

## 3. Modülü programlama

1. Arduino IDE 2.x → Boards Manager → **esp32 by Espressif 3.x**.
2. Kart: **ESP32S3 Dev Module**; USB CDC On Boot **Enabled**; PSRAM **OPI**; Flash **16MB**.
3. Kütüphaneleri kur (liste `firmware/README.md`).
4. Önce `firmware/sensor_test/` yükle → Serial Monitor'de her sensörün değerini gör. Beton zeminde `c` + Enter ile montaj yüksekliği kalibrasyonu.
5. Sonra `firmware/grin_module/` → `config.h`'de APN, `MQTT_HOST` (sunucu IP), token, NTRIP bilgileri → yükle.

Pin planı: `firmware/grin_module/config.h` = Masa Bağlantı Rehberi ile aynı.

## 4. Veri akışı (özet)

```
Modül ──4G/MQTT──▶ Mosquitto ──▶ ingest ──▶ PostgreSQL (TimescaleDB + PostGIS)
                                                 │
Web (yönetici / saha) ◀── REST + WebSocket ◀── api
```

- Modül saniyede 1 telemetri paketi yollar (`grin/<device_id>/telemetry`).
- `ingest` paketi yazar, `mowing` durumu başlayınca **oturum** açar, 10 dk `mowing` yoksa kapatır; oturum kapanınca alan (m²), çim miktarı (kg) ve karbon tasarrufu hesaplanıp `savings` tablosuna yazılır.
- Karbon formülleri ve kaynaklı emisyon faktörleri `factors` tablosunda (`is_assumption` ile işaretli); web'den düzenlenebilir.

## 5. Geliştirme (Docker'sız)

```bash
# backend
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
pytest                      # 15 test
# web
cd web && npm install && npm run dev   # http://localhost:5173, API yoksa demo modu
```

## 6. Henüz doğrulanmamış / bilinen eksikler

Dürüst liste — ilk denemede bunlara bakılmalı:

- **Firmware derlenmedi.** Bu ortamda ESP32 araç zinciri kurulamadı; ilk `Verify` sırasında küçük derleme hataları çıkabilir (kütüphane sürüm farkı vb.). Hata metnini gönder, düzeltirim.
- **Modem UART pinleri (18/17)** kart dokümanına göre; `sensor_test`'ten sonra rehberdeki AT testiyle doğrula.
- `docker compose up` canlı sunucuda henüz çalıştırılmadı; `init.sql` test edilmedi. İlk açılışta `mqtt` konteyneri parola dosyası yazılana kadar 1–2 kez yeniden başlar, normaldir.
- Firmware'de yapılacaklar: OTA güncelleme, telemetri periyodu komutu, kalibrasyonu kalıcı saklama (NVS), TLS MQTT (8883), gerçek hAcc (UBX).
- RTK için TUSAGA-Aktif aboneliği ve ZED-F9P (Mouser siparişi) bekliyor; GNSS olmadan sistem çalışır ama alan hesabı yapılmaz (`fix=0`).
- Sunucuyu dışa açarken: 8080/8000 önüne HTTPS (Caddy/nginx), 1883 yerine 8883 — pilot sonrası.

## 7. Sonraki aşamalar

3 — Devre şeması / PCB / IP67 muhafaza · 4 — Firmware eksiklerinin tamamlanması · 7 — Karbon hesap raporu (çevre kurumları için) · 8 — Saha test planı
