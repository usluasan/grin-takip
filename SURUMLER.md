# GRIN Takip — Sürümler

Sürüm geçmişi: hangi sürümde ne var, test durumu ne ve o sürüme nasıl dönülür.
Yeni sürüm EN ALTA eklenir. Güncel sürüm ayrıca `SURUM` dosyasında tek satır olarak durur.

## Sürüm numarası nasıl okunur

`vMAJOR.MINOR.PATCH Kodad` — örnek: `v0.1.0 Borlaug`

| Basamak | Ne zaman artar | Kodad |
|---|---|---|
| PATCH (v0.1.**1**) | Hata düzeltme, küçük düzeltme, belge | Aynı kalır |
| MINOR (v0.**2**.0) | Yeni özellik, yeni sensör, yeni ekran | Yeni ad |
| MAJOR (v**1**.0.0) | Veri yapısı / paket sözleşmesi değişimi, geriye uyumsuz değişiklik | Yeni ad |

Kodadlar botanikçi ve ziraatçıların soyadlarıdır; kullanılmış ad tekrar kullanılmaz.
Kullanılanlar: Borlaug (Norman Borlaug, ziraatçı).

## Bir şeyi bulmak ve geri dönmek

Tüm komutlar `~/Projects/grin-takip` klasöründe çalıştırılır.

| Amaç | Komut |
|---|---|
| Sürümleri listele | `git tag -n1` |
| Commit geçmişini kısa gör | `git log --oneline` |
| Bir kaydın (ör. G012) commit'ini bul | `git log --grep=G012` |
| Bir commit'te ne değişti | `git show <commit>` |
| İki sürüm arasında ne değişti | `git diff v0.1.0 v0.2.0 --stat` |
| Eski sürüme sadece bakmak | `git switch --detach v0.1.0` (geri gelmek için: `git switch main`) |
| Tek bir commit'i geri almak (geçmişi silmeden) | `git revert <commit>` |

Geri alma her zaman `git revert` ile yapılır; `git reset --hard` ve zorla push kullanılmaz.
Veritabanı verisi ve SD kart ölçümleri git'te olmadığı için sürüm değiştirmek veriyi geri almaz.

---

## v0.1.0 Borlaug — 13 Ekim 2026

İlk sürüm: claude.ai "arteverte" projesinden devralınan kodun repoya alınması + çalışma kuralları. Kod değişikliği yok.

**İçerik** (kayıtlar: G001–G003, `git log --grep=G00`)
- Devralınan içerik: `SPEC.md`, `arduino/01..13`, `firmware/`, `kopru/`, `backend/`, `web/`, `docker-compose.yml`.
- `CLAUDE.md` (kalıcı kurallar), değişiklik günlükleri, sürüm düzeni, `.gitignore`.
- `README.md` "nasıl çalıştırılır" odaklı yeniden yazıldı (USB köprüsü ile masa testi akışı).

**Test durumu** (Mac, Apple Silicon, 2026-10-13)

| Parça | Sonuç |
|---|---|
| `web/` — `npm ci && npm run build` (Node 22) | ✅ build alındı (tsc hatasız, 98 modül) |
| `arduino/01..13` — arduino-cli 1.5.1, esp32 core 3.3.12, FQBN `esp32:esp32:esp32s3:CDCOnBoot=cdc` | ✅ 13/13 derlendi |
| `arduino/12_hepsi` | masa testi yapıldı (2026-10-12, devir notuna göre; bu oturumda karta yüklenmedi) |
| `arduino/13_kopru`, `kopru/kopru.py` | derlendi / karta yüklenmedi, köprü çalıştırılmadı |
| `firmware/grin_module` | ❌ derlenmiyor: `TinyGsmClient.h` yok (kütüphaneler kurulu değil) |
| `firmware/sensor_test` | ❌ derlenmiyor: `Adafruit_ADS1X15.h` yok |
| `backend/` — pytest | ❌ çalıştırılamadı: Mac'te yalnız Python 3.9.6 var, kod 3.10+ istiyor (`float \| None`); 15 test toplanamadı |
| Docker yığını (`docker compose up`) | test edilmedi (Docker Desktop kurulu değil) |
| Sahada | hiçbir şey test edilmedi |

---

## v0.1.1 Borlaug — 14 Ekim 2026

PATCH: 4G modem masa testinde doğrulandı + kart ayarı düzeltmesi. Kayıtlar: G004–G006.

**İçerik**
- G004 (HW): A7670E modem ESP RX=IO17 / TX=IO18, 115200 baud; Türk Telekom hattı açık, APN "internet" çalışıyor. Firmware ayarındaki ters modem pinleri düzeltildi.
- G005 (FIX): USB CDC On Boot = **Disabled**; arduino-cli FQBN `esp32:esp32:esp32s3` (v0.1.0'daki `CDCOnBoot=cdc` yanlıştı).

**Test durumu** (2026-10-14)

| Parça | Sonuç |
|---|---|
| `arduino/09_modem_test` — FQBN `esp32:esp32:esp32s3` | ✅ derlendi, karta yüklendi, **masa testi yapıldı** |
| Modem | ✅ ATI A7670E-FASE · SIM READY · LTE kayıtlı (28603) · CSQ 22 · IP alındı |
| İnternet | ✅ modem üzerinden HTTP GET http://example.com → 200 (577 bayt) |
| Aynı sketch `CDCOnBoot=cdc` ile | ❌ seri çıktı bozuk (ayar düzeltmesinin kanıtı) |
| Karttan MQTT | test edilmedi (sunucu yok, #1/#6) |
| `firmware/grin_module` | değişmedi: hâlâ derlenmiyor (#8); pin değişikliği derlenmedi |
| backend pytest | hâlâ çalıştırılamadı (#12) |

---

## v0.1.2 Borlaug — 14 Ekim 2026

PATCH: Docker yığını ilk kez çalıştı, kart → web uçtan uca masa testi. Kayıtlar: G007–G010.

**İçerik**
- G007 (FIX backend): Mosquitto parola dosyası mosquitto kullanıcısına (1883:1883) ait yazılıyor — önceden broker hiç açılmıyordu.
- G008 (FIX web): nginx api adresini Docker DNS'inden yeniden çözüyor — önceden api yeniden başlayınca web 502 alıp demo verisine düşüyordu.
- G009 (DOC): README / DEVIR-NOTU / CLAUDE.md test sonuçları ve komutlar.

**Test durumu** (Mac, Docker Desktop 29.8.2, 2026-10-14)

| Parça | Sonuç |
|---|---|
| `docker compose up -d --build` | ✅ 5 konteyner ayakta (db, mqtt, api, ingest, web); `init.sql` ilk kez çalıştı |
| backend pytest (Docker, Python 3.12) | ✅ 15/15 |
| `arduino/13_kopru` | ✅ karta yüklendi; 5 I2C cihazı + SD OK |
| `kopru/kopru.py` | ✅ ~150 paket gönderildi; veritabanına yazıldı (fix=1, hacc=5) |
| Web (gerçek API) | ✅ giriş, genel bakış, canlı harita (GRIN-01 "Duruyor"), `/machines/live`, `/ws/live` canlı telemetri |
| Oturum açma/kapama, alan ve karbon hesabı | test edilmedi (biçme durumu ve RTK gerekiyor) |
| Karttan doğrudan MQTT (4G) | test edilmedi (sunucu dışarıdan erişilebilir değil) |
| Sunucu kurulumu | test edilmedi |
