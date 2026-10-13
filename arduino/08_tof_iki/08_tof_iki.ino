// 08 - IKI VL53L1X (on = kesim oncesi, arka = kesim sonrasi)
// Ortak: VIN->3V3, GND->GND, SDA->IO15, SCL->IO16
// Sadece ARKA sensorun XSHUT -> IO7   (ON sensorun XSHUT bos)
#include <Wire.h>
#include <VL53L1X.h>

const int XSHUT_ARKA = 7;
VL53L1X on, arka;

bool baslat(VL53L1X &s, const char *ad) {
  s.setTimeout(500);
  if (!s.init()) { Serial.printf("%s sensor BULUNAMADI\n", ad); return false; }
  s.setDistanceMode(VL53L1X::Short);
  s.setMeasurementTimingBudget(50000);
  s.startContinuous(50);
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(3000);
  Wire.begin(15, 16);
  Wire.setClock(100000);

  pinMode(XSHUT_ARKA, OUTPUT);
  digitalWrite(XSHUT_ARKA, LOW);     // arka sensoru kapat
  delay(10);
  // Reset/yukleme sonrasi ON sensor hala 0x2A'da kalmis olabilir -> 0x29'a geri al
  Wire.beginTransmission(0x2A);
  if (Wire.endTransmission() == 0) {
    Wire.beginTransmission(0x2A);
    Wire.write(0x00); Wire.write(0x01); Wire.write(0x29);  // I2C_SLAVE__DEVICE_ADDRESS
    Wire.endTransmission();
    delay(10);
  }
  if (!baslat(on, "ON")) while (1) delay(1000);
  on.setAddress(0x2A);               // on sensore yeni adres
  Serial.println("ON sensor OK (adres 0x2A)");

  pinMode(XSHUT_ARKA, INPUT);        // arka sensoru ac (kart kendi direnciyle acar)
  delay(10);
  if (!baslat(arka, "ARKA")) while (1) delay(1000);
  Serial.println("ARKA sensor OK (adres 0x29)");
}

void loop() {
  uint16_t a = on.read(), b = arka.read();
  Serial.printf("ON: %4u mm %-14s | ARKA: %4u mm %-14s\n",
    a, VL53L1X::rangeStatusToString(on.ranging_data.range_status),
    b, VL53L1X::rangeStatusToString(arka.ranging_data.range_status));
  delay(600);
}
