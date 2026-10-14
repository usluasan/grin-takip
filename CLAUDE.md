# GRIN Takip — kalıcı çalışma kuralları

Bu dosya, bu repoda çalışan Claude için bağlayıcıdır. Kullanıcı: Hasan (proje sahibi; elektronik ve yazılımda yeni, Mac — Apple Silicon — kullanıyor).
Proje: Arteverte Peyzaj / GRIN Türkiye için "GRIN Akıllı Çim Biçme Takip Sistemi" — makineye takılan modül (sensörler + RTK GPS + 4G) ve verisini gösteren web/PWA uygulaması. Asıl amaç: malçlama sayesinde torbalı biçime göre karbon tasarrufunu denetlenebilir biçimde kanıtlamak.

**İzolasyon:** Bu repo YALNIZCA GRIN Takip içindir. finale-takip, SAP/EnerjiSA, TCDD ya da başka hiçbir projeyle ilişkisi yoktur; o repolara dokunulmaz, oradan kod, veri, isim ya da sürüm adı taşınmaz.

## Kurallar

1. **Dil:** Her zaman Türkçe konuş ve yaz. Kod yorumları, commit mesajları ve belgeler de Türkçe.
2. **Anlatım ve komutlar:** Adım adım, kısa. Komut verirken tam komutu ve hangi klasörde çalıştırılacağını yaz.
3. **Değişiklik kaydı:** Her değişiklikte İKİ dosyayı birlikte güncelle, yeni kaydı EN ALTA ekle:
   - `DEGISIKLIK_AI.txt` — makine-okunur. Satır formatı:
     `ID | TARİH | SÜRÜM | TÜR | DOSYA/BÖLÜM | ETKİ | NOT`
     Tür: `FEAT`, `FIX`, `UI`, `INFRA`, `DATA`, `DOC`, `HW`. ID sıralı gider (G001, G002, ...).
   - `DEGISIKLIKLER.txt` — Hasan'ın okuduğu, tarihli, sade Türkçe liste.
4. **Commit:** Her commit TEK bir konuyu içerir; kayıt dosyaları (madde 3) aynı commit'e girer. İş test edilip bitince commit + push yap ve ne yapıldığını raporla.
   - Commit'ten önce `git diff --cached --stat` ile içeriğin mesajla uyuştuğunu doğrula.
   - Önce sor: kapsam belirsizse, geri alınması zor bir işse, ya da yarım/test edilmemiş bir şeyi commit'lemek gerekiyorsa.
5. **Geri alma:** Yalnızca `git revert`. `git reset --hard`, zorla push (force push) ve geçmişi yeniden yazma YOK.
6. **Oturum hijyeni:** Oturum başında `git status` + `git fetch`; commit'lenmemiş ya da push edilmemiş değişiklik varsa söyle. Oturum sonunda çalışma klasörü temiz ve GitHub ile eşit olmalı; değilse nedenini yaz.
7. **Güvenlik:** Şifre, token, API anahtarı, SIM/IMEI/ICCID bilgisi, kişisel veri repoya girmez. `.env` ASLA commit edilmez (`.env.example` kalır). Repo PRIVATE'tır (demo şifreleri ve proje planları içerir); public yapmadan önce Hasan'a sor. Güvenlik açığı görürsen söyle.
8. **Dürüstlük:** Test etmediğin şeye "çalışıyor" deme. Şu ayrımı her zaman yaz: **derlendi** / **masa testi yapıldı** / **sahada test edildi** / **test edilmedi**.
9. **Takip:** İşler GitHub Issues + milestone'larla izlenir. Etiketler: `firmware`, `backend`, `web`, `donanım`, `saha-testi`, `karbon`, `siparis-bekliyor`. Commit bir issue'yu kapatıyorsa mesajda belirt (`Kapatır: #12`).

## Proje kuralları (sahibinin talimatı)

