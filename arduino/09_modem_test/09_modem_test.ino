// 09 - MODEM (A7670E) + SIM TESTI  (Waveshare ESP32-S3-A7670E-4G)
// Kartin arkasindaki DIP: 4G = ON, CAM = OFF. SIM takili, PIN kapali. LTE anteni (MAIN) takili.
// Kod modemin hangi pin/hizda konustugunu kendisi arar, sonra durum komutlarini calistirir.
// En sonda "kopru" moduna gecer: Serial Monitor'e yazdigin AT komutu modeme gider.

const int PINLER[][2] = { {17, 18}, {18, 17} };       // {RX, TX} adaylari
const long HIZLAR[]   = { 115200, 9600, 57600, 921600 };
const char *APN = "internet";                            // Turk Telekom - dogrulanacak

String gonder(const char *cmd, uint32_t bekle = 1500) {
  while (Serial1.available()) Serial1.read();
  Serial1.print(cmd); Serial1.print("\r\n");
  String cevap; uint32_t t0 = millis();
  while (millis() - t0 < bekle) {
    while (Serial1.available()) cevap += (char)Serial1.read();
    if (cevap.indexOf("OK") >= 0 || cevap.indexOf("ERROR") >= 0) break;
  }
  cevap.trim();
  return cevap;
}

bool modemBul() {
  for (auto &p : PINLER) for (long hiz : HIZLAR) {
    Serial1.end(); delay(50);
    Serial1.begin(hiz, SERIAL_8N1, p[0], p[1]); delay(100);
    Serial.printf("Deneniyor: RX=%d TX=%d hiz=%ld ... ", p[0], p[1], hiz);
    for (int i = 0; i < 3; i++) {
      if (gonder("AT", 500).indexOf("OK") >= 0) { Serial.println("BULUNDU!"); return true; }
    }
    Serial.println("yok");
  }
  return false;
}

void komut(const char *aciklama, const char *cmd, uint32_t bekle = 2000) {
  Serial.printf("\n>> %s  (%s)\n%s\n", aciklama, cmd, gonder(cmd, bekle).c_str());
}

void setup() {
  Serial.begin(115200);
  delay(3000);
  Serial.println("\n=== MODEM TESTI ===  Modem acilisi icin 15 sn bekleniyor...");
  delay(15000);
  bool ok = false;
  for (int tur = 1; tur <= 3 && !ok; tur++) { Serial.printf("-- Arama turu %d --\n", tur); ok = modemBul(); if (!ok) delay(5000); }
  if (!ok) { Serial.println("\nMODEM CEVAP VERMEDI -> 4G DIP anahtarini ve guc anahtarini kontrol et."); return; }

  komut("Modem bilgisi", "ATI");
  komut("SIM durumu (READY olmali)", "AT+CPIN?");
  komut("Sinyal gucu (ilk sayi 10-31 iyi, 99 = sinyal yok)", "AT+CSQ");
  komut("Operator", "AT+COPS?", 5000);
  komut("4G kaydi (,1 veya ,5 = kayitli)", "AT+CEREG?");
  String apn = String("AT+CGDCONT=1,\"IP\",\"") + APN + "\"";
  komut("APN ayari", apn.c_str());
  komut("Internete baglan", "AT+CGATT=1", 10000);
  komut("Alinan IP adresi", "AT+CGPADDR=1", 3000);
  Serial.println("\n=== Bitti. Kopru modu: buraya AT komutu yazip Enter'a bas. ===");
}

void loop() {
  while (Serial.available())  Serial1.write(Serial.read());
  while (Serial1.available()) Serial.write(Serial1.read());
}
