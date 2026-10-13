/*
  GRIN Takip modülü — ana program
  Kart: Waveshare ESP32-S3 A7670E 4G (Arduino: "ESP32S3 Dev Module", USB CDC On Boot: Enabled, PSRAM: OPI)

  Kütüphaneler (Library Manager):
    TinyGSM (Volodymyr Shymanskyy), PubSubClient (Nick O'Leary), ArduinoJson (Benoit Blanchon),
    Adafruit BME280, Adafruit MPU6050, Adafruit Unified Sensor, VL53L1X (Pololu),
    Adafruit ADS1X15, Adafruit NeoPixel, TinyGPSPlus (Mikal Hart)

  Görevler:
    - Sensörleri 10 Hz okur (ToF ×2, ultrasonik ×2, IMU, BME280, ADS1115)
    - GNSS'ten NMEA okur (RTK kart UART'ta), NTRIP düzeltmesini 4G'den alıp GNSS'e yazar
    - Saniyede 1 telemetri paketi üretir; MQTT ile gönderir; şebeke yoksa SD'ye yazar
    - 30 sn'de bir durum paketi; oturum başı/sonu olayları
*/
#define TINY_GSM_MODEM_A7670
#define TINY_GSM_RX_BUFFER 1024

#include "config.h"
#include <Wire.h>
#include <SD_MMC.h>
#include <TinyGsmClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <TinyGPSPlus.h>
#include <Adafruit_NeoPixel.h>
#include <Adafruit_BME280.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_ADS1X15.h>
#include <VL53L1X.h>

#include "sensors.h"
#include "gnss.h"
#include "cellular.h"
#include "buffer.h"

// ---- Nesneler ----
Adafruit_NeoPixel led(1, PIN_RGB_LED, NEO_GRB + NEO_KHZ800);
HardwareSerial SerialModem(1);
HardwareSerial SerialGNSS(2);
TinyGsm modem(SerialModem);
TinyGsmClient mqttNet(modem, 0);
TinyGsmClient ntripNet(modem, 1);
PubSubClient mqtt(mqttNet);

Sensors sensors;
Gnss gnss(SerialGNSS);
Cellular cell(modem, mqtt, ntripNet);
SdBuffer sdbuf;

// ---- Durum ----
enum MachineState { ST_OFF, ST_IDLE, ST_MOWING, ST_TRANSPORT };
MachineState state = ST_IDLE;
bool sessionOpen = false;
uint32_t lastMowingMs = 0;
uint32_t seq = 0;
uint32_t tTelemetry = 0, tStatus = 0, tGga = 0, tSensor = 0;

const char* stateName(MachineState s) {
  switch (s) { case ST_MOWING: return "mowing"; case ST_TRANSPORT: return "transport"; case ST_OFF: return "off"; default: return "idle"; }
}

void setLed(uint8_t r, uint8_t g, uint8_t b) { led.setPixelColor(0, led.Color(r, g, b)); led.show(); }

// ---- Durum makinesi: IMU titreşimi + hız ----
void updateState() {
  float vib = sensors.vibRms();
  float spd = gnss.speedMs();
  MachineState next = state;
  if (spd > TRANSPORT_SPEED_MS)            next = ST_TRANSPORT;
  else if (vib > VIB_MOWING_RMS)           next = ST_MOWING;
  else                                     next = ST_IDLE;
  if (next == ST_MOWING) lastMowingMs = millis();

  if (next != state) {
    if (next == ST_MOWING && !sessionOpen) { sessionOpen = true; cell.publishEvent("session_start", "vib", sdbuf); }
    state = next;
  }
  if (sessionOpen && millis() - lastMowingMs > SESSION_IDLE_END_MS) {
    sessionOpen = false; cell.publishEvent("session_end", "idle_timeout", sdbuf);
  }
}

