# Third-party software

oguzIPTV bundles the following libraries unmodified in `lib/`. Their license texts are included in `lib/licenses/`.

| Library | Version | License | Source |
|---|---|---|---|
| hls.js | 1.7.4 | Apache License 2.0 | https://github.com/video-dev/hls.js |
| JSZip | 3.10.1 | MIT or GPLv3 (this project uses it under the MIT license) | https://github.com/Stuk/jszip |

- `lib/hls.min.js` is the file published on npm as `hls.js@1.7.4/dist/hls.min.js`.
- `lib/jszip.min.js` is the file published on cdnjs as `jszip/3.10.1/jszip.min.js`.

## Online services used at run time (optional)

- Subdl (https://subdl.com) and OpenSubtitles (https://www.opensubtitles.com): subtitle search for movies and episodes. They need your own API keys and are subject to their own terms of service.
