# GRIN Takip — Devir Notu (claude.ai "arteverte" projesinden Claude Code'a, 2026-10-13)

> Bu repo YALNIZCA GRIN Akıllı Çim Biçme Takip Sistemi içindir. finale-takip, SAP/EnerjiSA, TCDD, BO raporları vb. diğer projelerle HİÇBİR ilişkisi yoktur; kod, kural, isim, veri karıştırılmaz.

## 1. Proje
Arteverte Peyzaj / GRIN Türkiye. Benzinli yürüyüşlü GRIN çim biçme makinesine takılan modül (sensörler + RTK GPS + 4G) ve verisini gösteren web/PWA uygulaması. Asıl amaç: GRIN'in atık bırakmaması (malçlama) sayesinde torbalı biçime göre karbon tasarrufunu ölçüp çevre kurumlarına denetlenebilir biçimde kanıtlamak.
Proje sahibi elektronik/yazılımda yeni başlayan; anlatım adım adım, Türkçe, kısa. Mac (Apple Silicon) kullanıyor.

## 2. Repo içeriği
| Klasör | Ne | Durum |
|---|---|---|
| `SPEC.md` | firmware ↔ backend ↔ web ortak sözleşmesi (MQTT konuları, JSON paket, DB şeması, API, karbon formülleri) | referans; değişiklik buradan başlar |
| `firmware/grin_module/` | ilk yazılan ana firmware (2026-10-04) | DERLENMEDİ, masa testlerinde öğrenilen pinler/klon MPU ile güncellenmeli |
| `firmware/sensor_test/` | eski sensör test kodu | masa testleriyle yerini `arduino/` aldı |
| `arduino/01..13_*` | masa testi sketch'leri (Mac'te derlendi, karta yüklendi) | 12_hepsi ✅ çalışıyor; 09_modem_test ✅ 4G + internet (2026-10-14); 13_kopru ✅ karta yüklendi, köprüyle çalıştı (2026-10-14) |
| `kopru/kopru.py` | USB köprüsü: kart JSON satırı → MQTT (SIM yokken masa testi) | ✅ 2026-10-14 masa testinde çalıştı (`kopru/.venv`: pyserial + paho-mqtt) |
| `backend/` | FastAPI + Mosquitto + PostgreSQL/PostGIS/TimescaleDB, ingest, 15 pytest | ✅ 2026-10-14 Mac'te Docker ile çalıştı (5 konteyner); pytest 15/15 (Docker, Python 3.12); sunucuya kurulmadı |
| `web/` | React + Vite + Leaflet, yönetici + saha PWA; API yoksa demo moduna düşer | ✅ gerçek API ile çalıştı: giriş, genel bakış, canlı harita, WebSocket (2026-10-14) |
| `docker-compose.yml`, `.env.example` | yerel/sunucu kurulum | Mac'te Docker Desktop kurulu (29.8.2, 2026-10-14); `.env` yalnız yerelde |