// ---- Telemetri paketi (SPEC §3.1) ----
void buildTelemetry(JsonDocument& d) {
  d["v"] = 1;
  d["ts"] = gnss.hasTime() ? gnss.unixTime() : (uint32_t)(millis() / 1000);
  d["fix"] = gnss.fixQuality();
  d["lat"] = serialized(String(gnss.lat(), 7));
  d["lon"] = serialized(String(gnss.lon(), 7));
  d["hacc"] = serialized(String(gnss.hacc(), 3));
  d["spd"] = serialized(String(gnss.speedMs(), 2));
  d["hdg"] = serialized(String(gnss.heading(), 1));
  d["h_pre"] = sensors.grassFrontTof();
  d["h_post"] = sensors.grassRearTof();
  d["us_pre"] = sensors.grassFrontUs();
  d["us_post"] = sensors.grassRearUs();
  d["vib"] = serialized(String(sensors.vibRms(), 2));
  d["state"] = stateName(state);
  d["temp"] = serialized(String(sensors.tempC(), 1));
  d["hum"] = serialized(String(sensors.humPct(), 0));
  JsonArray soil = d["soil"].to<JsonArray>();
  soil.add(sensors.soilPct(0)); soil.add(sensors.soilPct(1));
  d["bat"] = serialized(String(sensors.batteryV(), 2));
  d["seq"] = seq++;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  led.begin(); led.setBrightness(40); setLed(60, 60, 0);
  Serial.printf("GRIN Takip %s / %s\n", DEVICE_ID, FW_VERSION);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  sensors.begin();

  SerialGNSS.begin(38400, SERIAL_8N1, PIN_GNSS_RX, PIN_GNSS_TX);   // ZED-F9P varsayılan 38400
  gnss.begin();

  SD_MMC.setPins(PIN_SD_CLK, PIN_SD_CMD, PIN_SD_DATA);
  sdbuf.begin(SD_MMC.begin("/sdcard", true));

  SerialModem.begin(115200, SERIAL_8N1, PIN_MODEM_RX, PIN_MODEM_TX);
  cell.begin();                       // modem + şebeke + MQTT (bloklamayan yeniden deneme)
  setLed(0, 0, 80);
}

void loop() {
  uint32_t now = millis();

  // Sensörler 10 Hz
  if (now - tSensor >= 100) { tSensor = now; sensors.poll(); }

  // GNSS sürekli (NMEA ayrıştır), NTRIP'ten gelen RTCM'i GNSS'e aktar
  gnss.poll();
  if (NTRIP_ENABLED) cell.pumpNtrip(SerialGNSS);
  if (NTRIP_ENABLED && now - tGga >= GGA_UPLOAD_PERIOD_MS && gnss.hasFix()) { tGga = now; cell.sendGga(gnss.lastGga()); }

  // Bağlantı bakımı (bloklamaz)
  cell.maintain();

  // Durum
  updateState();

  // Telemetri 1 Hz
  if (now - tTelemetry >= TELEMETRY_PERIOD_MS) {
    tTelemetry = now;
    JsonDocument d; buildTelemetry(d);
    String payload; serializeJson(d, payload);
    bool sent = cell.publishTelemetry(payload);
    if (!sent) sdbuf.append(payload);
    else sdbuf.flush(cell);           // bağlantı varsa biriken SD kayıtlarını boşalt (parça parça)
    setLed(sent ? 0 : 80, sent ? (state == ST_MOWING ? 80 : 20) : 0, sent ? 0 : 0);
  }

  // Durum paketi 30 sn
  if (now - tStatus >= STATUS_PERIOD_MS) {
    tStatus = now;
    JsonDocument s;
    s["v"] = 1; s["ts"] = gnss.hasTime() ? gnss.unixTime() : (uint32_t)(now / 1000);
    s["bat"] = serialized(String(sensors.batteryV(), 2));
    s["rssi"] = cell.rssiDbm(); s["fw"] = FW_VERSION;
    s["sd_free_mb"] = sdbuf.freeMb(); s["ntrip"] = cell.ntripConnected(); s["sats"] = gnss.sats();
    String p; serializeJson(s, p);
    cell.publishStatus(p);
  }

  // Buluttan komut
  cell.handleCommands();
}