- **Bileşen seçimi:** Her bileşen için tam model, neden seçildiği, en az bir alternatif ve Türkiye'de temin bilgisi yazılır.
- **Teknik değerler:** Emin olunmayan teknik değer uydurulmaz; datasheet'e dayanır ya da "doğrulanacak" yazılır.
- **Karbon hesabı:** Her emisyon faktörünün kaynağı yazılır; kaynaksız katsayılar "varsayım" diye işaretlenir. Formüller denetlenebilir olmalıdır.
- **Maliyet:** Maliyet tablolarında TL tutarı yazılmaz; yalnızca kalem + maliyet türü.
- **Karar:** Birden fazla yol varsa artı/eksi + öneri sun, kararı Hasan'a bırak.
- **Donanım değişikliği** (pin, kablo, parça): `DEVIR-NOTU.md` §3 tablosu ve `SPEC.md` (§8 pinler) aynı commit'te güncellenir; kayıt türü `HW`.
- **Sözleşme:** firmware ↔ backend ↔ web arasındaki her değişiklik önce `SPEC.md`'de yapılır.

## Sürüm ve commit düzeni

**Commit mesajı biçimi** (hepsi Türkçe):

```
TÜR(bölüm): tek satır özet [G0xx]

Ne değişti:
- ...
Neden:
- ...
Test:
- edildi: ... (derlendi / masa testi / saha)
- edilmedi: ...
Geri alma: git revert <bu commit> (ek adım varsa yaz)
```

- `TÜR`: `FEAT`, `FIX`, `UI`, `INFRA`, `DATA`, `DOC`, `HW` (DEGISIKLIK_AI.txt ile aynı). `bölüm`: `firmware`, `arduino`, `kopru`, `backend`, `web`, `karbon`, `donanim`, `belge`, `surum`, `repo` gibi.
- `[G0xx]`: bu commit'in DEGISIKLIK_AI.txt kayıt numarası/numaraları (`git log --grep=G012` commit'i bulur).
- Hata düzeltmesinde hatayı getiren commit/kayıt da yazılır ("Düzeltir: G015").

**Sürümler:** `vMAJOR.MINOR.PATCH Kodad`; geçmiş `SURUMLER.md`'de, güncel sürüm `SURUM` dosyasında.
- PATCH: hata/küçük düzeltme (kodad aynı). MINOR: yeni özellik (yeni kodad). MAJOR: veri yapısı / paket sözleşmesi / geriye uyumsuz değişiklik (yeni kodad).
- Kodad bir botanikçi ya da ziraatçının soyadıdır (ilk sürüm: Borlaug). Daha önce kullanılmamış bir ad seç; başka projelerin isim havuzu kullanılmaz.
- Sürüm atlarken sırayla: `SURUM`, `SURUMLER.md`, iki kayıt dosyası → commit → açıklamalı etiket (`git tag -a v0.2.0 -m "v0.2.0 Kodad"`) → `git push --follow-tags`.

## Proje yapısı

- GitHub deposu (private): https://github.com/usluasan/grin-takip — dal `main`, yerel klasör `~/Projects/grin-takip`.
- `SPEC.md` — ortak sözleşme (MQTT konuları, JSON paket, DB şeması, API, karbon formülleri, pinler).
- `DEVIR-NOTU.md` — proje durumu, donanım tablosu (§3), verilen kararlar (§4), sıradaki işler (§6).
- `arduino/01..13_*` — masa testi sketch'leri. `firmware/grin_module/` — ana firmware (henüz derlenmiyor). `firmware/sensor_test/` — eski test kodu.
- `kopru/kopru.py` — USB köprüsü: kart JSON satırı → MQTT (SIM yokken masa testi).
- `backend/` — FastAPI + Mosquitto + PostgreSQL/PostGIS/TimescaleDB. Python 3.10+ gerekir (hedef 3.12); Mac'te Docker ile çalışır.
- `web/` — React + Vite + Leaflet; API yoksa demo moduna düşer.
- Nasıl çalıştırılır: `README.md`. Sürüm geçmişi: `SURUMLER.md`.

## Derleme / test komutları

Hepsi `~/Projects/grin-takip` klasöründen:

- Web: `cd web && npm ci && npm run build`
- Backend (Docker içinde, Python 3.12; Mac'teki Python 3.9 çalıştırmaz): `docker compose run --rm --no-deps -T -v "$PWD/backend/tests:/srv/tests:ro" api python -m pytest -q -p no:cacheprovider tests`
- Arduino (arduino-cli, Arduino IDE'nin içindeki kopya): 
  `"/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli" compile --fqbn esp32:esp32:esp32s3 arduino/12_hepsi` (USB CDC On Boot KAPALI kalır; `CDCOnBoot=cdc` ile çıktı bozuk gelir — 2026-10-14)
