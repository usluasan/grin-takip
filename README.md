# GRIN Akıllı Çim Biçme Takip Sistemi

Arteverte Peyzaj / GRIN Türkiye pilot projesi. Benzinli yürüyüşlü GRIN çim biçme makinesine takılan modül (sensörler + RTK GPS + 4G) ve verisini gösteren web/PWA uygulaması. Amaç: malçlama sayesinde torbalı biçime göre karbon tasarrufunu ölçüp denetlenebilir biçimde kanıtlamak.

Güncel sürüm: `SURUM` dosyası · Sürüm geçmişi: `SURUMLER.md` · Proje durumu ve donanım tablosu: `DEVIR-NOTU.md` · Ortak sözleşme: `SPEC.md` · Çalışma kuralları: `CLAUDE.md`

| Klasör | Ne | Durum (2026-10-13) |
|---|---|---|
| `arduino/01..13_*` | Masa testi sketch'leri (Waveshare ESP32-S3-A7670E-4G) | 13'ü de **derlendi**; `12_hepsi` **masa testi yapıldı**; `13_kopru` karta yüklenmedi |
| `kopru/kopru.py` | USB köprüsü: kartın JSON satırı → MQTT | **test edilmedi** |
| `firmware/grin_module/` | Ana firmware (4G + MQTT + GNSS + SD tampon) | **derlenmiyor** (kütüphaneler eksik, pinler eski) |
| `firmware/sensor_test/` | Eski sensör testi | **derlenmiyor**; yerini `arduino/` aldı |
| `backend/` | FastAPI + Mosquitto + PostgreSQL/PostGIS/TimescaleDB | Docker'da **hiç çalıştırılmadı**; pytest bu Mac'te **çalıştırılamadı** (Python 3.10+ gerekli) |
| `web/` | React + Vite + Leaflet, yönetici + saha PWA | **build alındı**; API yoksa demo modu |

Tüm komutlar, aksi yazmıyorsa, Terminal'de `~/Projects/grin-takip` klasöründe çalıştırılır:

```bash
cd ~/Projects/grin-takip
```

## 1. Yalnız arayüzü görmek (demo modu, Docker gerekmez)

```bash
cd ~/Projects/grin-takip/web
npm ci
npm run dev
```

Tarayıcıda `http://localhost:5173` aç. API olmadığı için uygulama kendiliğinden **demo moduna** geçer (sahte veri).
Demo giriş: `manager@demo.com` ya da `operator@demo.com`, şifre `demo123` (yalnız demo verisi).

## 2. Masa testi: karttan uygulamaya canlı veri (USB köprüsü)

SIM hattı açılana kadar veri 4G yerine USB kablosundan geçer:

```
Kart (13_kopru) ──USB──▶ kopru.py (Mac) ──MQTT──▶ Mosquitto ──▶ ingest ──▶ PostgreSQL
                                                                    Web ◀── api
```

> Bu akış henüz uçtan uca **test edilmedi** (Mac'te Docker Desktop yok). Adımlar plandır.

**Adım 1 — Docker Desktop kur** (bir kez): https://www.docker.com/products/docker-desktop → "Mac with Apple chip". Kurulunca Docker Desktop'ı aç, balina simgesi sabitlenene kadar bekle.

**Adım 2 — Sunucu yığınını başlat:**

```bash
cd ~/Projects/grin-takip
cp .env.example .env
docker compose up -d --build
docker compose logs -f api ingest
```

"Uvicorn running" ve "MQTT bağlı" görünce hazır (`Ctrl+C` yalnız log izlemeyi bırakır). İlk açılışta `mqtt` konteyneri 1–2 kez yeniden başlayabilir.
`.env` yalnız senin Mac'inde kalır, repoya girmez. Masa testi için varsayılan değerler yeterli; sunucuya kurarken hepsi değiştirilir.

**Adım 3 — `13_kopru` sketch'ini karta yükle:** Arduino IDE → `arduino/13_kopru/13_kopru.ino` aç → Kart: **ESP32S3 Dev Module**, USB CDC On Boot **Disabled** (Enabled olursa Serial Monitor'de bozuk karakter görünür) → Upload. Sonra **Serial Monitor'ü KAPAT** (portu o tutarsa köprü bağlanamaz).

