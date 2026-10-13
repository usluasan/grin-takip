// 13 - USB KOPRU: 12_hepsi + her saniye SPEC formatinda JSON satiri (Mac'teki kopru.py okur, sunucuya yollar)
// 12 - TOPLU TEST: BME280 + MPU6050 + 2x VL53L1X + A02YYUW + microSD kayit
// I2C: SDA=IO15, SCL=IO16 (BME 0x76, MPU 0x68, ON lazer 0x2A, ARKA lazer 0x29, pil cipi 0x36)
// ARKA lazer XSHUT=IO7 | Ultrasonik TX(yesil)=IO39 | microSD: IO5/IO4/IO6
// Her saniye 1 satir ekrana + /olcum.csv dosyasina yazar.
#include <Wire.h>
#include <Adafruit_BME280.h>
#include <VL53L1X.h>
#include <SD_MMC.h>

Adafruit_BME280 bme; VL53L1X on, arka;
bool bmeOk, mpuOk, onOk, arkaOk, sdOk;
const uint8_t MPU = 0x68; const int XSHUT_ARKA = 7;
int ultraMm = -1;
unsigned long seq = 0;
float pilV() {                          // kart ustu MAX17048 (0x36): VCELL reg 0x02, 78.125 uV/LSB
  Wire.beginTransmission(0x36); Wire.write(0x02);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom((uint8_t)0x36, (uint8_t)2) != 2) return -1;
  uint16_t v = Wire.read() << 8 | Wire.read(); return v * 78.125e-6;
}

void mpuYaz(uint8_t r, uint8_t v) { Wire.beginTransmission(MPU); Wire.write(r); Wire.write(v); Wire.endTransmission(); }
bool mpuOku(float &a) {
  Wire.beginTransmission(MPU); Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom(MPU, (uint8_t)6) != 6) return false;
  int16_t x = Wire.read() << 8 | Wire.read(), y = Wire.read() << 8 | Wire.read(), z = Wire.read() << 8 | Wire.read();
  a = sqrt((float)x * x + (float)y * y + (float)z * z) / 4096.0 * 9.81; return true;
}
bool lazerBaslat(VL53L1X &s) {
  s.setTimeout(500); if (!s.init()) return false;
  s.setDistanceMode(VL53L1X::Short); s.setMeasurementTimingBudget(50000); s.startContinuous(50); return true;
}
void ultraOku() {                       // A02YYUW: 0xFF, H, L, toplam
  static uint8_t b[4]; static int n = 0;
  while (Serial1.available()) {
    uint8_t c = Serial1.read();
    if (n == 0 && c != 0xFF) continue;
    b[n++] = c;
    if (n == 4) { n = 0; if (((b[0] + b[1] + b[2]) & 0xFF) == b[3]) ultraMm = b[1] * 256 + b[2]; }
  }
}

void setup() {
  Serial.begin(115200); delay(3000);
  Serial.println("\n=== TOPLU TEST ===");
  Wire.begin(15, 16); Wire.setClock(100000);

  // Lazerler: once ARKA'yi kapat, ON'a yeni adres ver, sonra ARKA'yi ac
  pinMode(XSHUT_ARKA, OUTPUT); digitalWrite(XSHUT_ARKA, LOW); delay(10);
  Wire.beginTransmission(0x2A);                       // reset sonrasi ON 0x2A'da kalmissa 0x29'a al
  if (Wire.endTransmission() == 0) { Wire.beginTransmission(0x2A); Wire.write(0x00); Wire.write(0x01); Wire.write(0x29); Wire.endTransmission(); delay(10); }
  onOk = lazerBaslat(on); if (onOk) on.setAddress(0x2A);
  pinMode(XSHUT_ARKA, INPUT); delay(10);
  arkaOk = lazerBaslat(arka);

  bmeOk = bme.begin(0x76) || bme.begin(0x77);
  Wire.beginTransmission(MPU); mpuOk = (Wire.endTransmission() == 0);
  if (mpuOk) { mpuYaz(0x6B, 0x00); mpuYaz(0x1C, 0x10); mpuYaz(0x1A, 0x02); }

  Serial1.begin(9600, SERIAL_8N1, 39, 40);            // ultrasonik

  SD_MMC.setPins(5, 4, 6);
  sdOk = SD_MMC.begin("/sdcard", true);
  if (sdOk && !SD_MMC.exists("/olcum.csv")) {
    File f = SD_MMC.open("/olcum.csv", FILE_WRITE);
    f.println("zaman_s,sicaklik_C,nem_pct,titresim_rms,on_mm,arka_mm,ultra_mm"); f.close();
  }
  Serial.printf("BME280:%s MPU6050:%s ON lazer:%s ARKA lazer:%s microSD:%s\n",
    bmeOk?"OK":"YOK", mpuOk?"OK":"YOK", onOk?"OK":"YOK", arkaOk?"OK":"YOK", sdOk?"OK":"YOK");
  Serial.println("zaman | sicaklik nem | titresim | ON  ARKA  ULTRA (mm)");
}

