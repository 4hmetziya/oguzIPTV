# oguzIPTV

**LG webOS Akıllı TV'ler** için hafif bir IPTV oynatıcısı. Kendi IPTV aboneliğine (Xtream Codes API ya da M3U listesi) bağlanır ve TV kumandasına göre yapılmıştır: yön tuşlarıyla gezinme, Geri tuşu, renkli tuşlar ve temel imleç desteği.

> **İçerik sunmaz.** oguzIPTV yalnızca bir oynatıcıdır. Kendi aboneliğin / listen gerekir; ne izlediğinden sen sorumlusun.

Düz HTML, CSS ve JavaScript. Framework yok, uygulamanın kendisi için derleme adımı yok.

[English](README.md) · **Türkçe** · [Changelog / Sürüm notları](CHANGELOG.md)

## Özellikler

**Kütüphane**
- Xtream Codes sunucusundan ya da herhangi bir M3U listesinden Canlı TV, Filmler ve Diziler
- Afiş, puan, süre, tür, oyuncular ve özet doğrudan sağlayıcından gelir (üçüncü bir bilgi servisi gerekmez)
- Favoriler, arama (yazarken kısa bir duraklamayı bekler, böylece TV klavyesi açık kalır), liste ya da ızgara görünümü
- Her bölümde **Devam et** ve **Son eklenenler**, **izlendi** işareti; dizi, kaldığın sezon/bölümden açılır
- Hiç kullanmadığın kategorileri gizle, favorileri en üste sabitle (Ayarlar → Kategorileri düzenle ya da kategoride sarı tuş)
- Türkçe ve İngilizce arayüz

**Canlı TV**
- **Program rehberi** (sağlayıcının `xmltv.php` dosyası): listede "şimdi", şimdi/sonra bandı ve bugünün tam programı (sarı tuş)
- **Oynatıcının içinde kanal listesi** (canlı izlerken Sol tuş), kanal numarası (`0-9`), kanal yukarı/aşağı, son kanal (yeşil)
- Akış tamponu içinde duraklatma ve geri sarma; "CANLI" / "-1:47" göstergesi
- **Bağlantı kalitesi**: oynatıcıda sinyal çubukları ve 60 saniyelik grafik (mavi tuş): tampon, hız, takılma ve atlanan kareler. Yalnızca oynatıcının zaten bildiği değerleri okur, ek istek göndermez. Ayarlar'daki bağlantı testi isteğe bağlıdır (5 küçük istek, sadece sen basınca).

