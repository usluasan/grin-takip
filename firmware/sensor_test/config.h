// GRIN Takip modülü — yapılandırma
// Kart: Waveshare ESP32-S3 A7670E 4G. Pinler: SPEC.md §8 ve Masa Bağlantı Rehberi.
#pragma once

// ---- Cihaz kimliği (backend'de makine eklenince verilir) ----
#define DEVICE_ID        "GRIN-01"
#define DEVICE_TOKEN     "demo-token-grin-01"
#define FW_VERSION       "0.3.0"

// ---- Makine ----
#define CUT_WIDTH_CM     46

// ---- Hücresel ----
#define APN              "internet"      // Türk Telekom: "internet" (2026-10-14 doğrulandı)
#define APN_USER         ""
#define APN_PASS         ""
#define SIM_PIN          ""              // boş = PIN kapalı

// ---- MQTT ----
#define MQTT_HOST        "sunucu.adresin.com"
#define MQTT_PORT        1883
#define MQTT_KEEPALIVE   60

// ---- NTRIP (TUSAGA-Aktif veya yerel ağ) ----
#define NTRIP_ENABLED    1
#define NTRIP_HOST       "ntrip.tusaga-aktif.gov.tr"   // teyit edilecek
#define NTRIP_PORT       2101
#define NTRIP_MOUNT      "VRSRTCM31"                   // teyit edilecek
#define NTRIP_USER       "kullanici"
#define NTRIP_PASS       "sifre"

// ---- Zamanlama ----
#define TELEMETRY_PERIOD_MS   1000
#define STATUS_PERIOD_MS      30000
#define GGA_UPLOAD_PERIOD_MS  10000     // NTRIP VRS için konum bildirimi
#define SESSION_IDLE_END_MS   600000    // 10 dk mowing yok → oturum sonu

// ---- Pinler (Waveshare ESP32-S3 A7670E) ----
#define PIN_I2C_SDA      15
#define PIN_I2C_SCL      16
#define PIN_TOF_REAR_XSHUT 7
#define PIN_US_FRONT_RX  39
#define PIN_US_REAR_RX   40
#define PIN_GNSS_RX      41       // GNSS TX buraya
#define PIN_GNSS_TX      42       // GNSS RX buraya
#define PIN_MODEM_RX     17       // 09_modem_test ile doğrulandı (2026-10-14), 115200 baud
#define PIN_MODEM_TX     18
#define PIN_SD_CMD       4
#define PIN_SD_CLK       5
#define PIN_SD_DATA      6
#define PIN_RGB_LED      38

// ---- Sensör montaj yükseklikleri (mm, kalibrasyonda otomatik ölçülür) ----
#define DEFAULT_MOUNT_HEIGHT_MM  270

// ---- Durum tespiti eşikleri ----
#define VIB_MOWING_RMS   1.5f     // m/s² — motor çalışırken IMU RMS (sahada kalibre et)
#define TRANSPORT_SPEED_MS 2.2f   // m/s (≈8 km/sa) üstü = araçta taşınıyor

// ---- Toprak nem kalibrasyonu (ADS1115 ham voltaj) ----
#define SOIL_DRY_V       2.80f
#define SOIL_WET_V       1.20f