**Adım 4 — Köprüyü çalıştır:**

```bash
cd ~/Projects/grin-takip/kopru
python3 -m venv .venv
.venv/bin/pip install pyserial paho-mqtt
.venv/bin/python kopru.py
```

Her saniye `#1 gönderildi: ön … mm | arka … mm …` satırı görmelisin. Durdurmak: `Ctrl+C`.

**Adım 5 — Uygulamada bak:** `http://localhost:8080` → `manager@demo.com` / `demo123` → Canlı Harita'da **GRIN-01**.
GPS henüz olmadığı için köprü sabit bir test konumu yollar (`fix=1`); bu veri **alan ve karbon hesabına girmez** (alan için `fix>=4` gerekir).

Kapatmak: `docker compose down` (veriler kalır).

| Adres | Ne |
|---|---|
| `http://localhost:8080` | Web uygulaması |
| `http://localhost:8000/docs` | API dokümanı (Swagger) |
| `localhost:1883` | MQTT |

## 3. Sketch'leri derleme (komut satırı)

Arduino IDE'nin içinde gelen `arduino-cli` kullanılır (ayrı kurulum gerekmez):

```bash
cd ~/Projects/grin-takip
"/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli" compile --fqbn esp32:esp32:esp32s3 arduino/12_hepsi
```

Karta yüklemek için komutun sonuna ` -u -p /dev/cu.usbmodem5B910428841` eklenir (Serial Monitor kapalı olmalı). USB CDC On Boot kapalı kalmalı (FQBN'de `CDCOnBoot=cdc` YOK); açık olursa çıktı bozuk gelir.

Gerekli: esp32 core 3.3.x; kütüphaneler `Adafruit BME280 Library`, `Adafruit Unified Sensor`, `Adafruit BusIO`, `VL53L1X` (Pololu). MPU6050 klon olduğu için kütüphanesiz, ham register ile okunur.
Pinler ve bilinen tuzaklar: `DEVIR-NOTU.md` §3.

`firmware/grin_module` ayrıca `TinyGSM`, `PubSubClient`, `ArduinoJson`, `TinyGPSPlus`, `Adafruit NeoPixel`, `Adafruit ADS1X15`, `EspSoftwareSerial` ister (liste: `firmware/README.md`); bunlar kurulu değil ve kod masa testinde doğrulanan pinlerle henüz güncellenmedi.

## 4. Backend testleri

Python **3.10 ya da üstü** gerekir (hedef 3.12; macOS ile gelen 3.9 çalıştırmaz).

```bash
cd ~/Projects/grin-takip/backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest
```

Ayrıntı ve curl örnekleri: `backend/README.md`.

## 5. Web build

```bash
cd ~/Projects/grin-takip/web
npm ci
npm run build
```

## 6. Sunucuya kurulum (pilot — henüz yapılmadı)

Adım 2'deki aynı `docker compose` yığını, sahibinin kendi sunucusunda ayrı bir Docker yığını olarak çalışacak. Kurmadan önce `.env` içindeki `DB_PASSWORD`, `JWT_SECRET`, `MQTT_ADMIN_PASSWORD`, `ADMIN_PASSWORD` değiştirilir, `SEED_DEMO=0` yapılır; modüllerin bağlanması için 1883 portu açılır. Dışa açarken 8080/8000 önüne HTTPS, MQTT için TLS 8883 — pilot sonrası.

Yeni makine ekleme ve cihaz token'ı: `backend/README.md` §3.

## 7. Bilinen eksikler

- Backend Docker'da hiç ayağa kaldırılmadı; `init.sql` test edilmedi.
- Modem (A7670E): SIM hattı açılmadı; UART pinleri ve APN **doğrulanacak** (`arduino/09_modem_test`).
- RTK (ZED-F9P + ANN-MB-00) ve ADS1115 + kapasitif toprak nemi siparişte; GNSS olmadan alan hesabı yapılmaz.
- Ana firmware: SD tampon, status paketi, OTA, NVS kalibrasyon, TLS MQTT yapılacak.
- Karbon katsayılarının çoğu "varsayım" işaretli (`SPEC.md` §5); saha kalibrasyonu bekliyor.

İşlerin güncel listesi: https://github.com/usluasan/grin-takip/issues