## 3. Donanım (masa testi, 2026-10-12)
Ana kart: Waveshare ESP32-S3-A7670E-4G VER 2.0 (Arduino: ESP32S3 Dev Module, USB CDC On Boot **Disabled** — 2026-10-14 denendi: Enabled ile Serial çıktısı bu porttan bozuk geliyor, Disabled ile düzgün; port büyük ihtimalle kart üstü USB-seri çipine bağlı. Flash 16MB, PSRAM OPI — Arduino IDE'de şu an 4MB / PSRAM disabled seçili, hangisiyle yüklendiği doğrulanacak; esp32 core 3.3.12; port /dev/cu.usbmodem5B910428841; arduino-cli FQBN `esp32:esp32:esp32s3`).
Tasarım notu: CDC kapalıyken `Serial` UART0 üzerinden USB-seri çipine gider; `firmware/grin_module` ön ultrasoniği UART0'a koyuyor (`sensors.h`) → çakışır, #8'de çözülecek.

| Bileşen | Bağlantı | Durum |
|---|---|---|
| I2C hattı | SDA=IO15, SCL=IO16, 100 kHz | ✅ |
| BME280 | I2C 0x76 | ✅ |
| MPU6050 (klon) | I2C 0x68 — Adafruit kütüphanesi reddediyor, ham register (0x6B=0, 0x1C=0x10 ±8g, 0x1A=2, 4096 LSB/g) | ✅ |
| VL53L1X ×2 (Pololu #3415, kütüphane Pololu VL53L1X) | ÖN 0x2A (açılışta XSHUT ile yeniden adreslenir), ARKA 0x29, ARKA XSHUT=IO7; Short mod | ✅ |
| MAX17048 pil ölçer (kart üstü) | I2C 0x36, VCELL reg 0x02 ×78.125 µV | ✅ görünüyor |
| A02YYUW ultrasonik | 3V3, sensör TX → IO39 (UART 9600, paket FF H L sum) | ✅ |
| microSD 32 GB | SDMMC 1-bit CLK=5 CMD=4 D0=6 | ✅ |
| A7670E modem (A7670E-FASE, yazılım A7670M7_V1.11.1) | UART ESP RX=IO17, TX=IO18, 115200 baud (2026-10-14 `09_modem_test` ile doğrulandı), DIP 4G=ON CAM=OFF | ✅ Türk Telekom hattı açık (SIM READY, PIN kapalı), LTE kayıtlı (28603), sinyal CSQ 22, APN "internet" ile IP alındı, HTTP GET 200 (internet var). MQTT karttan henüz denenmedi |
| ZED-F9P RTK (SparkFun GPS-RTK2 15136) + u-blox ANN-MB-00 | planlanan UART IO41/42 | ⏳ e-komponent siparişi |
| ADS1115 + kapasitif toprak nem v1.2 ×2 | I2C | ⏳ sipariş (gelen 20079 dirençli tip, kullanılmayacak) |
| Kamera | YOK (pinler çakışıyor) — 2. sürüm | karar |
| Pil | masada kart üstü 18650 yuvası; sahada 21700×2 punta 1S2P + BMS | karar |

Bilinen tuzaklar: Serial Monitor açılmadan setup çıktısı kaybolur (setup'ta delay(3000)); VL53L1X reset sonrası 0x2A'da kalır (kod 0x29'a geri alıyor); arka VL53L1X'in pin dizisi ters lehimli (masada kablolar yatık tutulmalı, sahada kablo doğrudan lehim); ön sensörde turuncu koruma filmi vardı (çıkarıldı); breadboard'da kablo yanlış sütuna girince I2C cihazı kaybolur.

## 4. Verilen kararlar (özet)
1. Güç: ayrı pil (makinede 12 V hat yok). 2. RTK: pilotta ZED-F9P; TUSAGA-Aktif Ağ-RTK makine başına; seri üründe Paket A (TUSAGA) / Paket B (kendi baz istasyonu) → yazılımda "düzeltme kaynağı" ayarı. 3. Çim boyu: ToF + ultrasonik birlikte, sahada ±1 cm'yi tutturan kalır. 4. İki ToF: ön=kesim öncesi, arka=kesim sonrası; makinenin kesim yüksekliği ayarı da uygulamada kayıt. 5. Bağlantı 4G, LoRa yok. 6. Sunucu: sahibinin kendi sunucusu (SAP sunucusunda ayrı Docker yığını), bulut yok. 7. Kamera 2. sürüm. 8. Sensör kablosu: ekranlı Cat6 FTP + M12 + PG7. 9. Maliyet tablolarında TL tutarı yazılmaz (kalem + maliyet türü).

## 5. Çalışma kuralları (proje talimatından)
- Türkçe, kısa, adım adım; komutlar tam ve hangi klasörde çalışacağı belirtilerek.
- Her bileşen: tam model, neden, en az bir alternatif, Türkiye'de temin.
- Emin olunmayan teknik değer uydurulmaz (datasheet ya da "doğrulanacak").
- Karbon: her emisyon faktörünün kaynağı; kaynaksız katsayı "varsayım" diye işaretli; formüller denetlenebilir.
- Birden fazla yol varsa artı/eksi + öneri, karar sahibinde.
- Aşamalar: 1 Mimari ✅ · 2 Bileşen ✅ · 3 Devre/PCB/kutu (taslak doc var, sahibi anlamadı → masa testine geçildi) · 4 Gömülü yazılım (devam) · 5 Backend (kod var, çalıştırılmadı) · 6 Uygulama (demo var) · 7 Karbon modeli (SPEC §5) · 8 Test planı.

## 6. Sıradaki işler (öncelik sırası)
1. ~~Docker + USB köprüsüyle web'de GRIN-01 canlı~~ ✅ 2026-10-14 uçtan uca çalıştı. Not: köprü testinde h_pre/h_post ham mesafe (karar: A, 2026-10-14). 2026-10-15: oturum aç/kapa çalıştı; GPS'siz oturumda alan ve karbon 0 (doğru).
2. ~~SIM hattı açılınca `09_modem_test`~~ ✅ 2026-10-14: 4G + internet doğrulandı → sırada MQTT doğrudan karttan (sunucu gerekli).
3. `firmware/grin_module`'ü masa testinde doğrulanan pinler/kodla güncelle (12_hepsi + 13_kopru temel alınır), SD tampon (buffer.jsonl), status paketi.
4. RTK gelince: ZED-F9P UART, NTRIP (TUSAGA), fix/hacc → alan hesabı.
5. ADS1115 + toprak nemi.
6. Saha kalibrasyonu: montaj yüksekliği (beton), cetvel karşılaştırması, çim yoğunluk katsayısı tartımı.

## 7. Dış bağlantılar
- claude.ai proje dokümanı: "claude/asama-1-2-mimari-ve-bilesen-secimi.md" (arteverte projesi) — kararların ana kaydı.
- Claude Docs: "GRIN Modülü — Aşama 3: Devre Şeması, Kutu ve Montaj".
- Maliyet: GRIN_TUSAGA_RTK_Maliyet.xlsx (Mac: ~/Desktop/proje_cim).
- Demo login (yalnız demo verisi): manager@demo.com / operator@demo.com, şifre demo123; demo cihaz GRIN-01 token demo-token-grin-01. Üretimde değiştirilecek.
