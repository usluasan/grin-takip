// 06 - I2C TARAMA (Waveshare ESP32-S3)
// Kablolar: 3V3->3V3, GND->GND, SDA->IO15, SCL->IO16
// Her 3 saniyede bir tarar, ne bulduğunu yazar.
#include <Wire.h>

void setup() {
  Serial.begin(115200);
  delay(3000);              // Serial Monitor açılsın diye bekle
  Wire.begin(15, 16);       // SDA=IO15, SCL=IO16
}

void loop() {
  Serial.println("--- I2C tarama (SDA=IO15, SCL=IO16) ---");
  int adet = 0;
  for (uint8_t a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) {
      Serial.printf("Cihaz bulundu: 0x%02X", a);
      if (a == 0x68 || a == 0x69) Serial.print("  (MPU6050 - titresim)");
      if (a == 0x76 || a == 0x77) Serial.print("  (BME280 - sicaklik/nem)");
      Serial.println();
      adet++;
    }
  }
  if (adet == 0) Serial.println("HIC CIHAZ YOK -> kablolari kontrol et");
  Serial.println();
  delay(3000);
}
