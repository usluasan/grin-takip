// 07 - TEK VL53L1X lazer mesafe testi (Waveshare ESP32-S3)  v2
// Kablolar: VIN->3V3, GND->GND, SDA->IO15, SCL->IO16  (VDD, XSHUT, GPIO1 bos)
// Kutuphane: "VL53L1X" by Pololu
#include <Wire.h>
#include <VL53L1X.h>

VL53L1X tof;

void setup() {
  Serial.begin(115200);
  delay(3000);                       // Serial Monitor acilsin
  Wire.begin(15, 16);
  Wire.setClock(100000);             // yavas ve guvenli hiz (uzun kablolar icin)
  tof.setTimeout(500);
  if (!tof.init()) {
    Serial.println("VL53L1X BULUNAMADI -> kablolari kontrol et");
    while (1) delay(1000);
  }
  tof.setDistanceMode(VL53L1X::Short);     // kisa mod: 1.3 m'ye kadar, isiga daha dayanikli
  tof.setMeasurementTimingBudget(50000);   // 50 ms olcum
  tof.startContinuous(50);
  Serial.println("VL53L1X OK - elini sensorun ustunde yukari asagi gezdir");
}

void loop() {
  uint32_t t0 = millis();
  uint16_t mm = tof.read();
  uint32_t sure = millis() - t0;
  if (tof.timeoutOccurred()) { Serial.println("zaman asimi"); return; }
  Serial.printf("Mesafe: %4u mm (%.1f cm) | durum: %-18s | I2C hata: %d | %lu ms\n",
                mm, mm / 10.0,
                VL53L1X::rangeStatusToString(tof.ranging_data.range_status),
                tof.last_status, (unsigned long)sure);
  delay(10000);
}
