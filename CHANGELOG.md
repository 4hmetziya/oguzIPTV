# Changelog / Sürüm notları

English first, Türkçe aşağıda her sürümün altında.

## 2.4.0

**English**
- **Subtitles:** new order: Subdl (your own key) → The Subtitle Database (no key, movies only) → OpenSubtitles (developer key in `config.js` only). A small on-screen note shows which source answered.
- OpenSubtitles removed from Settings and from the phone page; users are no longer asked for that key.
- **Phone page:** new "How to get a key" help for TMDB and Subdl (Turkish and English, with screenshots). Fixed a wrong "could not send" message that appeared after a successful send.
- README rewritten and now also available in Turkish (`README.tr.md`).
- Not yet tested on a real TV.

**Türkçe**
- **Altyazı:** yeni sıra: Subdl (kendi anahtarın) → The Subtitle Database (anahtarsız, sadece filmler) → OpenSubtitles (yalnızca `config.js`'teki geliştirici anahtarı). Ekrandaki küçük not hangi kaynağın cevap verdiğini gösterir.
- OpenSubtitles, Ayarlar'dan ve telefon sayfasından kaldırıldı; kullanıcıdan artık bu anahtar istenmez.
- **Telefon sayfası:** TMDB ve Subdl için yeni "Anahtar nasıl alınır?" yardımı (Türkçe ve İngilizce, ekran görüntülü). Başarılı gönderimden sonra çıkan yanlış "Gönderilemedi" mesajı düzeltildi.
- README yenilendi ve artık Türkçesi de var (`README.tr.md`).
- Henüz gerçek bir TV'de denenmedi.

## 2.1.0 – 2.3.0

**English**
- Optional **TMDB** extras with your own key: cast photos, Turkish plots, episode photos, "Popular (TMDB)" lists.
- **Connection quality:** signal bars in the player, a 60-second graph (blue key) and an optional connection test in Settings.
- **API keys from Settings** (with a Test button) and **QR pairing** from the phone (end-to-end encrypted, through ntfy.sh).
- Series window, search, Back-button and on-screen display fixes.

**Türkçe**
- Kendi anahtarınla isteğe bağlı **TMDB** ekstraları: oyuncu fotoğrafları, Türkçe özetler, bölüm fotoğrafları, "Popüler (TMDB)" listeleri.
- **Bağlantı kalitesi:** oynatıcıda sinyal çubukları, 60 saniyelik grafik (mavi tuş) ve Ayarlar'da isteğe bağlı bağlantı testi.
- **Ayarlar'dan API anahtarı girme** (Test düğmesiyle) ve telefondan **QR eşleştirme** (uçtan uca şifreli, ntfy.sh üzerinden).
- Dizi penceresi, arama, Geri tuşu ve ekran bandı düzeltmeleri.

## 2.0.0

**English**
- **Program guide** (provider's `xmltv.php`), now/next banner, today's schedule.
- **Channel list inside the player**, channel numbers, last channel.
- **Category manager** (hide / pin), continue watching and recently added.
- Clean package builder (`tools/build.js`) with only the needed files.

**Türkçe**
- **Program rehberi** (sağlayıcının `xmltv.php` dosyası), şimdi/sonra bandı, bugünün programı.
- **Oynatıcıda kanal listesi**, kanal numaraları, son kanal.
- **Kategori yöneticisi** (gizle / sabitle), devam et ve son eklenenler.
- Yalnızca gerekli dosyaları içeren temiz paket oluşturucu (`tools/build.js`).

## 1.x

Earlier versions (1.0.0 – 1.2.0): M3U support, Turkish/English interface, grid view. See the [Releases](https://github.com/4hmetziya/oguzIPTV/releases) page.
Önceki sürümler (1.0.0 – 1.2.0): M3U desteği, Türkçe/İngilizce arayüz, ızgara görünümü. [Releases](https://github.com/4hmetziya/oguzIPTV/releases) sayfasına bak.
