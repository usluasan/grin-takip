// GNSS katmanı: NMEA ayrıştırma (TinyGPSPlus) + GGA'dan fix kalitesi/HDOP, NTRIP için son GGA cümlesi
#pragma once
#include <Arduino.h>
#include <TinyGPSPlus.h>

class Gnss {
 public:
  explicit Gnss(HardwareSerial& s) : ser(s) {}
  TinyGPSCustom fixQ, numSat, hdopC;

  void begin() {
    fixQ.begin(gps, "GNGGA", 6);   // fix kalitesi: 0,1,2,4,5
    numSat.begin(gps, "GNGGA", 7);
    hdopC.begin(gps, "GNGGA", 8);
  }

  void poll() {
    while (ser.available()) {
      char c = ser.read();
      gps.encode(c);
      // GGA cümlesini NTRIP VRS için sakla
      if (c == '$') { line = "$"; }
      else if (c == '\n') { if (line.startsWith("$GNGGA") || line.startsWith("$GPGGA")) gga = line; line = ""; }
      else if (line.length() < 120) line += c;
    }
  }

  bool hasFix() { return gps.location.isValid() && fixQuality() > 0; }
  bool hasTime() { return gps.date.isValid() && gps.time.isValid() && gps.date.year() > 2020; }
  double lat() { return gps.location.isValid() ? gps.location.lat() : 0; }
  double lon() { return gps.location.isValid() ? gps.location.lng() : 0; }
  float speedMs() { return gps.speed.isValid() ? gps.speed.mps() : 0; }
  float heading() { return gps.course.isValid() ? gps.course.deg() : 0; }
  int sats() { return atoi(numSat.value()); }
  int fixQuality() { return atoi(fixQ.value()); }
  // Yatay doğruluk (m): RTK fix 0.02, float 0.3, DGPS 1.0, GPS ~ HDOP*2.5 (kaba yaklaşım; UBX-NAV-PVT hAcc daha iyi)
  float hacc() {
    int q = fixQuality(); float h = atof(hdopC.value());
    if (q == 4) return 0.02f; if (q == 5) return 0.30f; if (q == 2) return 1.0f;
    return h > 0 ? h * 2.5f : 5.0f;
  }
  const String& lastGga() { return gga; }

  uint32_t unixTime() {
    // Basit UTC → Unix (TinyGPS tarih/saat)
    int y = gps.date.year(), m = gps.date.month(), d = gps.date.day();
    int H = gps.time.hour(), M = gps.time.minute(), S = gps.time.second();
    int a = (14 - m) / 12; int yy = y + 4800 - a; int mm = m + 12 * a - 3;
    long jdn = d + (153 * mm + 2) / 5 + 365L * yy + yy / 4 - yy / 100 + yy / 400 - 32045;
    return (uint32_t)((jdn - 2440588L) * 86400L + H * 3600L + M * 60L + S);
  }

 private:
  HardwareSerial& ser;
  TinyGPSPlus gps;
  String line, gga;
};
