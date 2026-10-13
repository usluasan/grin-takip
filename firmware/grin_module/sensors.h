// Sensör katmanı: ToF ×2, ultrasonik ×2, IMU, BME280, ADS1115 (toprak nemi + pil)
#pragma once
#include <Arduino.h>
#include <Wire.h>
#include <initializer_list>
#include <Adafruit_BME280.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_ADS1X15.h>
#include <VL53L1X.h>
#include <SoftwareSerial.h>   // EspSoftwareSerial (Dirk Kaar)
#include "config.h"

class Sensors {
 public:
  void begin() {
    // ToF: arka sensörü uyut, öne 0x30 ver, arkayı uyandır (0x29 kalır)
    pinMode(PIN_TOF_REAR_XSHUT, OUTPUT);
    digitalWrite(PIN_TOF_REAR_XSHUT, LOW); delay(10);
    tofFront.setTimeout(200);
    if (tofFront.init()) { tofFront.setAddress(0x30); tofFrontOk = true; }
    digitalWrite(PIN_TOF_REAR_XSHUT, HIGH); delay(10);
    tofRear.setTimeout(200);
    if (tofRear.init()) tofRearOk = true;
    for (VL53L1X* t : {&tofFront, &tofRear}) {
      t->setDistanceMode(VL53L1X::Medium);
      t->setMeasurementTimingBudget(50000);
      t->startContinuous(100);
    }
    // Ultrasonik (9600, sadece dinleme). ESP32-S3'te 3 donanım UART var: 1=modem, 2=GNSS,
    // 0=ön ultrasonik (USB CDC açıkken UART0 boşta); arka ultrasonik yazılım seri.
    usFront.begin(9600, SERIAL_8N1, PIN_US_FRONT_RX, -1);
    usRear.begin(9600, SWSERIAL_8N1, PIN_US_REAR_RX, -1);
    // IMU
    if (mpu.begin()) { mpu.setAccelerometerRange(MPU6050_RANGE_8_G); mpu.setFilterBandwidth(MPU6050_BAND_94_HZ); mpuOk = true; }
    // Hava
    bmeOk = bme.begin(0x76) || bme.begin(0x77);
    // ADC (toprak nemi A0/A1, pil A2 üzerinden 1/2 bölücü ile)
    adsOk = ads.begin(0x48);
    if (adsOk) ads.setGain(GAIN_ONE);   // ±4.096 V
    mountFront = mountRear = DEFAULT_MOUNT_HEIGHT_MM;
    Serial.printf("Sensors: tofF=%d tofR=%d mpu=%d bme=%d ads=%d\n", tofFrontOk, tofRearOk, mpuOk, bmeOk, adsOk);
  }

  // 10 Hz çağrılır
  void poll() {
    if (tofFrontOk && tofFront.dataReady()) { int d = tofFront.read(false); if (tofFront.timeoutOccurred()) d = -1; pushMed(tofF, d); }
    if (tofRearOk && tofRear.dataReady())   { int d = tofRear.read(false);  if (tofRear.timeoutOccurred())  d = -1; pushMed(tofR, d); }
    int u;
    if ((u = readUs(usFront)) > 0) pushMed(usF, u);
    if ((u = readUs(usRear)) > 0)  pushMed(usR, u);
    if (mpuOk) {
      sensors_event_t a, g, t; mpu.getEvent(&a, &g, &t);
      float mag = sqrtf(a.acceleration.x * a.acceleration.x + a.acceleration.y * a.acceleration.y + a.acceleration.z * a.acceleration.z) - 9.81f;
      vibSq = vibSq * 0.9f + mag * mag * 0.1f;   // üstel ortalama (~1 sn)
    }
    if (++slow % 20 == 0) {                        // 2 sn'de bir yavaş sensörler
      if (bmeOk) { temp = bme.readTemperature(); hum = bme.readHumidity(); }
      if (adsOk) {
        soilV[0] = ads.computeVolts(ads.readADC_SingleEnded(0));
        soilV[1] = ads.computeVolts(ads.readADC_SingleEnded(1));
        batV = ads.computeVolts(ads.readADC_SingleEnded(2)) * 2.0f;   // 1:2 bölücü
      }
    }
  }

  // Beton zeminde 5 sn: montaj yüksekliğini sensörler ölçsün
  void calibrateMount() {
    int f = median(tofF), r = median(tofR);
    if (f > 0) mountFront = f;
    if (r > 0) mountRear = r;
    Serial.printf("Kalibrasyon: montaj on=%d mm arka=%d mm\n", mountFront, mountRear);
  }

  // Çim boyu = montaj yüksekliği − ölçülen mesafe (mm); -1 = ölçüm yok
  int grassFrontTof() { int d = median(tofF); return d > 0 ? constrain(mountFront - d, 0, 400) : -1; }
  int grassRearTof()  { int d = median(tofR); return d > 0 ? constrain(mountRear - d, 0, 400) : -1; }
  int grassFrontUs()  { int d = median(usF);  return d > 0 ? constrain(mountFront - d, 0, 400) : -1; }
  int grassRearUs()   { int d = median(usR);  return d > 0 ? constrain(mountRear - d, 0, 400) : -1; }
  float vibRms() { return sqrtf(vibSq); }
  float tempC() { return temp; }
  float humPct() { return hum; }
  int soilPct(int i) {
    float v = soilV[i]; if (v <= 0) return -1;
    float p = (SOIL_DRY_V - v) / (SOIL_DRY_V - SOIL_WET_V) * 100.0f;
    return (int)constrain(p, 0, 100);
  }
  float batteryV() { return batV; }

 private:
  VL53L1X tofFront, tofRear;
  HardwareSerial usFront{0};
  SoftwareSerial usRear;
  Adafruit_MPU6050 mpu;
  Adafruit_BME280 bme;
  Adafruit_ADS1115 ads;
  bool tofFrontOk = false, tofRearOk = false, mpuOk = false, bmeOk = false, adsOk = false;
  int mountFront, mountRear;
  float vibSq = 0, temp = NAN, hum = NAN, soilV[2] = {0, 0}, batV = 0;
  uint32_t slow = 0;

  // 5 elemanlı medyan pencereleri
  struct Win { int v[5] = {-1, -1, -1, -1, -1}; int i = 0; };
  Win tofF, tofR, usF, usR;
  void pushMed(Win& w, int d) { w.v[w.i] = d; w.i = (w.i + 1) % 5; }
  int median(Win& w) {
    int a[5]; int n = 0;
    for (int x : w.v) if (x > 0) a[n++] = x;
    if (n == 0) return -1;
    for (int i = 1; i < n; i++) { int k = a[i], j = i - 1; while (j >= 0 && a[j] > k) { a[j + 1] = a[j]; j--; } a[j + 1] = k; }
    return a[n / 2];
  }

  // A02YYUW çerçevesi: 0xFF, yüksek, düşük, toplam
  int readUs(Stream& s) {
    int last = -1;
    while (s.available() >= 4) {
      if (s.read() != 0xFF) continue;
      int h = s.read(), l = s.read(), sum = s.read();
      if (((0xFF + h + l) & 0xFF) == sum) last = (h << 8) | l;
    }
    return last;
  }
};
