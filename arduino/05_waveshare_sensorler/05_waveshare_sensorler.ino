// 05 - Waveshare ESP32-S3: BME280 + MPU6050 (SDA=IO15, SCL=IO16)
#include <Wire.h>
#include <Adafruit_BME280.h>
Adafruit_BME280 bme;
bool bmeOk = false, mpuOk = false;
const uint8_t MPU = 0x68;

void mpuWrite(uint8_t reg, uint8_t val) { Wire.beginTransmission(MPU); Wire.write(reg); Wire.write(val); Wire.endTransmission(); }
uint8_t mpuRead(uint8_t reg) { Wire.beginTransmission(MPU); Wire.write(reg); Wire.endTransmission(false); Wire.requestFrom(MPU, (uint8_t)1); return Wire.read(); }
// ivme (m/s2), +-8g araliginda: 4096 LSB/g
bool mpuAccel(float &ax, float &ay, float &az) {
  Wire.beginTransmission(MPU); Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU, (uint8_t)6) != 6) return false;
  int16_t x = Wire.read() << 8 | Wire.read(), y = Wire.read() << 8 | Wire.read(), z = Wire.read() << 8 | Wire.read();
  ax = x / 4096.0 * 9.81; ay = y / 4096.0 * 9.81; az = z / 4096.0 * 9.81; return true;
}

void setup() {
  Serial.begin(115200); delay(3000);   // Serial Monitor acilsin diye bekle
  Wire.begin(15, 16);   // Waveshare: SDA=IO15, SCL=IO16
  Serial.println("\n--- I2C tarama ---");
  for (uint8_t a = 1; a < 127; a++) { Wire.beginTransmission(a); if (Wire.endTransmission() == 0) Serial.printf("Cihaz bulundu: 0x%02X\n", a); }
  bmeOk = bme.begin(0x76) || bme.begin(0x77);
  Wire.beginTransmission(MPU); mpuOk = (Wire.endTransmission() == 0);
  if (mpuOk) {
    Serial.printf("MPU kimlik (WHO_AM_I): 0x%02X\n", mpuRead(0x75));
    mpuWrite(0x6B, 0x00);   // uyandir
    mpuWrite(0x1C, 0x10);   // ivme araligi +-8g
    mpuWrite(0x1A, 0x02);   // filtre ~94 Hz
    delay(100);
  }
  Serial.println(bmeOk ? "BME280 OK" : "BME280 yok");
  Serial.println(mpuOk ? "MPU6050 OK" : "MPU6050 yok");
  Serial.println("Her saniye: titresim RMS (m/s2). Masada ~0.1-0.3, masaya vurunca artar.");
}

void loop() {
  float sum = 0; int n = 0; float ax, ay, az;
  uint32_t t0 = millis();
  while (millis() - t0 < 1000) {
    if (mpuOk && mpuAccel(ax, ay, az)) {
      float dev = sqrt(ax * ax + ay * ay + az * az) - 9.81; sum += dev * dev; n++;
    }
    delay(10);
  }
  float rms = n ? sqrt(sum / n) : 0;
  if (bmeOk) Serial.printf("Sicaklik %.1f C | Nem %.0f %% | ", bme.readTemperature(), bme.readHumidity());
  if (mpuOk) Serial.printf("Titresim RMS %.2f m/s2 %s", rms, rms > 1.5 ? "<-- BICIYOR" : "(durgun)");
  Serial.println();
}