**Oynatıcı**
- HLS (hls.js) ve doğrudan dosyalar (mkv, mp4, ...)
- Ses ve altyazı menüsü, kaldığın yerden devam sorusu, otomatik "sonraki bölüm"
- Harici Türkçe altyazı; filmlerde hiçbir ayar gerekmez ([Altyazı kaynakları](#altyazı-kaynakları)); altyazı boyutu / rengi / arka planı Ayarlar'da
- İsteğe bağlı **TMDB** ekstraları (ücretsiz kendi anahtarınla): oyuncu fotoğrafları, Türkçe özetler, bölüm fotoğrafları, popüler listeler

**Ayarlar**
- Altyazı görünümü, program rehberi aç/kapat, kategori yöneticisi
- Hesap bilgisi (durum, bitiş tarihi, bağlantılar)
- **Dosya düzenlemeden API anahtarı girme**: TMDB / Subdl anahtarlarını Ayarlar'dan yaz ("Test" düğmesiyle), ya da **QR kodu** okutup telefonundan gir
- **Çıkış yap** (giriş bilgisini ve izleme geçmişini siler) ve **tüm verileri sil**

## Altyazı kaynakları

Bir film ya da bölüm başlatınca uygulama Türkçe altyazıyı şu sırayla arar ve çalışan ilkini kullanır. Ekranın köşesindeki küçük not, hangi kaynağın cevap verdiğini (ya da neden hiçbirinin vermediğini) söyler:

1. **Subdl**: yalnızca kendi ücretsiz anahtarını eklediysen. Film ve dizilerde çalışır.
2. **The Subtitle Database** (<https://thesubtitledb.org>): anahtar ve hesap gerektirmez. **Sadece filmler**: bölümleri kendi numaralarıyla tuttuğu için dizi numarasıyla sormak yanlış bölümün altyazısını getirebilir; bu yüzden diziler bilerek atlanır.
3. **OpenSubtitles**: yalnızca geliştirici özel `config.js` dosyasına bir anahtar koyduysa. Ayarlar'da görünmez ve kullanıcıdan hiç anahtar istenmez, çünkü OpenSubtitles buna izin vermiyor. Paylaşacağın hiçbir şeyde boş bırak.

SubSource denendi ve şimdilik bırakıldı: API'si tarayıcıdan gelen isteklere izin vermiyor (CORS yok), bu yüzden bir TV uygulaması aracı sunucu olmadan çağıramaz.

## Hızlı başlangıç (geliştirme)

Uygulama `http://` üzerinden sunulmalıdır (`file://` olarak açılmaz):

```bash
python -m http.server 8080
# http://127.0.0.1:8080/index.html adresini aç
```

Xtream Codes sunucu adresin, kullanıcı adın ve şifrenle (ya da bir M3U adresiyle) giriş yap.

## API anahtarları (isteğe bağlı)

Online altyazı hiçbir anahtar olmadan çalışır (The Subtitle Database). Ek kaynak olarak Subdl ve TMDB ekstraları senin kendi ücretsiz API anahtarlarını ister. Anahtarlar depoda **yer almaz**. Üç yoldan girilir:

1. **TV'de Ayarlar**: "TMDB / Subdl anahtarı" bir giriş kutusu açar (TV klavyesi ya da Magic Remote'un sesle girişi) ve **Test** düğmesi anahtarı sınar.
2. **Telefonla (QR kod)**: Ayarlar → "Anahtarları telefonla gir (QR kod)". Kodu okut, telefon sayfasındaki 4 haneli eşleşme kodunun TV'dekiyle aynı olduğunu kontrol et, anahtarları yaz, Gönder'e bas. Anahtarlar telefonda şifrelenir (AES-256-GCM); şifre yalnızca QR kodun içindedir ve herkese açık <https://ntfy.sh> aracısından geçer, aracı yalnızca şifreli metni görür. TV çözüp saklar; kod 5 dakika geçerlidir ve bir kez çalışır.
3. **`config.js`** (paketi kendin derlerken):

```bash
cp config.example.js config.js
# config.js dosyasını aç, subdlApiKey (ve tmdbApiKey) alanlarını doldur
```

`config.js` `.gitignore` içindedir. Asla commit etme. İçindeki `openSubtitlesApiKey` yalnızca geliştiriciye özeldir ([Altyazı kaynakları](#altyazı-kaynakları)). TV'de yazılan anahtarlar `config.js`'tekilerin önüne geçer. Hiç anahtar yokken de uygulama çalışır; yalnızca Subdl kaynağı ve TMDB ekstraları kapalı olur.

### Telefon sayfası (GitHub Pages)

QR kodun açtığı sayfa `docs/pair.html` dosyasıdır. Kendi kopyanı barındırmak için: GitHub → deponun → Settings → Pages → "Deploy from a branch" → `main` / `/docs`. Adres `https://<kullanıcı-adın>.github.io/<depo>/pair.html` olur; bunu `config.js` içine `pairPageUrl` olarak yaz (varsayılan, asıl yazarın sayfasını gösterir). Sayfa, ntfy.sh'a giden şifreli mesaj dışında hiçbir yere bir şey göndermez.

Aynı sayfada **"Anahtar nasıl alınır?"** bölümü vardır (TMDB v3 ve Subdl anahtarı; Türkçe ve İngilizce; `docs/help/img/` altındaki ekran görüntüleriyle). Kısaca adımlar:

- **TMDB**: themoviedb.org → hesap → Ayarlar → API → "+ Oluştur" → "yalnızca kişisel kullanım" seç → kısa formu doldur → **API Key (v3)** değerini kopyala.
- **Subdl**: subdl.com → Sign Up → hesap → API sekmesi → "Default key" kutusundaki anahtarı kopyala.

Anahtarlar kişiseldir: paylaşma ve anahtarı gösteren ekran görüntüsü yayımlama.

İsteğe bağlı: `tmdbApiKey` (<https://www.themoviedb.org> adresinden ücretsiz anahtar) oyuncu fotoğrafları, yaş sınırı, slogan, Türkçe özetler, bölüm fotoğrafları ve özetleri, ayrıca yalnızca sağlayıcının gerçekten sunduğu yapımları gösteren "Popüler (TMDB)" listeleri ekler. Anahtar yoksa TMDB'ye hiç istek gitmez.
Bu ürün TMDB API'sini kullanır ancak TMDB tarafından onaylanmış ya da sertifikalandırılmış değildir.

## Derleme ve TV'ye kurulum

1. webOS CLI'yi kur ve TV'yi Geliştirici Modu'na al: <https://webostv.developer.lge.com/develop/getting-started/developer-mode-app>
   ```bash
   npm i -g @webos-tools/cli
   ares-setup-device
   ```
2. Temiz bir paket oluştur (yalnızca gerekli dosyalar; README / araçlar / eski paketler girmez):
   ```bash
   node tools/build.js              # build/app + build/out/com.oguziptv.app_<sürüm>_all.ipk
   node tools/build.js --no-config  # aynısı ama config.js'in OLMADAN (paylaşacağın her şey için bunu kullan)
   node tools/build.js --folder     # sadece build/app klasörünü hazırlar
   ```
3. Kur ve başlat:
   ```bash
   ares-install --device <tv-adı> build/out/com.oguziptv.app_<sürüm>_all.ipk
   ares-launch  --device <tv-adı> com.oguziptv.app
   ```

`config.js`'inle derlenen paket anahtarlarını içerir: o `.ipk` dosyasını kendine sakla.

## Kumanda

| Tuş | Nerede | İşlev |
|---|---|---|
| Yön tuşları / OK / Geri | her yerde | gez / seç / geri dön |
| Kırmızı | listeler | arama |
| Kırmızı | canlı oynatıcı | kanal listesi |
| Yeşil | canlı oynatıcı | önceki kanal |
| Yeşil | listeler (canlı) | son izlenen kanal |
| Sarı | liste (kanal) | favori |
| Sarı | kategori listesi | kategorileri düzenle |
| Sarı | canlı oynatıcı | bugünün program rehberi |
| Mavi | listeler | liste / ızgara görünümü |
| Mavi | oynatıcı | bağlantı grafiği |
| Sol | canlı oynatıcı (canlı uçta) | kanal listesi (değilse: 10 sn geri) |
| Sağ | oynatıcı | 10 sn ileri |
| Kanal +/- | canlı oynatıcı | sonraki / önceki kanal |
| 0-9 | canlı oynatıcı | kanal numarası (OK hemen onaylar) |

## Veri ve gizlilik

- Giriş bilgin TV tarayıcısının `localStorage` alanında durur. Xtream akış adresleri hesap adı ve şifreyi içerir; izleme konumları bunlar olmadan, ayrı anahtarlarla saklanır. **Ayarlar → Çıkış yap** girişi, izleme geçmişini ve önbellekleri siler; **Tüm verileri sil** her şeyi siler.
- Analitik yoktur, bize ait bir sunucu yoktur. Uygulama şunlarla konuşur: sağlayıcın (kütüphane, yayınlar, rehber); yalnızca film ve bölümlerde The Subtitle Database ve Subdl (başlık / numaralar). TMDB yalnızca anahtarla. ntfy.sh yalnızca QR eşleştirme penceresi açıkken ve yalnızca şifreli metinle.
- TV'de yazılan ya da QR ile alınan API anahtarları TV'nin `localStorage` alanında saklanır; "Tüm verileri sil" bunları da siler.

## Bilinen sınırlar

- mkv dosyasının içine gömülü altyazılar webOS web oynatıcısı tarafından sunulmaz; uygulama bunun yerine online kaynakları kullanır.
- **Dizilerde** online altyazı yalnızca Subdl'den gelir (kendi anahtarın gerekir). The Subtitle Database filmlerde kullanılır.
- Ücretsiz altyazı kaynaklarının Türkçe kapsamı, popüler yabancı filmlerde iyi, eski Türk yapımlarında zayıftır.
- Rehber yalnızca sağlayıcının verdiğini gösterir (birçok sağlayıcı yalnızca bazı kanalları doldurur). `xmltv.php` olmayan sağlayıcıda rehber yoktur.
- Masaüstü Chromium'da sahte bir Xtream sunucusuna ve gerçek bir sağlayıcıya karşı denendi. 2.1 ve sonrası sürümler **henüz gerçek bir TV'de denenmedi**; her TV modelinde davranış garanti edilmez.

## Proje yapısı

```
index.html, app.js, style.css   uygulama
appinfo.json                    webOS uygulama bildirimi (kimlik, sürüm)
config.example.js               özel ayarlar şablonu (config.js git tarafından yok sayılır)
lib/                            hls.js, JSZip, qrcode-generator ve lisans metinleri
docs/pair.html                  QR ile anahtar girişi + "anahtar nasıl alınır" yardımı için telefon sayfası (GitHub Pages ile barındır)
docs/help/img/                  bu yardımda kullanılan ekran görüntüleri
tools/build.js                  temiz paket oluşturucu
CHANGELOG.md                    her sürümde neyin değiştiği (English / Türkçe)
README.md                       bu dosyanın İngilizcesi
```

## Üçüncü taraf yazılımlar

- [hls.js](https://github.com/video-dev/hls.js) 1.7.4: Apache-2.0
- [JSZip](https://github.com/Stuk/jszip) 3.10.1: MIT ya da GPLv3 (MIT altında kullanılıyor)
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4: MIT

Lisans metinleri `lib/licenses/` içindedir; bkz. [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Yazar

**Ahmet Ziya OĞUZ**. Uygulama kodunun henüz bir lisans dosyası yok; eklenene kadar tüm haklar yazara aittir.
