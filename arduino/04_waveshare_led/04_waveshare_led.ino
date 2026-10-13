// 04 - Waveshare ESP32-S3 A7670E ilk test: RGB LED (GPIO 38) renk degistirir
void setup() { Serial.begin(115200); }
void loop() {
  rgbLedWrite(38, 40, 0, 0);  Serial.println("KIRMIZI"); delay(700);
  rgbLedWrite(38, 0, 40, 0);  Serial.println("YESIL");   delay(700);
  rgbLedWrite(38, 0, 0, 40);  Serial.println("MAVI");    delay(700);
}
