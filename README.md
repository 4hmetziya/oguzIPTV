# oguzIPTV

A lightweight IPTV player for **LG webOS Smart TVs**. It connects to your own IPTV subscription (Xtream Codes API or an M3U playlist) and is built for the TV remote: spatial navigation, the Back button, colour keys and basic pointer support.

> **No content included.** oguzIPTV is only a player. You need your own subscription / playlist, and you are responsible for what you watch.

Plain HTML, CSS and JavaScript. No framework, no build step for the app itself.

[Türkçe özet aşağıda](#türkçe-özet)

## Features

**Library**
- Live TV, Movies and Series from an Xtream Codes server, or any M3U playlist
- Posters, ratings, duration, genre, cast and plot straight from your provider (no third-party metadata service)
- Favourites, search (waits for a short pause while you type, so the TV keyboard stays open), list or grid view
- **Continue watching** and **Recently added** per section, **watched** marks, and a series opens on the season/episode you were watching
- Hide categories you never use and pin favourites to the top (Settings → Edit categories, or the yellow key on a category)
- Turkish and English interface

**Live TV**
- **Program guide** (`xmltv.php` of your provider): "now" in the list, now/next banner, and today's full schedule (yellow key)
- **Channel list inside the player** (Left key while watching live), channel numbers (`0-9`), channel up/down, last channel (green)
- Pause and rewind within the stream buffer, with a "LIVE" / "-1:47" indicator
- **Connection quality**: signal bars in the player and a 60-second graph (blue key) of buffer, speed, stalls and dropped frames. They only read what the player already knows, no extra requests. Settings has an optional connection test (5 small requests, only when you press it).

**Player**
- HLS (hls.js) and direct files (mkv, mp4, ...)
- Audio and subtitle menu, resume prompt, auto "next episode"
- External Turkish subtitles from The Subtitle Database (no key needed) and Subdl (optional, your own key), subtitle size / colour / background in Settings

**Settings**
- Subtitle look, program guide on/off, category manager
- Account info (status, expiry date, connections)
- **API keys without editing files**: type TMDB / Subdl keys in Settings (with a "test" button), or scan a **QR code** and enter them on your phone
- **Log out** (removes login and watch history) and **erase all data**

## Quick start (development)

The app must be served over `http://` (not opened as a `file://`):

```bash
python -m http.server 8080
# open http://127.0.0.1:8080/index.html
```

Log in with your Xtream Codes server URL, user name and password (or an M3U URL).

## API keys (optional)

Online subtitles work without any key (The Subtitle Database). Subdl as an extra source and the TMDB extras need your own free API keys. They are **not** part of the repository. Three ways to set them:

1. **On the TV, Settings**: "TMDB / Subdl key" opens an input box (use the TV keyboard or the Magic Remote's voice input) and a **Test** button checks the key.
2. **With your phone (QR code)**: Settings → "Enter keys with your phone (QR code)". Scan the code, check that the 4-digit pairing code on the phone page is the same as on the TV, type the keys, press Send. The keys are encrypted on the phone (AES-256-GCM) with a secret that exists only inside the QR code, and travel through the public relay <https://ntfy.sh>, which only sees ciphertext. The TV decrypts and stores them; the code is valid for 5 minutes and works once.
3. **`config.js`** (when you build the package yourself):

```bash
cp config.example.js config.js
# edit config.js and fill in subdlApiKey (and tmdbApiKey)
```

`config.js` is in `.gitignore`. Never commit it. Keys typed on the TV win over `config.js`. Without any key the app works, only the online subtitle sources and TMDB extras are off.

### Phone page (GitHub Pages)

The page the QR code opens is `docs/pair.html`. To host your own copy: GitHub → your repository → Settings → Pages → "Deploy from a branch" → `main` / `/docs`. The address is then `https://<your-user>.github.io/<repository>/pair.html`; put it in `config.js` as `pairPageUrl` (the default points to the original author's page). The page sends nothing anywhere except the encrypted message to ntfy.sh.

The same page has a **"How to get a key"** section (TMDB v3 key and Subdl key, in Turkish and English, with screenshots from `docs/help/img/`). The steps, in short:

- **TMDB**: themoviedb.org → account → Settings → API → "+ Create" → choose "personal use only" → fill the short form → copy the **API Key (v3)**.
- **Subdl**: subdl.com → Sign Up → account → API tab → copy the key in "Default key".

Keys are personal: do not share them and do not publish screenshots that show them.

Optional: `tmdbApiKey` (a free key from <https://www.themoviedb.org>) adds cast photos, age rating, tagline, Turkish plots, episode photos and summaries, and "Popular (TMDB)" lists that only show titles your provider really has. Without a key no TMDB request is made.
This product uses the TMDB API but is not endorsed or certified by TMDB.

## Build and install on a TV

1. Install the webOS CLI and put the TV in Developer Mode: <https://webostv.developer.lge.com/develop/getting-started/developer-mode-app>
   ```bash
   npm i -g @webos-tools/cli
   ares-setup-device
   ```
2. Build a clean package (only the needed files, no README / tools / old packages):
   ```bash
   node tools/build.js              # build/app + build/out/com.oguziptv.app_<version>_all.ipk
   node tools/build.js --no-config  # same, but WITHOUT your config.js (use this for anything you share)
   node tools/build.js --folder     # only prepare build/app
   ```
3. Install and start:
   ```bash
   ares-install --device <tv-name> build/out/com.oguziptv.app_<version>_all.ipk
   ares-launch  --device <tv-name> com.oguziptv.app
   ```

A package built **with** your `config.js` contains your keys: keep that `.ipk` to yourself.

## Remote control

| Key | Where | Action |
|---|---|---|
| Arrows / OK / Back | everywhere | navigate / select / go back |
| Red | lists | search |
| Red | live player | channel list |
| Green | live player | previous channel |
| Green | lists (live) | last watched channel |
| Yellow | list (channel) | favourite |
| Yellow | category list | edit categories |
| Yellow | live player | today's program guide |
| Blue | lists | list / grid view |
| Blue | player | connection graph |
| Left | live player (at the live edge) | channel list (otherwise: rewind 10 s) |
| Right | player | forward 10 s |
| Channel +/- | live player | next / previous channel |
| 0-9 | live player | channel number (OK confirms at once) |

## Data and privacy

- Your login is stored in the TV browser's `localStorage`. Stream addresses of Xtream servers contain the account name and password; watch positions are stored under keys without them. **Settings → Log out** removes the login, the watch history and caches; **Erase all data** removes everything.
- There is no analytics and no server of ours. The app talks to: your provider (library, streams, guide), and, only for movies and episodes, The Subtitle Database and Subdl (title / ids). TMDB only with a key. ntfy.sh only while the QR pairing window is open, and only ciphertext.
- API keys typed on the TV or received by QR are stored in the TV's `localStorage`; "Erase all data" removes them.

## Known limits

- Subtitles embedded in an mkv file are not exposed by the webOS web player; the app uses the online sources instead.
- The program guide only shows what your provider delivers (many providers fill only some channels). A provider without `xmltv.php` simply has no guide.
- Tested in a desktop Chromium against a fake Xtream server and a real provider; behaviour on every TV model is not guaranteed.

## Project layout

```
index.html, app.js, style.css   the app
appinfo.json                    webOS app manifest (id, version)
config.example.js               template for private settings (config.js is ignored by git)
lib/                            hls.js, JSZip, qrcode-generator and their license texts
docs/pair.html                  phone page for the QR key entry (host with GitHub Pages)
tools/build.js                  clean package builder
```

## Third-party software

- [hls.js](https://github.com/video-dev/hls.js) 1.7.4: Apache-2.0
- [JSZip](https://github.com/Stuk/jszip) 3.10.1: MIT or GPLv3 (used under MIT)
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4: MIT

License texts are in `lib/licenses/`; see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Author

**Ahmet Ziya OĞUZ**. The application code has no license file yet; until one is added, all rights are reserved by the author.

---

## Türkçe özet

**oguzIPTV**, LG webOS TV'ler için hafif bir IPTV oynatıcısıdır. Kendi aboneliğine (Xtream Codes ya da M3U) bağlanır; kendisi içerik sunmaz.

- **Canlı TV:** program rehberi (sağlayıcının `xmltv.php` dosyasından), alt bant, günlük program listesi (sarı tuş), oynatıcıda kanal listesi (sol tuş), kanal numarasıyla geçiş (0-9), son kanal (yeşil).
- **Film / dizi:** afiş, puan, süre sunucudan; "Devam et", "Son eklenenler", izlendi işareti, dizide kaldığın bölümden devam.
- **Ayarlar:** altyazı boyutu/rengi, kategori gizleme ve sabitleme, hesap bilgisi, çıkış yap / tüm verileri sil.
- **Kurulum:** `config.example.js` dosyasını `config.js` olarak kopyala (anahtarlar isteğe bağlı, GitHub'a gitmez), sonra `node tools/build.js` ile temiz paketi oluştur ve `ares-install` ile TV'ye yükle. Paylaşacağın paket için `--no-config` kullan.
- **Gizlilik:** giriş bilgileri sadece TV'nin yerel depolamasında durur. Ayarlar → Çıkış yap ile silinir.
