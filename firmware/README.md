# GRIN Takip — Modül Yazılımı (firmware)

Kart: **Waveshare ESP32-S3 A7670E 4G**. Pinler: `grin_module/config.h` (SPEC §8 ile aynı).

## Klasörler

| Klasör | Ne |
|---|---|
| `grin_module/` | Ana program: sensörler + GNSS/NTRIP + 4G MQTT + SD tampon |
| `sensor_test/` | Masa testi: yalnız sensörleri okuyup Serial Monitor'e yazar (modem/GNSS gerekmez) |

## Arduino IDE kurulumu

1. Boards Manager → **esp32 by Espressif** (3.x).
2. Tools → Board: **ESP32S3 Dev Module** · USB CDC On Boot: **Enabled** · PSRAM: **OPI PSRAM** · Flash Size: **16MB** · Partition Scheme: **Default 4MB with spiffs** (16MB varsa "16M Flash (3MB APP/9.9MB FATFS)").
3. Library Manager'dan kur: `TinyGSM`, `PubSubClient`, `ArduinoJson` (7.x), `TinyGPSPlus`, `Adafruit NeoPixel`, `Adafruit BME280 Library`, `Adafruit MPU6050`, `Adafruit Unified Sensor`, `VL53L1X` (Pololu), `Adafruit ADS1X15`, `EspSoftwareSerial`.
4. `grin_module/config.h` içinde `DEVICE_ID`, `DEVICE_TOKEN` (backend'de makine eklenince verilir), `APN`, `MQTT_HOST`, NTRIP bilgileri.

## UART dağılımı (ESP32-S3'te 3 donanım UART var)

| UART | Kullanım | Pin |
|---|---|---|
| 0 | Ön ultrasonik (sadece RX) — USB CDC açıkken UART0 boşta | 39 |
| 1 | Modem A7670E (ESP RX / TX, doğrulandı) | 17 / 18 |
| 2 | RTK GNSS | 41 / 42 |
| yazılım seri | Arka ultrasonik | 40 |

## Çalışma mantığı

- 10 Hz sensör okuma, 5'li medyan filtre; çim boyu = montaj yüksekliği − ölçülen mesafe.
- Durum: IMU titreşim RMS > `VIB_MOWING_RMS` → `mowing`; hız > 8 km/sa → `transport`; diğer `idle`. İlk `mowing` oturum başlatır, 10 dk `mowing` yoksa oturum biter (olay paketi).
- 1 Hz telemetri (SPEC §3.1). MQTT yoksa `/sdcard/buffer.jsonl`'e yazar; bağlantı gelince her döngüde en fazla 20 satır gönderir.
- NTRIP: 4G üzerinden caster'a bağlanır, RTCM baytlarını GNSS UART'ına basar; 10 sn'de bir GGA yollar (VRS için).
- 30 sn'de bir durum paketi; `grin/<id>/cmd` konusundan `reboot` komutu çalışır (`interval`, `ota` yer tutucu).

## Sahada kalibrasyon

- Makine beton zeminde dururken Serial Monitor'e `c` yazıp Enter: sensörler montaj yüksekliğini kendisi ölçer (`sensor_test` içinde). `grin_module`'de `DEFAULT_MOUNT_HEIGHT_MM` ile başlar; kalıcı kalibrasyon NVS'ye yazma Aşama 4'te eklenecek.
- `VIB_MOWING_RMS`: motor kapalı/açık iken `sensor_test` çıktısındaki `vib` değerlerinin ortasını al.
- `SOIL_DRY_V` / `SOIL_WET_V`: sensör kuru havada ve suda iken ölçülen voltajlar.

## Bilinen eksikler (Aşama 4'te tamamlanacak)

- OTA (HTTP üzerinden), telemetri periyodu komutu, NVS'de kalibrasyon saklama
- TLS MQTT (8883) — pilotta düz 1883
- UBX-NAV-PVT ile gerçek hAcc (şimdilik fix kalitesinden tahmin)
- SD tamponundaki olay paketleri telemetri konusuna gider (ingest tip alanından ayırır) — ayrı dosya yapılacak
