// 11 - microSD kart testi (Waveshare ESP32-S3-A7670E-4G, TF yuvasi)
// Pinler Waveshare dokumanindan: CLK=IO5, CMD=IO4, DATA0=IO6 (1-bit SDMMC)
#include <SD_MMC.h>

void setup() {
  Serial.begin(115200);
  delay(3000);
  Serial.println("=== microSD TESTI ===");
  SD_MMC.setPins(5, 4, 6);
  if (!SD_MMC.begin("/sdcard", true)) {          // true = 1-bit mod
    Serial.println("KART BULUNAMADI -> kart yuvaya tam oturdu mu? FAT32 formatli mi?");
    return;
  }
  Serial.printf("Kart tipi: %s\n", SD_MMC.cardType() == CARD_SDHC ? "SDHC" : "diger");
  Serial.printf("Kapasite: %llu MB\n", SD_MMC.cardSize() / (1024 * 1024));
  Serial.printf("Bos alan: %llu MB\n", (SD_MMC.totalBytes() - SD_MMC.usedBytes()) / (1024 * 1024));

  // yazma testi
  File f = SD_MMC.open("/grin_test.csv", FILE_WRITE);
  if (!f) { Serial.println("YAZMA HATASI"); return; }
  f.println("zaman_ms,deger");
  for (int i = 0; i < 100; i++) f.printf("%lu,%d\n", millis(), i);
  f.close();
  Serial.println("Yazma OK (grin_test.csv, 100 satir)");

  // okuma testi
  f = SD_MMC.open("/grin_test.csv");
  int satir = 0; while (f.available()) if (f.read() == '\n') satir++;
  f.close();
  Serial.printf("Okuma OK: %d satir okundu (101 olmali)\n", satir);
  Serial.println(satir == 101 ? "SONUC: microSD CALISIYOR" : "SONUC: satir sayisi tutmadi");
}

void loop() {}
