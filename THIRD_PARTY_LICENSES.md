# Third-party software

oguzIPTV bundles the following libraries unmodified in `lib/`. Their license texts are included in `lib/licenses/`.

| Library | Version | License | Source |
|---|---|---|---|
| hls.js | 1.7.4 | Apache License 2.0 | https://github.com/video-dev/hls.js |
| JSZip | 3.10.1 | MIT or GPLv3 (this project uses it under the MIT license) | https://github.com/Stuk/jszip |
| qrcode-generator | 1.4.4 | MIT | https://github.com/kazuhikoarase/qrcode-generator |

- `lib/hls.min.js` is the file published on npm as `hls.js@1.7.4/dist/hls.min.js`.
- `lib/jszip.min.js` is the file published on cdnjs as `jszip/3.10.1/jszip.min.js`.

## Online services used at run time (optional)

- The Movie Database (https://www.themoviedb.org): details, cast photos, episode photos and popular lists, only when you add your own `tmdbApiKey`. This product uses the TMDB API but is not endorsed or certified by TMDB.
- ntfy (https://ntfy.sh): public message relay used only while the QR key pairing window is open; it only carries AES-GCM ciphertext.
- The Subtitle Database (https://thesubtitledb.org): free subtitle search and download, no key. Subdl (https://subdl.com): subtitle search with your own free key. Both are subject to their own terms of service. OpenSubtitles is used only if the developer puts a key in the private config.js; end users are never asked for one.
