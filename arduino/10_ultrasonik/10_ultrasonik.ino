// 10 - A02YYUW su gecirmez ultrasonik mesafe sensoru (Waveshare ESP32-S3)
// Kablolar: KIRMIZI -> 3V3, SIYAH -> GND, BEYAZ (sensor TX) -> IO39, SARI (sensor RX) -> bos birak
// Sensor 9600 baud ile 4 baytlik paket yollar: 0xFF, yuksek, dusuk, toplam
const int RX_PIN = 39, TX_PIN = 40;

void setup() {
  Serial.begin(115200);
  delay(3000);
  Serial1.begin(9600, SERIAL_8N1, RX_PIN, TX_PIN);
  Serial.println("A02YYUW testi - sensoru tavana/duvara tut, elini onunde gezdir");
}

void loop() {
  static uint8_t b[4]; static int n = 0;
  static uint32_t son = millis();
  while (Serial1.available()) {
    uint8_t c = Serial1.read();
    if (n == 0 && c != 0xFF) continue;      // paket basini bekle
    b[n++] = c;
    if (n == 4) {
      n = 0;
      if (((b[0] + b[1] + b[2]) & 0xFF) == b[3]) {
        int mm = b[1] * 256 + b[2];
        Serial.printf("Mesafe: %4d mm (%.1f cm)\n", mm, mm / 10.0);
      } else Serial.println("bozuk paket");
      son = millis();
    }
  }
  if (millis() - son > 3000) { Serial.println("veri yok -> beyaz kablo IO39'da mi, kirmizi 3V3'te mi?"); son = millis(); }
}
