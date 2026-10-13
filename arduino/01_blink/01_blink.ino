// 01 - LED yakıp söndürme + Serial Monitor'e yazma (ESP32 DevKit V1, kart üstü LED = GPIO 2)
void setup() {
  Serial.begin(115200);
  pinMode(2, OUTPUT);
}
void loop() {
  digitalWrite(2, HIGH); Serial.println("LED ACIK");  delay(500);
  digitalWrite(2, LOW);  Serial.println("LED KAPALI"); delay(500);
}
