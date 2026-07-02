# oguzIPTV

A lightweight, high-performance IPTV application strictly optimized for LG webOS Smart TVs. The application features a robust custom interface tailored for spatial navigation (D-pad remote control) and seamless streaming capabilities.

## 🚀 Features

*   **Dual Protocol Support:** Connect via Xtream Codes API or standard M3U playlist URLs.
*   **Custom M3U Parser:** Client-side regex engine that dynamically groups channels by `group-title`.
*   **Smart TV Navigation:** Fully optimized spatial navigation handling for D-pad remote controls.
*   **Native webOS Back Button Handling:** Custom HTML5 History API (`pushState`/`popstate`) implementation to prevent app freezing or unexpected exits when using the LG remote's back button.
*   **Advanced Video Player:**
    *   HLS stream support with robust 404/Network Error handling.
    *   OSD (On-Screen Display) for seamless Audio Track and Subtitle selection.
    *   VOD Resume functionality (Restart or Resume from the last watched position).
    *   Debounce mechanisms to prevent "Enter" key spamming and multiple stream loads.
*   **Live Search:** Instant channel filtering without reloading the DOM.

## 🛠️ Built With

*   **HTML5 & CSS3:** Flexbox-driven layout optimized for 1080p/4K TV screens.
*   **Vanilla JavaScript (ES6):** No heavy frameworks, ensuring maximum performance on low-resource TV processors.
*   **HLS.js:** For stable HTTP Live Streaming playback.

## 📺 Installation (webOS)

1. Use the webOS CLI or webOS IDE to package the app.
2. The bundled `com.oguziptv.app_1.0.1_all.ipk` (or latest version) can be installed directly onto your LG TV via Developer Mode.

## 👨‍💻 Author

**Ahmet Ziya OĞUZ**