void loop() {
  float sum = 0, a; int n = 0; uint32_t t0 = millis();
  while (millis() - t0 < 1000) {                       // 1 sn boyunca titresim + ultrasonik topla
    if (mpuOk && mpuOku(a)) { float d = a - 9.81; sum += d * d; n++; }
    ultraOku(); delay(10);
  }
  float rms = n ? sqrt(sum / n) : -1;
  float T = bmeOk ? bme.readTemperature() : NAN, H = bmeOk ? bme.readHumidity() : NAN;
  int onMm = onOk ? on.read() : -1, arkaMm = arkaOk ? arka.read() : -1;
  unsigned long s = millis() / 1000;
  if (s % 10 == 0) {                                   // 10 sn'de bir: I2C taramasi + durum
    Serial.print("I2C'de bulunanlar:");
    for (uint8_t ad = 1; ad < 127; ad++) { Wire.beginTransmission(ad); if (Wire.endTransmission() == 0) Serial.printf(" 0x%02X", ad); }
    Serial.println("   (beklenen: 0x29 0x2A 0x36 0x68 0x76)");
    if (!bmeOk) bmeOk = bme.begin(0x76) || bme.begin(0x77);       // sonradan takilirsa yakala
    if (!mpuOk) { Wire.beginTransmission(MPU); mpuOk = (Wire.endTransmission() == 0); if (mpuOk) { mpuYaz(0x6B,0); mpuYaz(0x1C,0x10); mpuYaz(0x1A,2); } }
    Serial.printf("BME280:%s MPU6050:%s ON:%s ARKA:%s SD:%s\n", bmeOk?"OK":"YOK", mpuOk?"OK":"YOK", onOk?"OK":"YOK", arkaOk?"OK":"YOK", sdOk?"OK":"YOK");
  }

  Serial.printf("%5lus | %4.1fC %3.0f%% | %4.2f %s | %4d %4d %4d\n",
    s, T, H, rms, rms > 1.5 ? "BICIYOR" : "durgun ", onMm, arkaMm, ultraMm);
  // --- SPEC 3.1 telemetri (konum yok: GPS gelince eklenecek; ts'yi kopru.py ekler) ---
  const char *durum = rms > 1.5 ? "mowing" : "idle";
  String js = String("{\"v\":1,\"seq\":") + (seq++) + ",\"state\":\"" + durum + "\"";
  if (rms >= 0) js += ",\"vib\":" + String(rms, 2);
  if (onMm >= 0) js += ",\"h_pre\":" + String(onMm);
  if (arkaMm >= 0) js += ",\"h_post\":" + String(arkaMm);
  if (ultraMm >= 0) js += ",\"us_pre\":" + String(ultraMm);
  if (bmeOk) js += ",\"temp\":" + String(T, 1) + ",\"hum\":" + String(H, 0);
  float b = pilV(); if (b > 0) js += ",\"bat\":" + String(b, 2);
  js += "}";
  Serial.println(js);
  if (sdOk) {
    File f = SD_MMC.open("/olcum.csv", FILE_APPEND);
    if (f) { f.printf("%lu,%.1f,%.0f,%.2f,%d,%d,%d\n", s, T, H, rms, onMm, arkaMm, ultraMm); f.close(); }
  }
}
