// SD tampon: şebeke yokken telemetri satırlarını buffer.jsonl'e yazar, bağlantı gelince sırayla gönderir
#pragma once
#include <Arduino.h>
#include <SD_MMC.h>

class Cellular;   // ileri bildirim

class SdBuffer {
 public:
  void begin(bool ok) { sdOk = ok; Serial.printf("SD: %s\n", ok ? "hazir" : "yok"); }
  void append(const String& line) {
    if (!sdOk) return;
    File f = SD_MMC.open(PATH, FILE_APPEND);
    if (!f) return;
    f.println(line); f.close(); pending = true;
  }
  int freeMb() { return sdOk ? (int)((SD_MMC.totalBytes() - SD_MMC.usedBytes()) / (1024 * 1024)) : 0; }
  bool hasPending() { return pending; }
  // Her çağrıda en fazla N satır gönderir (döngüyü bloklamamak için); hepsi gidince dosyayı siler
  template <typename C> void flush(C& cell, int maxLines = 20) {
    if (!sdOk || !pending) return;
    File f = SD_MMC.open(PATH, FILE_READ);
    if (!f) { pending = false; return; }
    File tmp = SD_MMC.open(TMP, FILE_WRITE);
    int sent = 0; bool failed = false;
    while (f.available()) {
      String l = f.readStringUntil('\n'); l.trim();
      if (l.length() == 0) continue;
      if (!failed && sent < maxLines && cell.publishTelemetry(l)) { sent++; continue; }
      failed = true; tmp.println(l);           // gönderilemeyenleri koru
    }
    f.close(); tmp.close();
    SD_MMC.remove(PATH);
    if (failed) SD_MMC.rename(TMP, PATH); else { SD_MMC.remove(TMP); pending = false; }
    if (sent) Serial.printf("SD tampondan %d satir gonderildi\n", sent);
  }
 private:
  const char* PATH = "/sdcard/buffer.jsonl";
  const char* TMP = "/sdcard/buffer.tmp";
  bool sdOk = false, pending = true;   // açılışta eski kayıt olabilir
};
