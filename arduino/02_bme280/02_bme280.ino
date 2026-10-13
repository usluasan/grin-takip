// 02 - I2C tarama + BME280 sıcaklık/nem/basınç (ESP32 DevKit: SDA=21, SCL=22)
#include <Wire.h>
#include <Adafruit_BME280.h>
Adafruit_BME280 bme;
bool ok = false;

void setup() {
  Serial.begin(115200); delay(500);
  Wire.begin(21, 22);
  Serial.println("\n--- I2C tarama ---");
  int n = 0;
  for (uint8_t a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) { Serial.printf("Cihaz bulundu: 0x%02X\n", a); n++; }
  }
  if (n == 0) Serial.println("Hic cihaz yok -> kablolari kontrol et (SDA=D21, SCL=D22, VIN=3V3, GND)");
  ok = bme.begin(0x76) || bme.begin(0x77);
  Serial.println(ok ? "BME280 OK" : "BME280 bulunamadi");
}

void loop() {
  if (ok) {
    Serial.printf("Sicaklik: %.1f C | Nem: %.0f %% | Basinc: %.0f hPa\n",
      bme.readTemperature(), bme.readHumidity(), bme.readPressure() / 100.0);
  }
  delay(60000);   // 60 saniyede bir olc
}
