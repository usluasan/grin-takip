/*
  Masa testi: tüm sensörleri okur, saniyede bir satır yazar. Modem ve GNSS gerekmez.
  Kart: Waveshare ESP32-S3 A7670E (ESP32S3 Dev Module, USB CDC On Boot: Enabled)
  Kütüphaneler: Adafruit BME280, Adafruit MPU6050, VL53L1X (Pololu), Adafruit ADS1X15, EspSoftwareSerial
  Serial Monitor'e 'c' + Enter → beton zeminde montaj yüksekliği kalibrasyonu
*/
#include <Wire.h>
#include "config.h"
#include "sensors.h"

Sensors sensors;
uint32_t t = 0, tS = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  sensors.begin();
  Serial.println("ts_ms,tof_on_mm,tof_arka_mm,us_on_mm,us_arka_mm,vib_rms,temp_C,nem_%,toprak1_%,toprak2_%,pil_V");
}

void loop() {
  uint32_t now = millis();
  if (now - tS >= 100) { tS = now; sensors.poll(); }
  if (Serial.available() && Serial.read() == 'c') sensors.calibrateMount();
  if (now - t >= 1000) {
    t = now;
    Serial.printf("%lu,%d,%d,%d,%d,%.2f,%.1f,%.0f,%d,%d,%.2f\n", (unsigned long)now,
      sensors.grassFrontTof(), sensors.grassRearTof(), sensors.grassFrontUs(), sensors.grassRearUs(),
      sensors.vibRms(), sensors.tempC(), sensors.humPct(), sensors.soilPct(0), sensors.soilPct(1), sensors.batteryV());
  }
}
