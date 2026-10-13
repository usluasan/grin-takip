// Hücresel katman: modem (TinyGSM A7670), MQTT (PubSubClient), NTRIP istemcisi, komutlar
#pragma once
#include <Arduino.h>
#include <TinyGsmClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "config.h"

class SdBuffer;
static String g_pendingCmd;   // MQTT callback'ten döngüye komut taşır

static void mqttCallback(char* topic, byte* payload, unsigned int len) {
  g_pendingCmd = String((const char*)payload, len);
}

class Cellular {
 public:
  Cellular(TinyGsm& m, PubSubClient& q, TinyGsmClient& ntripClient) : modem(m), mqtt(q), ntrip(ntripClient) {}

  void begin() {
    Serial.println("Modem baslatiliyor...");
    modem.init();
    if (strlen(SIM_PIN) && modem.getSimStatus() != 3) modem.simUnlock(SIM_PIN);
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    mqtt.setCallback(mqttCallback);
    mqtt.setKeepAlive(MQTT_KEEPALIVE);
    mqtt.setBufferSize(1024);
    snprintf(topicTel, sizeof topicTel, "grin/%s/telemetry", DEVICE_ID);
    snprintf(topicSt,  sizeof topicSt,  "grin/%s/status",    DEVICE_ID);
    snprintf(topicEv,  sizeof topicEv,  "grin/%s/event",     DEVICE_ID);
    snprintf(topicCmd, sizeof topicCmd, "grin/%s/cmd",       DEVICE_ID);
  }

  // Döngüde sık çağrılır; bağlantıyı adım adım kurar, bloklamaz
  void maintain() {
    uint32_t now = millis();
    if (!netOk) {
      if (now - tRetry < 5000) return; tRetry = now;
      if (!modem.isNetworkConnected()) { modem.waitForNetwork(3000); return; }
      if (!modem.isGprsConnected()) { modem.gprsConnect(APN, APN_USER, APN_PASS); return; }
      netOk = true; Serial.println("Sebeke OK");
    }
    if (!mqtt.connected()) {
      if (now - tRetry < 5000) return; tRetry = now;
      String cid = String(DEVICE_ID) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);
      if (mqtt.connect(cid.c_str(), DEVICE_ID, DEVICE_TOKEN)) {
        mqtt.subscribe(topicCmd, 1); Serial.println("MQTT OK");
      } else { Serial.printf("MQTT hata %d\n", mqtt.state()); if (!modem.isGprsConnected()) netOk = false; }
    } else {
      mqtt.loop();
    }
    if (NTRIP_ENABLED && netOk && !ntrip.connected() && now - tNtrip > 10000) { tNtrip = now; ntripConnect(); }
  }

  bool publishTelemetry(const String& p) { return mqtt.connected() && mqtt.publish(topicTel, p.c_str(), false); }
  bool publishStatus(const String& p)    { return mqtt.connected() && mqtt.publish(topicSt, p.c_str(), false); }
  void publishEvent(const char* type, const char* msg, SdBuffer& sd);

  int rssiDbm() { int csq = modem.getSignalQuality(); return (csq >= 0 && csq < 99) ? -113 + 2 * csq : 0; }
  bool ntripConnected() { return ntripUp && ntrip.connected(); }

  // NTRIP'ten gelen RTCM baytlarını GNSS'e aktar
  void pumpNtrip(HardwareSerial& gnssSerial) {
    if (!ntrip.connected()) return;
    uint8_t buf[256];
    while (ntrip.available()) {
      int n = ntrip.read(buf, sizeof buf);
      if (n <= 0) break;
      if (!ntripUp) {        // ilk yanıt: HTTP başlığını atla
        String s((const char*)buf, n);
        if (s.indexOf("200") >= 0 || s.indexOf("ICY") >= 0) ntripUp = true;
        continue;
      }
      gnssSerial.write(buf, n);
    }
  }
  // VRS ağları konumu ister: GGA cümlesini periyodik gönder
  void sendGga(const String& gga) { if (ntrip.connected() && gga.length()) { ntrip.print(gga); ntrip.print("\r\n"); } }

  void handleCommands() {
    if (g_pendingCmd.length() == 0) return;
    JsonDocument d; DeserializationError e = deserializeJson(d, g_pendingCmd); g_pendingCmd = "";
    if (e) return;
    const char* cmd = d["cmd"] | "";
    if (!strcmp(cmd, "reboot")) { Serial.println("Komut: reboot"); delay(200); ESP.restart(); }
    else if (!strcmp(cmd, "interval")) { Serial.printf("Komut: interval %d\n", (int)d["sec"]); /* TODO: telemetri periyodu */ }
    else if (!strcmp(cmd, "ota")) { Serial.printf("Komut: ota %s\n", (const char*)(d["url"] | "")); /* Aşama 4: HTTP OTA */ }
  }

 private:
  TinyGsm& modem; PubSubClient& mqtt; TinyGsmClient& ntrip;
  bool netOk = false, ntripUp = false;
  uint32_t tRetry = 0, tNtrip = 0;
  char topicTel[48], topicSt[48], topicEv[48], topicCmd[48];

  static String b64(const String& s) {
    const char* T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    String o; int val = 0, bits = -6;
    for (unsigned char c : s) { val = (val << 8) + c; bits += 8; while (bits >= 0) { o += T[(val >> bits) & 0x3F]; bits -= 6; } }
    if (bits > -6) o += T[((val << 8) >> (bits + 8)) & 0x3F];
    while (o.length() % 4) o += '=';
    return o;
  }
  void ntripConnect() {
    ntripUp = false;
    if (!ntrip.connect(NTRIP_HOST, NTRIP_PORT, 5000)) { Serial.println("NTRIP baglanamadi"); return; }
    String auth = b64(String(NTRIP_USER) + ":" + NTRIP_PASS);
    ntrip.print(String("GET /") + NTRIP_MOUNT + " HTTP/1.1\r\nHost: " + NTRIP_HOST + "\r\nNtrip-Version: Ntrip/2.0\r\nUser-Agent: NTRIP GRIN/1.0\r\nAuthorization: Basic " + auth + "\r\nConnection: close\r\n\r\n");
    Serial.println("NTRIP istek gonderildi");
  }
};

#include "buffer.h"
inline void Cellular::publishEvent(const char* type, const char* msg, SdBuffer& sd) {
  JsonDocument d; d["v"] = 1; d["ts"] = (uint32_t)(millis() / 1000); d["type"] = type; d["msg"] = msg;
  String p; serializeJson(d, p);
  if (!(mqtt.connected() && mqtt.publish(topicEv, p.c_str(), false))) sd.append(p);   // basit: tamponla
  Serial.printf("Olay: %s\n", type);
}
