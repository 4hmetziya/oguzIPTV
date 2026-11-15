document.addEventListener('DOMContentLoaded', function() {
    console.log('oguzIPTV initialized');

    // Global placeholder image for missing logos/posters
    const PLACEHOLDER_IMG = 'assets/placeholder.png';

    // Keep in sync with appinfo.json (tools/build.js checks it)
    const APP_VERSION = '2.0.0';

    // Private settings come from config.js (not committed; see config.example.js)
    const CONFIG = window.OGUZ_CONFIG || {};

    // External subtitle API configuration (Subdl)
    const SUBTITLE_API_KEY = CONFIG.subdlApiKey || '';

    // OpenSubtitles API configuration
    const OPEN_SUBTITLES_API_KEY = CONFIG.openSubtitlesApiKey || '';
    const APP_USER_AGENT = 'oguzIPTV_v1';

    // Track active blob URLs for cleanup
    let activeBlobUrls = [];

    // Store current series info for metadata-first subtitle fetching
    let currentSeriesInfo = null;

    // Track current episode index for next episode auto-play
    let currentEpisodeIndex = -1;
    let nextEpisodeCountdown = null;
    let nextEpisodeOverlay = null;

    // Custom OSD timeout
    let customOsdTimeout = null;

    // Mouse cursor hide timeout
    let mouseCursorTimeout = null;

    // Subtitle sync offset in seconds
    let currentSubOffset = 0;

    // Virtual scrolling state
    let virtualChannels = [];
    let virtualStartIndex = 0;
    let virtualEndIndex = 0;
    let virtualBufferSize = 10;
    const MAX_VISIBLE_ITEMS = 40;

    // ---- Movie metadata from the Xtream server itself (get_vod_info); no third-party services ----
    const VOD_META_KEY = 'vodMetaCache';
    const VOD_META_MAX = 150;

    function readVodMetaCache() {
        try { return JSON.parse(localStorage.getItem(VOD_META_KEY)) || {}; } catch (e) { return {}; }
    }

    function writeVodMeta(vodId, meta) {
        const cache = readVodMetaCache();
        delete cache[vodId];
        cache[vodId] = meta; // newest last
        const keys = Object.keys(cache);
        while (keys.length > VOD_META_MAX) delete cache[keys.shift()];
        try { localStorage.setItem(VOD_META_KEY, JSON.stringify(cache)); } catch (e) { /* quota: ignore */ }
    }

    // tmdb ids the server sent with get_vod_info, by vod id (used to find exact subtitles)
    const vodTmdbIds = {};
    function getMovieTmdbId(item) {
        if (!item || item.id == null || !currentStreamUrl || currentStreamUrl.indexOf('/movie/') === -1) return null;
        return vodTmdbIds[item.id] || null;
    }

    function formatDuration(secs) {
        const total = parseInt(secs, 10);
        if (!total || total < 60) return '';
        const h = Math.floor(total / 3600);
        const m = Math.round((total % 3600) / 60);
        return h ? h + ' sa ' + m + ' dk' : m + ' dk';
    }

    // Returns {poster, rating, duration, plot, year, genres[], backdrop, cast[], director} or null.
    // Which fields are filled depends on what the provider sends (plot/genre/cast are often empty).
    async function fetchMovieMeta(vodId) {
        const cached = readVodMetaCache()[vodId];
        if (cached && cached.tmdbId !== undefined) { // entries from older app versions lack tmdbId: refetch them
            if (cached.tmdbId) vodTmdbIds[vodId] = cached.tmdbId;
            return cached;
        }

        const serverUrl = localStorage.getItem('xtream_server');
        const username = localStorage.getItem('xtream_username');
        const password = localStorage.getItem('xtream_password');
        if (!serverUrl || !username || !password) return null;

        let info = null;
        try {
            const response = await fetch(serverUrl + '/player_api.php?username=' + username + '&password=' + password + '&action=get_vod_info&vod_id=' + vodId);
            if (response.ok) {
                const data = await response.json();
                info = (data && data.info && !Array.isArray(data.info)) ? data.info : null;
            }
        } catch (error) {
            console.log('get_vod_info error:', error);
        }
        if (!info) return null;

        const serverRating = parseFloat(info.rating);
        const meta = {
            poster: info.cover_big || info.movie_image || null,
            rating: serverRating > 0 ? serverRating.toFixed(1) : null,
            duration: formatDuration(info.duration_secs),
            tmdbId: parseInt(info.tmdb_id, 10) || null,
            plot: info.plot || info.description || null,
            year: info.releasedate || info.release_date ? String(info.releasedate || info.release_date).substring(0, 4) : null,
            genres: info.genre ? String(info.genre).split(/[,\/]/).map(s => s.trim()).filter(Boolean).slice(0, 3) : [],
            backdrop: Array.isArray(info.backdrop_path) ? (info.backdrop_path[0] || null) : (info.backdrop_path || null),
            cast: [],
            director: null
        };

        if (meta.tmdbId) vodTmdbIds[vodId] = meta.tmdbId;
        writeVodMeta(vodId, meta);
        return meta;
    }

    // Title parsing utility for IPTV stream names
    function parseStreamTitle(streamName) {
        if (!streamName) return { title: null, season: null, episode: null, year: null };

        let year = null;
        let season = null;
        let episode = null;

        const yearMatch = streamName.match(/(?:\(|\[)?(\d{4})(?:\)|\])?$/);
        if (yearMatch) {
            year = parseInt(yearMatch[1]);
        }
        const seasonEpisodePatterns = [
            /(?:S|Sezon|Season)\s*(\d+)\s*(?:E|Episode|Bölüm)\s*(\d+)/i,
            /(\d+)\s*[xX]\s*(\d+)/,
            /(?:Season)\s*(\d+)\s*(?:Episode)\s*(\d+)/i,
            /(?:Sezon)\s*(\d+)\s*(?:Bölüm)\s*(\d+)/i,
        ];

        for (const pattern of seasonEpisodePatterns) {
            const match = streamName.match(pattern);
            if (match) {
                season = parseInt(match[1]);
                episode = parseInt(match[2]);
                break;
            }
        }

        let title = streamName
            .replace(/^(TR|EN|DE|FR|ES|IT|RU|AR)\s*[\|\-\:\.]\s*/i, '')
            .replace(/\s*[\|\-\:\.]\s*(TR|EN|DE|FR|ES|IT|RU|AR)$/i, '')
            .replace(/\[(HD|FHD|4K|UHD|SD|1080p|720p|480p)\]/gi, '')
            .replace(/\((HD|FHD|4K|UHD|SD|1080p|720p|480p)\)/gi, '')
            .replace(/\s*[\|\-\:]\s*(HD|FHD|4K|UHD|SD|1080p|720p|480p)$/i, '')
            .replace(/[\|\-\:\•\·\●\○\◆\◇\◈\◉\◊\○\●\◐\◑\◒\◓\◔\◕\◖\◗\◘\◙\◚\◛\◜\◝\◞\◟\◠\◡\◢\◣\◤\◥\◦\◧\◨\◩\◪\◫\◬\◭\◮\◯\◰\◱\◲\◳\◴\◵\◶\◷\◸\◹\◺\◻\◼\◽\◾\◿]/g, ' ')
            .replace(/(?:S|Sezon|Season)\s*\d+/gi, '')
            .replace(/(?:E|Episode|Bölüm)\s*\d+/gi, '')
            .replace(/\d+\s*[xX]\s*\d+/g, '')
            .replace(/\s*(?:\(|\[)?\d{4}(?:\)|\])?$/g, '')
            .replace(/\s+/g, ' ')
            .replace(/^[\s\-\|:]+|[\s\-\|:]+$/g, '')
            .trim();

        return { title, season, episode, year };
    }

    // DOM elements
    const tabXtream = document.getElementById('tab-xtream');
    const tabM3u = document.getElementById('tab-m3u');
    const xtreamSection = document.getElementById('xtream-section');
    const m3uSection = document.getElementById('m3u-section');
    const connectBtn = document.getElementById('connect-btn');
    const loginContainer = document.getElementById('login-container');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const channelList = document.getElementById('channel-list');
    const videoPlayer = document.getElementById('video-player');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessage = document.getElementById('error-message');
    const navLive = document.getElementById('nav-live');
    const navMovies = document.getElementById('nav-movies');
    const navSeries = document.getElementById('nav-series');
    const navSearch = document.getElementById('nav-search');
    const searchContainer = document.getElementById('search-container');
    const searchInput = document.getElementById('search-input');
    const playerOsd = document.getElementById('player-osd');
    const audioTracksList = document.getElementById('audio-tracks-list');
    const subtitleTracksList = document.getElementById('subtitle-tracks-list');
    const resumeModal = document.getElementById('resume-modal');
    const resumeTimeSpan = document.getElementById('resume-time');
    const btnResume = document.getElementById('btn-resume');
    const btnRestart = document.getElementById('btn-restart');
    const osdCloseBtn = document.getElementById('osd-close');
    const langToggleBtn = document.getElementById('lang-toggle');
    const navSettings = document.getElementById('nav-settings');
    const vodDetailsModal = document.getElementById('vod-details-modal');
    const vodModalBackdrop = document.querySelector('.vod-modal-backdrop');
    const vodPoster = document.getElementById('vod-poster');
    const vodTitle = document.getElementById('vod-title');
    const vodYear = document.getElementById('vod-year');
    const vodRating = document.getElementById('vod-rating');
    const vodPlot = document.getElementById('vod-plot');
    const vodDuration = document.getElementById('vod-duration');
    const vodGenres = document.getElementById('vod-genres');
    const vodCredits = document.getElementById('vod-credits');
    let vodMetaToken = 0; // guards against late responses after the modal was reopened for another title

    // Hide the "Özet" label while the plot is empty (providers often send no plot)
    const plotLabel = document.querySelector('.plot-label');
    if (plotLabel && vodPlot && typeof MutationObserver !== 'undefined') {
        const syncPlotLabel = () => { plotLabel.style.display = vodPlot.textContent.trim() ? '' : 'none'; };
        new MutationObserver(syncPlotLabel).observe(vodPlot, { childList: true, characterData: true, subtree: true });
        syncPlotLabel();
    }
    const modalEpisodesContainer = document.getElementById('modal-episodes-container');
    const modalEpisodesSlider = document.getElementById('modal-episodes-slider');
    const vodPlayBtn = document.getElementById('vod-play-btn');
    const vodCloseBtn = document.getElementById('vod-close-btn');

    // Translations dictionary
    const translations = {
        tr: {
            'nav-live': 'Canlı TV',
            'nav-movies': 'Filmler',
            'nav-series': 'Diziler',
            'nav-search': 'Ara',
            'tab-xtream': 'Xtream Codes',
            'tab-m3u': 'M3U URL',

            'label-server-url': 'Sunucu URL',
            'label-username': 'Kullanıcı Adı',
            'label-password': 'Şifre',
            'label-playlist-url': 'Oynatma Listesi URL',

            'placeholder-server-url': 'http://ornek.com',
            'placeholder-username': 'Kullanıcı adı girin',
            'placeholder-password': 'Şifre girin',
            'placeholder-playlist-url': 'http://ornek.com/playlist.m3u',
            'placeholder-search': 'Ara...',

            'btn-connect': 'Bağlan',
            'loading-text': 'Yükleniyor...',

            'osd-audio-tracks': 'Ses Parçaları',
            'osd-subtitles': 'Altyazılar',
            'osd-close': 'Kapat',
            'osd-off': 'Kapalı',

            'modal-resume-title': 'Oynatmaya Devam Edilsin mi?',
            'modal-resume-text': 'İzlemeyi şu noktada bıraktınız: ',
            'btn-resume': 'Devam Et',
            'btn-restart': 'Baştan Başla',

            'lang-toggle': 'Dil: TR',
            'category-favorites': 'Favoriler',
            'nav-settings': 'Ayarlar',
            'category-continue': 'Devam Et',
            'category-recent': 'Son Eklenenler',
            'settings-title': 'Ayarlar',
            'no-favorites': 'Henüz favori kanal eklemediniz',
            'add-to-favorites': 'Favorilere Ekle',
            'remove-from-favorites': 'Favorilerden Çıkar',
            'view-list': 'Görünüm: Liste',
            'view-grid': 'Görünüm: Izgara'
        },
        en: {
            'nav-live': 'Live TV',
            'nav-movies': 'Movies',
            'nav-series': 'Series',
            'nav-search': 'Search',
            'tab-xtream': 'Xtream Codes',
            'tab-m3u': 'M3U URL',

            'label-server-url': 'Server URL',
            'label-username': 'Username',
            'label-password': 'Password',
            'label-playlist-url': 'Playlist URL',

            'placeholder-server-url': 'http://example.com',
            'placeholder-username': 'Enter username',
            'placeholder-password': 'Enter password',
            'placeholder-playlist-url': 'http://example.com/playlist.m3u',
            'placeholder-search': 'Search...',

            'btn-connect': 'Connect',
            'loading-text': 'Loading...',

            'osd-audio-tracks': 'Audio Tracks',
            'osd-subtitles': 'Subtitles',
            'osd-close': 'Close',
            'osd-off': 'Off',

            'modal-resume-title': 'Resume Playback?',
            'modal-resume-text': 'You stopped watching at ',
            'btn-resume': 'Resume',
            'btn-restart': 'Start Over',

            'vod-play': 'Play',
            'vod-close': 'Close',

            'lang-toggle': 'Language: EN',
            'category-favorites': 'Favorites',
            'nav-settings': 'Settings',
            'category-continue': 'Continue Watching',
            'category-recent': 'Recently Added',
            'settings-title': 'Settings',
            'no-favorites': 'No favorite channels added yet',
            'add-to-favorites': 'Add to Favorites',
            'remove-from-favorites': 'Remove from Favorites',
            'view-list': 'View: List',
            'view-grid': 'View: Grid'
        }
    };

    // Current language state
    let currentLang = localStorage.getItem('appLang') || 'tr';

    // View mode state
    let viewMode = localStorage.getItem('viewMode') || 'list'; // 'list' or 'grid'

    // Toggle view mode function
    function toggleViewMode() {
        viewMode = viewMode === 'list' ? 'grid' : 'list';
        localStorage.setItem('viewMode', viewMode);
        updateViewModeUI();

        // Re-render current channels with new structure
        setTimeout(() => {
            if (isSearchActive && searchInput) {
                handleSearchInput({ target: searchInput }); // keep showing the search results
            } else if (activeCategoryId === 'favorites' || (typeof activeCategoryId === 'string' && activeCategoryId === 'favorites')) {
                showFavoritesChannels();
            } else if (connectionType === 'm3u') {
                // Re-render M3U channels
                const activeCategory = document.querySelector('.category-item.active');
                if (activeCategory) {
                    selectM3UCategory(activeCategory);
                }
            } else {
                // Re-render Xtream channels
                const activeCategory = document.querySelector('.category-item.active');
                if (activeCategory) {
                    selectCategory(activeCategory);
                }
            }
        }, 100);
    }

    // Update view mode UI
    function updateViewModeUI() {
        const viewToggleBtn = document.getElementById('view-toggle');
        const channelList = document.getElementById('channel-list');

        if (viewToggleBtn) {
            viewToggleBtn.setAttribute('data-i18n', viewMode === 'list' ? 'view-list' : 'view-grid');
            viewToggleBtn.textContent = translations[currentLang][viewMode === 'list' ? 'view-list' : 'view-grid'];
        }

        if (channelList) {
            if (viewMode === 'grid') {
                channelList.classList.add('grid-view');
            } else {
                channelList.classList.remove('grid-view');
            }
        }
    }

    // Update translations function
    function updateTranslations() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[currentLang] && translations[currentLang][key]) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = translations[currentLang][key];
                } else {
                    el.innerText = translations[currentLang][key];
                }
            }
        });

        // Update language toggle button text
        const langToggle = document.getElementById('lang-toggle');
        if (langToggle) {
            langToggle.textContent = translations[currentLang]['lang-toggle'];
        }

        // Update view toggle button text
        updateViewModeUI();
        updateColorHints();
    }

    // Toggle language function
    function toggleLanguage() {
        currentLang = currentLang === 'tr' ? 'en' : 'tr';
        localStorage.setItem('appLang', currentLang);
        updateTranslations();
    }

    function saveFavorites() {
        localStorage.setItem('favorites', JSON.stringify(favorites));
    }

    function isFavorite(channelId) {
        return favorites.includes(channelId);
    }

    function toggleFavorite(channelId) {
        const index = favorites.indexOf(channelId);

        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(channelId);
        }

        saveFavorites();
        return index === -1;
    }

    // Input fields
    const serverUrlInput = document.getElementById('server-url');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const playlistUrlInput = document.getElementById('playlist-url');
    
    // HLS instance
    let hls = null;
    let lastFocusedChannel = null;
    let activeZone = 'sidebar'; // 'sidebar', 'channels', 'topnav', 'osd', 'search', or 'resume-modal'
    let activeCategoryId = null;
    let currentContentType = 'live'; // 'live', 'movies', or 'series'
    let connectionType = 'xtream'; // 'xtream' or 'm3u'
    let m3uChannelsByCategory = {}; // Store M3U channels grouped by category
    let osdFocusedColumn = 'audio'; // 'audio', 'subtitle', or 'close'
    let osdFocusedIndex = 0;
    let allStreamsCache = []; // Cache for search functionality
    let isSearchActive = false; // Search mode state
    let pendingResumeTime = 0; // Store pending resume time for modal
    let currentStreamUrl = ''; // Track current stream URL for progress saving
    let isTransitionInProgress = false; // Prevent spam/freeze on Enter key
    let isProgrammaticHashChange = false; // Flag to distinguish programmatic hash changes from back button
    let isEnteringPlayer = false; // Flag to prevent popstate conflict when entering player
    let playbackActive = false;   // true from the moment a stream is started until the player is closed
    let favorites = JSON.parse(localStorage.getItem('favorites')) || []; // Global favorites array

    // Initialize webOS history state for back button handling
    history.pushState({'page': 'main'}, 'main', location.href);

    // Cleanup old progress records to prevent localStorage quota overflow
    cleanupOldProgress();

    // Load saved credentials from localStorage
    loadCredentials();

    // Hash-based state restoration on startup
    const xtreamServer = localStorage.getItem('xtream_server');
    const xtreamUsername = localStorage.getItem('xtream_username');
    const xtreamPassword = localStorage.getItem('xtream_password');
    const currentHash = window.location.hash;

    if (!xtreamServer || !xtreamUsername || !xtreamPassword) {
        // No credentials, show login
        window.location.hash = '#login';
    } else if (currentHash === '#channels') {
        loadCredentials();
        switchTab('xtream');
        fetchCategories(xtreamServer, xtreamUsername, xtreamPassword);
    } else if (currentHash === '#player') {
        const savedUrl = localStorage.getItem('currentStreamUrl');
        if (savedUrl) {
            loadCredentials();
            playStream(savedUrl);
        } else {
            window.location.hash = '#channels';
            loadCredentials();
            switchTab('xtream');
            fetchCategories(xtreamServer, xtreamUsername, xtreamPassword);
        }
    } else {
        // Default: show login with loaded credentials (no auto-connect)
        loadCredentials();
        window.location.hash = '#login';
    }
    
    tabXtream.addEventListener('click', () => switchTab('xtream'));
    tabM3u.addEventListener('click', () => switchTab('m3u'));

    // Top navigation button handlers
    navLive.addEventListener('click', () => switchContentType('live'));
    navMovies.addEventListener('click', () => switchContentType('movies'));
    navSeries.addEventListener('click', () => switchContentType('series'));

    function switchContentType(type) {
        if (currentContentType === type) return; // Do nothing if already on the same tab

        currentContentType = type;

        // Update active button styling
        navLive.classList.remove('active');
        navMovies.classList.remove('active');
        navSeries.classList.remove('active');

        if (type === 'live') {
            navLive.classList.add('active');
        } else if (type === 'movies') {
            navMovies.classList.add('active');
        } else if (type === 'series') {
            navSeries.classList.add('active');
        }

        // Clear sidebar and channel list
        sidebar.innerHTML = '';
        channelList.innerHTML = '';
        activeCategoryId = null;

        // Fetch categories for the new content type
        const xtreamServer = localStorage.getItem('xtream_server');
        const xtreamUsername = localStorage.getItem('xtream_username');
        const xtreamPassword = localStorage.getItem('xtream_password');

        if (xtreamServer && xtreamUsername && xtreamPassword) {
            fetchCategories(xtreamServer, xtreamUsername, xtreamPassword);
        }
    }

    // Connect button handler
    connectBtn.addEventListener('click', handleConnect);

    // Search button handler
    navSearch.addEventListener('click', activateSearch);

    // Search input live filtering
    // Search as you type, but wait for a short pause: on the TV every key of the on-screen keyboard fires an input event,
    // and re-drawing the (up to 200) results after each key was slow and used to pull the focus away, closing the keyboard.
    let searchTimer = null;
    searchInput.addEventListener('input', function(e) {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => handleSearchInput(e), 400);
    });

    // Resume modal button click handlers
    btnResume.addEventListener('click', function(e) {
        e.preventDefault();
        videoPlayer.currentTime = pendingResumeTime;
        videoPlayer.play().catch(err => console.log('Play interrupted:', err));
        resumeModal.style.display = 'none';

        // Arayüzü manuel olarak gizle ve oynatıcıyı zorla göster
        const videoContainer = document.getElementById('video-container');
        const mainContent = document.getElementById('main-content');
        const header = document.querySelector('header');
        const main = document.querySelector('main');

        if (videoContainer) videoContainer.style.display = 'block';
        if (mainContent) mainContent.style.display = 'none';
        if (header) header.style.display = 'none';
        if (main) main.style.display = 'none';

        // Oynatıcı alanına odaklan
        activeZone = 'player';
        videoPlayer.focus();

        isEnteringPlayer = true;
        window.location.hash = '#player';
        setTimeout(() => isEnteringPlayer = false, 300);
    });

    btnRestart.addEventListener('click', function(e) {
        e.preventDefault();
        videoPlayer.currentTime = 0;
        videoPlayer.play().catch(err => console.log('Play interrupted:', err));
        resumeModal.style.display = 'none';

        // Arayüzü manuel olarak gizle ve oynatıcıyı zorla göster
        const videoContainer = document.getElementById('video-container');
        const mainContent = document.getElementById('main-content');
        const header = document.querySelector('header');
        const main = document.querySelector('main');

        if (videoContainer) videoContainer.style.display = 'block';
        if (mainContent) mainContent.style.display = 'none';
        if (header) header.style.display = 'none';
        if (main) main.style.display = 'none';

        // Oynatıcı alanına odaklan
        activeZone = 'player';
        videoPlayer.focus();

        isEnteringPlayer = true;
        window.location.hash = '#player';
        setTimeout(() => isEnteringPlayer = false, 300);
    });

    // OSD close button handler
    osdCloseBtn.addEventListener('click', function() {
        hideOSD();
        activeZone = 'player';
    });

    // Language toggle button handler
    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', function() {
            toggleLanguage();
        });
    }

    // View toggle button handler
    const viewToggleBtn = document.getElementById('view-toggle');
    if (viewToggleBtn) {
        viewToggleBtn.addEventListener('click', function() {
            toggleViewMode();
        });
    }

    // ---- Remote control: color keys, channel up/down, last channel ----
    let currentLiveChannel = null;   // channel playing now or watched last
    let previousLiveChannel = null;  // the one before it

    function isLiveStreamUrl(url) {
        return !!url && (url.includes('/live/') || url.includes('.m3u8'));
    }

    function playLiveChannel(channel) {
        if (!channel || !channel.url) return;
        playStream(channel.url, channel.item || null, null);
    }

    // Step to the next / previous channel of the list that is currently shown
    function stepLiveChannel(direction) {
        const items = Array.from(channelList.querySelectorAll('.channel-item')).filter(el => el.dataset.url);
        if (items.length === 0) return;
        let index = items.findIndex(el => el.dataset.url === currentStreamUrl);
        index = index === -1 ? 0 : (index + direction + items.length) % items.length;
        playChannel(items[index]);
        showSkipIndicator((items[index].querySelector('.channel-name') || { textContent: '' }).textContent);
    }

    // Returns true when the key was handled
    function handleColorKeys(e, keyCode) {
        const inPlayer = activeZone === 'player' || activeZone === 'custom-osd';
        if (inPlayer && isLiveStreamUrl(currentStreamUrl)) {
            const digit = digitFromKey(e, keyCode);
            if (digit !== null) {                                     // 0-9: jump to a channel number
                addNumberDigit(digit);
                e.preventDefault();
                return true;
            }
            if (numberBuffer && keyCode === 13) {                     // OK confirms the typed number at once
                commitNumber();
                e.preventDefault();
                return true;
            }
            if (keyCode === 403) {                                    // red: channel list
                openChannelPanel();
                e.preventDefault();
                return true;
            }
            if (keyCode === 404 && previousLiveChannel) {            // green: previous channel
                const target = previousLiveChannel;
                previousLiveChannel = currentLiveChannel;
                playLiveChannel(target);
                e.preventDefault();
                return true;
            }
            if (keyCode === 405) {                                    // yellow: today's program list
                openGuide();
                e.preventDefault();
                return true;
            }
            if (keyCode === 427 || keyCode === 33) {                  // channel up
                stepLiveChannel(1);
                e.preventDefault();
                return true;
            }
            if (keyCode === 428 || keyCode === 34) {                  // channel down
                stepLiveChannel(-1);
                e.preventDefault();
                return true;
            }
            return false;
        }
        const inLists = (activeZone === 'channels' || activeZone === 'sidebar' || activeZone === 'topnav') &&
            loginContainer.style.display === 'none' && mainContent.style.display !== 'none' &&
            vodDetailsModal.style.display !== 'block' && resumeModal.style.display !== 'flex';
        if (!inLists) return false;
        if (keyCode === 403) {                                        // red: search
            navSearch.click();
            e.preventDefault();
            return true;
        }
        if (keyCode === 404 && currentContentType === 'live' && currentLiveChannel) { // green: last watched channel
            playLiveChannel(currentLiveChannel);
            e.preventDefault();
            return true;
        }
        if (keyCode === 405 && activeZone === 'sidebar' && connectionType === 'xtream') { // yellow on a category: edit categories
            openCategoryManager();
            e.preventDefault();
            return true;
        }
        if (keyCode === 406 && viewToggleBtn) {                       // blue: list / grid
            viewToggleBtn.click();
            e.preventDefault();
            return true;
        }
        return false;
    }

    function updateColorHints() {
        const bar = document.getElementById('color-hints');
        if (!bar) return;
        const items = [['#e53935', tx('Ara', 'Search')], ['#43a047', tx('Son kanal', 'Last channel')], ['#fdd835', tx('Favori', 'Favorite')], ['#1e88e5', tx('Görünüm', 'View')]];
        bar.innerHTML = '';
        items.forEach(([color, text]) => {
            const span = document.createElement('span');
            const dot = document.createElement('i');
            dot.style.background = color;
            span.appendChild(dot);
            span.appendChild(document.createTextNode(text));
            bar.appendChild(span);
        });
    }

    // ---- Category manager: hide categories you never use, pin favourite ones to the top ----
    const CATEGORY_PREFS_KEY = 'categoryPrefs';
    const lastCategories = {};   // content type -> categories as the server sent them
    let categoryPrefs = { hidden: { live: [], movies: [], series: [] }, pinned: { live: [], movies: [], series: [] } };
    try {
        const savedPrefs = JSON.parse(localStorage.getItem(CATEGORY_PREFS_KEY));
        if (savedPrefs && savedPrefs.hidden && savedPrefs.pinned) categoryPrefs = savedPrefs;
        ['live', 'movies', 'series'].forEach(t => {
            categoryPrefs.hidden[t] = categoryPrefs.hidden[t] || [];
            categoryPrefs.pinned[t] = categoryPrefs.pinned[t] || [];
        });
    } catch (e) { /* ignore corrupt prefs */ }

    function saveCategoryPrefs() {
        try { localStorage.setItem(CATEGORY_PREFS_KEY, JSON.stringify(categoryPrefs)); } catch (e) { /* quota */ }
    }

    // pinned first (in the order they were pinned), hidden ones removed
    function visibleCategories(categories, type) {
        const hidden = categoryPrefs.hidden[type] || [];
        const pinned = categoryPrefs.pinned[type] || [];
        const shown = categories.filter(c => hidden.indexOf(String(c.category_id)) === -1);
        const top = pinned.map(id => shown.find(c => String(c.category_id) === id)).filter(Boolean);
        return top.concat(shown.filter(c => pinned.indexOf(String(c.category_id)) === -1));
    }

    const catManager = document.getElementById('cat-manager');
    const catManagerList = document.getElementById('cat-manager-list');
    let catRows = [];
    let catIndex = 0;
    let catManagerType = 'live';

    function typeTitle(type) {
        return type === 'movies' ? tx('Filmler', 'Movies') : (type === 'series' ? tx('Diziler', 'Series') : tx('Canlı TV', 'Live TV'));
    }

    function renderCategoryManager() {
        const categories = lastCategories[catManagerType] || [];
        const hidden = categoryPrefs.hidden[catManagerType];
        const pinned = categoryPrefs.pinned[catManagerType];
        document.getElementById('cat-manager-title').textContent = tx('Kategorileri düzenle', 'Edit categories') + ' · ' + typeTitle(catManagerType);
        // pinned first so what you see matches the sidebar
        const ordered = pinned.map(id => categories.find(c => String(c.category_id) === id)).filter(Boolean)
            .concat(categories.filter(c => pinned.indexOf(String(c.category_id)) === -1));
        catManagerList.innerHTML = '';
        catRows = [];
        ordered.forEach(cat => {
            const id = String(cat.category_id);
            const row = document.createElement('div');
            row.className = 'settings-row cat-row' + (hidden.indexOf(id) !== -1 ? ' is-hidden' : '');
            const label = document.createElement('span');
            label.textContent = (pinned.indexOf(id) !== -1 ? '★ ' : '') + cat.category_name;
            const value = document.createElement('span');
            value.className = 'settings-value';
            value.textContent = hidden.indexOf(id) !== -1 ? tx('Gizli', 'Hidden') : tx('Görünür', 'Visible');
            row.appendChild(label);
            row.appendChild(value);
            row.addEventListener('click', () => { catIndex = catRows.findIndex(r => r.id === id); toggleCategoryHidden(); });
            catManagerList.appendChild(row);
            catRows.push({ el: row, id: id });
        });
        if (catRows.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'settings-account';
            empty.textContent = tx('Kategori listesi henüz yüklenmedi.', 'The category list is not loaded yet.');
            catManagerList.appendChild(empty);
        }
        catIndex = Math.min(catIndex, Math.max(0, catRows.length - 1));
        markCategoryRow();
    }

    function markCategoryRow() {
        catRows.forEach((r, i) => r.el.classList.toggle('focused', i === catIndex));
        const row = catRows[catIndex];
        if (row && row.el.scrollIntoView) row.el.scrollIntoView({ block: 'nearest' });
    }

    function toggleCategoryHidden() {
        const row = catRows[catIndex];
        if (!row) return;
        const hidden = categoryPrefs.hidden[catManagerType];
        const at = hidden.indexOf(row.id);
        if (at === -1) hidden.push(row.id); else hidden.splice(at, 1);
        saveCategoryPrefs();
        renderCategoryManager();
    }

    function toggleCategoryPinned() {
        const row = catRows[catIndex];
        if (!row) return;
        const pinned = categoryPrefs.pinned[catManagerType];
        const at = pinned.indexOf(row.id);
        if (at === -1) pinned.push(row.id); else pinned.splice(at, 1);
        saveCategoryPrefs();
        renderCategoryManager();
        const moved = catRows.findIndex(r => r.id === row.id);
        if (moved >= 0) { catIndex = moved; markCategoryRow(); }
    }

    function openCategoryManager() {
        if (connectionType === 'm3u' || !catManager) return;
        catManagerType = currentContentType;
        catIndex = 0;
        renderCategoryManager();
        catManager.style.display = 'flex';
        activeZone = 'catmgr';
    }

    function closeCategoryManager() {
        catManager.style.display = 'none';
        activeZone = 'sidebar';
        // redraw the sidebar with the new choices, without reloading the channels
        if (lastCategories[currentContentType]) showCategories(lastCategories[currentContentType], true);
    }

    function handleCategoryManagerKey(e, key, keyCode, isEnterKey) {
        if (key === 'ArrowDown' || keyCode === 40) {
            catIndex = Math.min(catRows.length - 1, catIndex + 1);
            markCategoryRow();
        } else if (key === 'ArrowUp' || keyCode === 38) {
            catIndex = Math.max(0, catIndex - 1);
            markCategoryRow();
        } else if (key === 'Enter' || isEnterKey) {
            toggleCategoryHidden();
        } else if (key === 'ArrowRight' || keyCode === 39) {
            toggleCategoryPinned();
        } else if (key === 'Escape' || key === 'Backspace' || key === 'ArrowLeft' || keyCode === 27 || keyCode === 461 || keyCode === 10009 || keyCode === 37) {
            closeCategoryManager();
        } else {
            return;
        }
        e.preventDefault();
    }

    // ---- Settings: subtitle look, account info ----
    const SETTINGS_KEY = 'oguzSettings';
    const tx = (tr, en) => (currentLang === 'en' ? en : tr);
    const settingDefs = [
        { key: 'subSize', label: () => tx('Altyazı boyutu', 'Subtitle size'), options: [
            { label: () => tx('Küçük', 'Small'), css: '3vh' },
            { label: () => tx('Orta', 'Medium'), css: '4vh' },
            { label: () => tx('Büyük', 'Large'), css: '5.2vh' },
            { label: () => tx('Çok büyük', 'Extra large'), css: '6.5vh' } ] },
        { key: 'subColor', label: () => tx('Altyazı rengi', 'Subtitle color'), options: [
            { label: () => tx('Beyaz', 'White'), css: '#ffffff' },
            { label: () => tx('Sarı', 'Yellow'), css: '#ffeb3b' },
            { label: () => tx('Camgöbeği', 'Cyan'), css: '#7fe9ff' } ] },
        { key: 'subBg', label: () => tx('Altyazı arka planı', 'Subtitle background'), options: [
            { label: () => tx('Yok', 'None'), css: 'transparent' },
            { label: () => tx('Yarı saydam', 'Semi-transparent'), css: 'rgba(0,0,0,0.6)' },
            { label: () => tx('Siyah', 'Black'), css: '#000000' } ] },
        { key: 'epg', label: () => tx('Program rehberi', 'Program guide'), options: [
            { label: () => tx('Açık', 'On') },
            { label: () => tx('Kapalı', 'Off') } ] }
    ];
    // ---- Log out / wipe data ----
    // keys that hold the login or contain stream addresses (those contain the account name and password)
    const SESSION_KEYS = ['xtream_server', 'xtream_username', 'xtream_password', 'm3u_playlist', 'currentStreamUrl',
        'activeCategoryId', 'selectedChannelIndex', 'epgCache2', 'vodMetaCache', 'continueWatching', 'watchedIds', 'lastEpisodes'];

    function clearSessionData() {
        SESSION_KEYS.forEach(k => localStorage.removeItem(k));
        Object.keys(localStorage).forEach(k => { if (k.indexOf('progress_') === 0) localStorage.removeItem(k); });
    }

    function clearAllData() {
        localStorage.clear();
        try { sessionStorage.clear(); } catch (e) { /* ignore */ }
    }

    function leaveToLogin() {
        window.location.hash = '#login';
        window.location.reload();
    }

    // rows without a value: they run something when OK is pressed
    const settingActions = [
        { label: () => tx('Kategorileri düzenle…', 'Edit categories…'), show: () => connectionType !== 'm3u',
          run: () => { closeSettings(); openCategoryManager(); } },
        { label: () => tx('Çıkış yap (giriş bilgilerini ve izleme kayıtlarını sil)', 'Log out (remove login and watch history)'), show: () => true, confirm: true,
          run: () => { clearSessionData(); leaveToLogin(); } },
        { label: () => tx('Tüm verileri sil (ayarlar, favoriler dahil)', 'Erase all data (settings and favourites too)'), show: () => true, confirm: true,
          run: () => { clearAllData(); leaveToLogin(); } }
    ];
    let settingsConfirm = -1; // index of the action that waits for a second OK
    const settings = { subSize: 1, subColor: 0, subBg: 1, epg: 0 };
    try {
        const savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
        settingDefs.forEach(def => {
            const v = savedSettings[def.key];
            if (Number.isInteger(v) && v >= 0 && v < def.options.length) settings[def.key] = v;
        });
    } catch (e) { /* ignore corrupt settings */ }

    function saveSettings() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    function subtitleStyleValues() {
        return {
            size: settingDefs[0].options[settings.subSize].css,
            color: settingDefs[1].options[settings.subColor].css,
            bg: settingDefs[2].options[settings.subBg].css
        };
    }

    function applySubtitleStyle() {
        const v = subtitleStyleValues();
        let styleEl = document.getElementById('subtitle-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'subtitle-style';
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = '#video-player::cue{font-size:' + v.size + ';color:' + v.color + ';background-color:' + v.bg +
            ';text-shadow:0 0 4px #000,0 0 4px #000,0 0 2px #000;}';
    }
    applySubtitleStyle();

    const settingsModal = document.getElementById('settings-modal');
    const settingsRowsEl = document.getElementById('settings-rows');
    const settingsPreview = document.getElementById('settings-preview');
    const settingsAccount = document.getElementById('settings-account');
    let settingsFocus = 0;
    let accountInfoCache = null;

    function renderSettings() {
        document.getElementById('settings-title').textContent = tx('Ayarlar', 'Settings');
        settingsRowsEl.innerHTML = '';
        const actions = settingActions.filter(a => a.show());
        const rowCount = settingDefs.length + actions.length + 1; // + close row
        for (let i = 0; i < rowCount; i++) {
            const row = document.createElement('div');
            row.className = 'settings-row' + (i === settingsFocus ? ' focused' : '');
            const label = document.createElement('span');
            const value = document.createElement('span');
            value.className = 'settings-value';
            if (i < settingDefs.length) {
                const def = settingDefs[i];
                label.textContent = def.label();
                value.textContent = '‹  ' + def.options[settings[def.key]].label() + '  ›';
                row.addEventListener('click', () => { settingsFocus = i; changeSetting(i, 1); });
            } else if (i < settingDefs.length + actions.length) {
                const action = actions[i - settingDefs.length];
                const confirming = action.confirm && settingsConfirm === i - settingDefs.length;
                label.textContent = confirming ? tx('Emin misin?  Tamam: evet  ·  Geri: vazgeç', 'Are you sure?  OK: yes  ·  Back: cancel') : action.label();
                if (confirming) label.style.color = '#ff8a80';
                row.addEventListener('click', () => runSettingsAction(action, i - settingDefs.length));
            } else {
                label.textContent = tx('Kapat', 'Close');
                row.addEventListener('click', closeSettings);
            }
            row.appendChild(label);
            row.appendChild(value);
            settingsRowsEl.appendChild(row);
        }
        const v = subtitleStyleValues();
        settingsPreview.textContent = tx('Altyazı önizleme: Merhaba dünya', 'Subtitle preview: Hello world');
        settingsPreview.style.fontSize = v.size;
        settingsPreview.style.color = v.color;
        settingsPreview.style.backgroundColor = v.bg === 'transparent' ? '#3a4a5a' : v.bg;
        settingsPreview.style.textShadow = '0 0 4px #000, 0 0 4px #000';
        renderEpgStatus();
        const versionEl = document.getElementById('settings-version');
        if (versionEl) versionEl.textContent = 'oguzIPTV v' + APP_VERSION;
    }

    function changeSetting(i, dir) {
        const def = settingDefs[i];
        if (!def) return;
        settings[def.key] = (settings[def.key] + dir + def.options.length) % def.options.length;
        saveSettings();
        applySubtitleStyle();
        if (def.key === 'epg') {
            if (settings.epg === 0) loadEpg(false);
            updateEpgViews();
        }
        renderSettings();
    }

    async function loadAccountInfo() {
        settingsAccount.textContent = '';
        const server = localStorage.getItem('xtream_server');
        const user = localStorage.getItem('xtream_username');
        const pass = localStorage.getItem('xtream_password');
        if (connectionType === 'm3u' || !server || !user || !pass) return;
        const now = Date.now();
        if (!accountInfoCache || now - accountInfoCache.time > 60000) {
            try {
                const response = await fetch(server + '/player_api.php?username=' + user + '&password=' + pass);
                const data = await response.json();
                accountInfoCache = { time: now, info: data && data.user_info ? data.user_info : null };
            } catch (error) {
                settingsAccount.textContent = tx('Hesap bilgisi alınamadı', 'Could not load account info');
                return;
            }
        }
        const ui = accountInfoCache.info;
        if (!ui || activeZone !== 'settings') return;
        const lines = [];
        const active = String(ui.status || '').toLowerCase() === 'active';
        lines.push({ text: tx('Hesap: ', 'Account: ') + (active ? tx('Aktif', 'Active') : (ui.status || '?')) + (String(ui.is_trial) === '1' ? tx(' (deneme)', ' (trial)') : ''), warn: !active });
        const exp = parseInt(ui.exp_date, 10);
        if (exp > 0) {
            const days = Math.ceil((exp * 1000 - Date.now()) / 86400000);
            const dateText = new Date(exp * 1000).toLocaleDateString(currentLang === 'en' ? 'en-GB' : 'tr-TR');
            lines.push({ text: tx('Bitiş: ', 'Expires: ') + dateText + ' (' + (days >= 0 ? tx(days + ' gün kaldı', days + ' days left') : tx('süresi dolmuş', 'expired')) + ')', warn: days <= 7 });
        } else {
            lines.push({ text: tx('Bitiş: sınırsız', 'Expires: never'), warn: false });
        }
        if (ui.max_connections) {
            lines.push({ text: tx('Bağlantı: ', 'Connections: ') + (ui.active_cons || 0) + ' / ' + ui.max_connections, warn: false });
        }
        settingsAccount.innerHTML = '';
        lines.forEach(l => {
            const div = document.createElement('div');
            div.textContent = l.text;
            if (l.warn) div.className = 'warn';
            settingsAccount.appendChild(div);
        });
    }

    function openSettings() {
        settingsConfirm = -1;
        activeZone = 'settings';
        settingsFocus = 0;
        renderSettings();
        settingsModal.style.display = 'flex';
        loadAccountInfo();
    }

    function closeSettings() {
        settingsModal.style.display = 'none';
        activeZone = 'topnav';
        if (navSettings) {
            navSettings.classList.add('focused');
            navSettings.focus();
        }
    }

    function runSettingsAction(action, index) {
        if (action.confirm && settingsConfirm !== index) {
            settingsConfirm = index;   // first press only asks
            renderSettings();
            return;
        }
        settingsConfirm = -1;
        action.run();
    }

    function handleSettingsKey(e, key, keyCode, isEnterKey) {
        const actions = settingActions.filter(a => a.show());
        const rowCount = settingDefs.length + actions.length + 1;
        if (key === 'ArrowDown' || keyCode === 40) {
            settingsConfirm = -1;
            settingsFocus = Math.min(rowCount - 1, settingsFocus + 1);
            renderSettings();
        } else if (key === 'ArrowUp' || keyCode === 38) {
            settingsConfirm = -1;
            settingsFocus = Math.max(0, settingsFocus - 1);
            renderSettings();
        } else if (key === 'ArrowLeft' || keyCode === 37) {
            if (settingsFocus < settingDefs.length) changeSetting(settingsFocus, -1);
        } else if (key === 'ArrowRight' || keyCode === 39) {
            if (settingsFocus < settingDefs.length) changeSetting(settingsFocus, 1);
        } else if (key === 'Enter' || isEnterKey) {
            if (settingsFocus < settingDefs.length) changeSetting(settingsFocus, 1);
            else if (settingsFocus < settingDefs.length + actions.length) runSettingsAction(actions[settingsFocus - settingDefs.length], settingsFocus - settingDefs.length);
            else closeSettings();
        } else if (key === 'Escape' || key === 'Backspace' || keyCode === 27 || keyCode === 461 || keyCode === 10009) {
            if (settingsConfirm !== -1) { settingsConfirm = -1; renderSettings(); } else closeSettings();
        } else {
            return;
        }
        e.preventDefault();
    }

    if (navSettings) {
        navSettings.addEventListener('click', openSettings);
    }

    // ---- Program guide (EPG) from the provider's XMLTV file (xmltv.php) ----
    // The file is large, so it is read in chunks, only the next hours are kept, and it is refreshed every 6 hours at most.
    const EPG_KEY = 'epgCache2';   // v2: keeps the whole day, not only the next hours
    try { localStorage.removeItem('epgCache'); } catch (e) { /* ignore */ }
    const EPG_MAX_AGE = 6 * 3600 * 1000;
    const EPG_AFTER = 36 * 3600;    // programmes kept: from today 00:00 until 36 hours later
    const EPG_PER_CHANNEL = 200;
    let epgData = {};               // channel id -> [[startSec, stopSec, title], ...]
    let epgMeta = { time: 0, server: '', channels: 0 };
    let epgState = 'idle';          // idle | loading | ready | error
    try {
        const savedEpg = JSON.parse(localStorage.getItem(EPG_KEY));
        if (savedEpg && savedEpg.data) {
            epgData = savedEpg.data;
            epgMeta = { time: savedEpg.time || 0, server: savedEpg.server || '', channels: Object.keys(savedEpg.data).length };
            epgState = 'ready';
        }
    } catch (e) { /* ignore a corrupt cache */ }

    function parseXmltvTime(str) { // "20261115150000 +0300"
        const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/.exec(str || '');
        if (!m) return 0;
        let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000;
        if (m[7]) {
            const offset = (+m[8] * 3600 + +m[9] * 60) * (m[7] === '+' ? 1 : -1);
            t -= offset;
        }
        return t;
    }

    function decodeXmlText(s) {
        return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
    }

    // Feeds on text chunks and calls onProgramme(channel, startSec, stopSec, title) for every complete <programme> element
    function createXmltvParser(onProgramme) {
        let buf = '';
        return {
            feed(text) {
                buf += text;
                let pos = 0;
                for (;;) {
                    const s = buf.indexOf('<programme ', pos);
                    if (s === -1) { pos = Math.max(pos, buf.length - 12); break; } // a tag may be split across chunks
                    const e = buf.indexOf('</programme>', s);
                    if (e === -1) { pos = s; break; }
                    const block = buf.substring(s, e);
                    const start = /start="([^"]+)"/.exec(block);
                    const stop = /stop="([^"]+)"/.exec(block);
                    const channel = /channel="([^"]+)"/.exec(block);
                    const title = /<title[^>]*>([^<]*)<\/title>/.exec(block);
                    if (start && stop && channel && title) {
                        onProgramme(channel[1], parseXmltvTime(start[1]), parseXmltvTime(stop[1]), decodeXmlText(title[1]).trim());
                    }
                    pos = e + 12;
                }
                buf = buf.substring(pos);
            }
        };
    }

    async function loadEpg(force) {
        if (settings.epg !== 0 || connectionType === 'm3u') return;
        const server = localStorage.getItem('xtream_server');
        const user = localStorage.getItem('xtream_username');
        const pass = localStorage.getItem('xtream_password');
        if (!server || !user || !pass || epgState === 'loading') return;
        if (!force && epgMeta.server === server && Date.now() - epgMeta.time < EPG_MAX_AGE) return;

        epgState = 'loading';
        renderEpgStatus();
        try {
            const response = await fetch(server + '/xmltv.php?username=' + user + '&password=' + pass);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const midnight = new Date();
            midnight.setHours(0, 0, 0, 0);
            const dayStart = Math.floor(midnight.getTime() / 1000);
            const collected = {};
            const parser = createXmltvParser((channel, start, stop, title) => {
                if (!start || stop <= dayStart || start >= dayStart + EPG_AFTER) return;
                (collected[channel] || (collected[channel] = [])).push([start, stop, title]);
            });
            if (response.body && response.body.getReader && typeof TextDecoder !== 'undefined') {
                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8');
                for (;;) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    parser.feed(decoder.decode(chunk.value, { stream: true }));
                    await new Promise(resolve => setTimeout(resolve, 0)); // let the UI breathe
                }
            } else {
                parser.feed(await response.text());
            }
            Object.keys(collected).forEach(id => {
                collected[id].sort((a, b) => a[0] - b[0]);
                collected[id] = collected[id].slice(0, EPG_PER_CHANNEL);
            });
            epgData = collected;
            epgMeta = { time: Date.now(), server: server, channels: Object.keys(collected).length };
            try { localStorage.setItem(EPG_KEY, JSON.stringify({ time: epgMeta.time, server: server, data: collected })); } catch (e) { /* quota */ }
            epgState = 'ready';
        } catch (error) {
            console.log('EPG load failed:', error);
            epgState = 'error';
        }
        renderEpgStatus();
        updateEpgViews();
    }

    function two(n) { return n < 10 ? '0' + n : String(n); }
    function epgClock(sec) {
        const d = new Date(sec * 1000);
        return two(d.getHours()) + ':' + two(d.getMinutes());
    }

    // {now: [start, stop, title] | null, next: [...] | null} for a channel, or null when nothing is known
    function getEpgNowNext(epgId) {
        if (settings.epg !== 0 || !epgId) return null;
        const list = epgData[epgId];
        if (!list || list.length === 0) return null;
        const now = Date.now() / 1000;
        const i = list.findIndex(p => p[1] > now);
        if (i === -1) return null;
        if (list[i][0] > now) return { now: null, next: list[i] };
        return { now: list[i], next: list[i + 1] || null };
    }

    // Little "now playing" text inside a channel row (list view only)
    function applyEpgToName(nameSpan, epgId) {
        const old = nameSpan.querySelector('.channel-epg');
        if (old) nameSpan.removeChild(old);
        const np = getEpgNowNext(epgId);
        if (!np || !np.now) return;
        const span = document.createElement('span');
        span.className = 'channel-epg';
        span.textContent = np.now[2];
        nameSpan.appendChild(span);
    }

    function epgLine(channelName, epgId) {
        const np = getEpgNowNext(epgId);
        if (!np) return '';
        const parts = [];
        if (np.now) parts.push(tx('Şimdi', 'Now') + ' ' + epgClock(np.now[0]) + '–' + epgClock(np.now[1]) + ' ' + np.now[2]);
        if (np.next) parts.push(tx('Sonra', 'Next') + ' ' + epgClock(np.next[0]) + ' ' + np.next[2]);
        return (channelName ? channelName + '  ·  ' : '') + parts.join('   |   ');
    }

    // Info line for the highlighted channel of the list
    function updateEpgInfo(channelElement) {
        const bar = document.getElementById('epg-info');
        if (!bar) return;
        let text = '';
        if (channelElement && currentContentType === 'live' && channelElement.dataset.channelData) {
            try {
                const item = JSON.parse(channelElement.dataset.channelData);
                text = epgLine(item.name, item.epgId);
            } catch (e) { /* ignore */ }
        }
        bar.textContent = text;
        bar.style.display = text ? 'block' : 'none';
    }

    // Refresh everything that shows guide data (after a load, and once a minute as programmes change)
    function updateEpgViews() {
        channelList.querySelectorAll('.channel-item').forEach(el => {
            if (!el.dataset.channelData) return;
            const nameSpan = el.querySelector('.channel-name');
            if (!nameSpan) return;
            try {
                applyEpgToName(nameSpan, JSON.parse(el.dataset.channelData).epgId);
            } catch (e) { /* ignore */ }
        });
        updateEpgInfo(document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('channel-item') ? document.activeElement : null);
        refreshLiveOsdTitle();
    }

    // ---- Live TV banner (now / next + program progress) and the day's program list ----
    function setDisplay(id, value) {
        const el = document.getElementById(id);
        if (el) el.style.display = value;
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function updateLiveBanner() {
        const live = !!(currentLiveChannel && isLiveStreamUrl(currentStreamUrl));
        setDisplay('osd-live-info', live ? 'block' : 'none');
        setDisplay('osd-video-title', live ? 'none' : '');
        setDisplay('btn-osd-guide', live ? '' : 'none');
        if (!live) return;

        const item = currentLiveChannel.item || {};
        const nowSec = Date.now() / 1000;
        setText('live-channel', item.name || '');
        setText('live-clock', epgClock(nowSec));

        const np = getEpgNowNext(item.epgId);
        const now = np && np.now;
        const next = np && np.next;
        if (now) {
            setText('live-program', now[2]);
            setText('live-start', epgClock(now[0]));
            setText('live-end', epgClock(now[1]));
            const pct = Math.max(0, Math.min(100, (nowSec - now[0]) / (now[1] - now[0]) * 100));
            const fill = document.getElementById('live-bar-fill');
            if (fill) fill.style.width = pct + '%';
            const left = Math.max(0, Math.round((now[1] - nowSec) / 60));
            setText('live-remaining', tx(left + ' dk kaldı', left + ' min left'));
            setDisplay('live-program-bar', 'flex');
        } else {
            setText('live-program', '');
            setDisplay('live-program-bar', 'none');
        }
        setText('live-hint', tx('◀ Kanallar   ·   0-9 Kanal no   ·   Sarı: Program rehberi', '◀ Channels   ·   0-9 Channel no   ·   Yellow: Program guide'));
        setText('live-next', next ? tx('Sonra', 'Next') + ' · ' + epgClock(next[0]) + '  ' + next[2] : (now ? '' : (settings.epg === 0 ? tx('Program bilgisi yok', 'No program info') : '')));
    }

    // kept under the old name: other code calls it when the guide data changes
    function refreshLiveOsdTitle() {
        updateLiveBanner();
    }

    // How far behind the live edge we are (seconds), or null when unknown
    function liveBehindSeconds() {
        const seekable = videoPlayer.seekable;
        if (!seekable || seekable.length === 0) return null;
        let behind = Math.max(0, seekable.end(seekable.length - 1) - videoPlayer.currentTime);
        // hls.js starts a few segments behind the end of the playlist on purpose: that point counts as "live"
        if (hls && typeof hls.liveSyncPosition === 'number' && isFinite(hls.liveSyncPosition)) {
            behind = Math.min(behind, Math.max(0, hls.liveSyncPosition - videoPlayer.currentTime));
        }
        return behind;
    }

    // ---- day's program list for the channel being watched ----
    const guidePanel = document.getElementById('epg-guide');
    const guideList = document.getElementById('epg-guide-list');
    let guideRows = [];     // programme rows only
    let guideIndex = 0;

    function dayLabel(sec) {
        const d = new Date(sec * 1000);
        const today = new Date();
        const tomorrow = new Date(today.getTime() + 86400000);
        if (d.toDateString() === today.toDateString()) return tx('Bugün', 'Today');
        if (d.toDateString() === tomorrow.toDateString()) return tx('Yarın', 'Tomorrow');
        return d.toLocaleDateString(currentLang === 'en' ? 'en-GB' : 'tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
    }

    function openGuide() {
        if (!currentLiveChannel || !isLiveStreamUrl(currentStreamUrl) || !guidePanel) return;
        const item = currentLiveChannel.item || {};
        const list = (settings.epg === 0 && item.epgId && epgData[item.epgId]) || [];
        hideCustomOSD();
        setText('epg-guide-channel', item.name || '');
        guideList.innerHTML = '';
        guideRows = [];
        const nowSec = Date.now() / 1000;
        if (list.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'epg-guide-empty';
            empty.textContent = settings.epg === 0 ? tx('Bu kanal için program bilgisi yok.', 'No program info for this channel.') : tx('Program rehberi kapalı (Ayarlar).', 'Program guide is off (Settings).');
            guideList.appendChild(empty);
        }
        let lastDay = '';
        let currentRow = -1;
        list.forEach(p => {
            const day = dayLabel(p[0]);
            if (day !== lastDay) {
                lastDay = day;
                const head = document.createElement('div');
                head.className = 'epg-guide-day';
                head.textContent = day;
                guideList.appendChild(head);
            }
            const row = document.createElement('div');
            const isNow = p[0] <= nowSec && p[1] > nowSec;
            row.className = 'epg-guide-row' + (p[1] <= nowSec ? ' past' : '') + (isNow ? ' now' : '');
            const time = document.createElement('span');
            time.className = 'epg-guide-time';
            time.textContent = epgClock(p[0]);
            const title = document.createElement('span');
            title.className = 'epg-guide-title';
            title.textContent = p[2];
            row.appendChild(time);
            row.appendChild(title);
            if (isNow) {
                const badge = document.createElement('span');
                badge.className = 'epg-guide-badge';
                badge.textContent = tx('ŞİMDİ', 'NOW');
                row.appendChild(badge);
                const bar = document.createElement('div');
                bar.className = 'epg-guide-progress';
                const fill = document.createElement('div');
                fill.style.width = Math.max(0, Math.min(100, (nowSec - p[0]) / (p[1] - p[0]) * 100)) + '%';
                bar.appendChild(fill);
                row.appendChild(bar);
                currentRow = guideRows.length;
            }
            guideRows.push(row);
            guideList.appendChild(row);
        });
        guideIndex = currentRow >= 0 ? currentRow : Math.max(0, guideRows.findIndex(r => !r.classList.contains('past')));
        guidePanel.style.display = 'flex';
        activeZone = 'guide';
        markGuideRow();
    }

    function markGuideRow() {
        guideRows.forEach((r, i) => r.classList.toggle('sel', i === guideIndex));
        const row = guideRows[guideIndex];
        if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    }

    function closeGuide() {
        if (guidePanel) guidePanel.style.display = 'none';
        activeZone = 'player';
    }

    function handleGuideKey(e, key, keyCode, isEnterKey) {
        if (key === 'ArrowDown' || keyCode === 40) {
            guideIndex = Math.min(guideRows.length - 1, guideIndex + 1);
            markGuideRow();
        } else if (key === 'ArrowUp' || keyCode === 38) {
            guideIndex = Math.max(0, guideIndex - 1);
            markGuideRow();
        } else if (key === 'Escape' || key === 'Backspace' || key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Enter' ||
                   keyCode === 27 || keyCode === 461 || keyCode === 10009 || keyCode === 37 || keyCode === 39 || keyCode === 405 || isEnterKey) {
            closeGuide();
        } else {
            return;
        }
        e.preventDefault();
    }

    // ---- Channel list inside the player (live TV) + jumping to a channel by typing its number ----
    const channelPanel = document.getElementById('channel-panel');
    const channelPanelList = document.getElementById('channel-panel-list');
    let panelRows = [];      // {el: panel row, source: channel item of the list}
    let panelIndex = 0;

    function openChannelPanel() {
        if (!channelPanel || !isLiveStreamUrl(currentStreamUrl)) return;
        const sources = Array.from(channelList.querySelectorAll('.channel-item')).filter(el => el.dataset.url);
        if (sources.length === 0) return;
        hideCustomOSD();
        channelPanelList.innerHTML = '';
        panelRows = [];
        sources.forEach((source, i) => {
            let item = {};
            try { item = JSON.parse(source.dataset.channelData || '{}'); } catch (e) { /* ignore */ }
            const row = document.createElement('div');
            row.className = 'channel-panel-row';
            const num = document.createElement('span');
            num.className = 'channel-panel-num';
            num.textContent = String(i + 1);
            const name = document.createElement('span');
            name.className = 'channel-panel-name';
            name.textContent = item.name || '';
            row.appendChild(num);
            row.appendChild(name);
            const np = getEpgNowNext(item.epgId);
            if (np && np.now) {
                const now = document.createElement('span');
                now.className = 'channel-panel-now';
                now.textContent = np.now[2];
                row.appendChild(now);
            }
            channelPanelList.appendChild(row);
            panelRows.push({ el: row, source: source });
        });
        const current = panelRows.findIndex(r => r.source.dataset.url === currentStreamUrl);
        panelIndex = current >= 0 ? current : 0;
        if (current >= 0) panelRows[current].el.classList.add('playing');
        channelPanel.style.display = 'flex';
        activeZone = 'chpanel';
        markPanelRow();
    }

    function markPanelRow() {
        panelRows.forEach((r, i) => r.el.classList.toggle('sel', i === panelIndex));
        const row = panelRows[panelIndex];
        if (row && row.el.scrollIntoView) row.el.scrollIntoView({ block: 'center' });
    }

    function closeChannelPanel() {
        if (channelPanel) channelPanel.style.display = 'none';
        if (activeZone === 'chpanel') activeZone = 'player';
    }

    function handleChannelPanelKey(e, key, keyCode, isEnterKey) {
        if (key === 'ArrowDown' || keyCode === 40) {
            panelIndex = Math.min(panelRows.length - 1, panelIndex + 1);
            markPanelRow();
        } else if (key === 'ArrowUp' || keyCode === 38) {
            panelIndex = Math.max(0, panelIndex - 1);
            markPanelRow();
        } else if (key === 'Enter' || isEnterKey) {
            const target = panelRows[panelIndex];
            closeChannelPanel();
            if (target && target.source.dataset.url !== currentStreamUrl) playChannel(target.source);
        } else if (key === 'Escape' || key === 'Backspace' || key === 'ArrowLeft' || key === 'ArrowRight' ||
                   keyCode === 27 || keyCode === 461 || keyCode === 10009 || keyCode === 37 || keyCode === 39) {
            closeChannelPanel();
        } else {
            return;
        }
        e.preventDefault();
    }

    // number keys: "1", "2" -> channel 12 of the list that is shown
    const numberOverlay = document.getElementById('number-overlay');
    let numberBuffer = '';
    let numberTimer = null;

    function liveListItems() {
        return Array.from(channelList.querySelectorAll('.channel-item')).filter(el => el.dataset.url);
    }

    function showNumberOverlay(text, warn) {
        if (!numberOverlay) return;
        numberOverlay.textContent = text;
        numberOverlay.style.color = warn ? '#ff8a80' : '#fff';
        numberOverlay.style.display = 'block';
    }

    function hideNumberOverlay() {
        if (numberOverlay) numberOverlay.style.display = 'none';
    }

    function commitNumber() {
        clearTimeout(numberTimer);
        const n = parseInt(numberBuffer, 10);
        numberBuffer = '';
        const items = liveListItems();
        if (n >= 1 && n <= items.length) {
            hideNumberOverlay();
            if (items[n - 1].dataset.url !== currentStreamUrl) playChannel(items[n - 1]);
        } else {
            showNumberOverlay(tx('Kanal yok', 'No such channel'), true);
            setTimeout(hideNumberOverlay, 1200);
        }
    }

    function addNumberDigit(digit) {
        if (numberBuffer.length >= 4) numberBuffer = '';
        numberBuffer += digit;
        const items = liveListItems();
        const n = parseInt(numberBuffer, 10);
        let label = numberBuffer;
        if (n >= 1 && n <= items.length) {
            const nameEl = items[n - 1].querySelector('.channel-name');
            if (nameEl) label += '   ' + nameEl.firstChild.textContent;
        }
        showNumberOverlay(label, false);
        clearTimeout(numberTimer);
        numberTimer = setTimeout(commitNumber, 1600);
    }

    function digitFromKey(e, keyCode) {
        if (keyCode >= 48 && keyCode <= 57) return String(keyCode - 48);
        if (keyCode >= 96 && keyCode <= 105) return String(keyCode - 96);
        return null;
    }

    function renderEpgStatus() {
        const el = document.getElementById('settings-epg');
        if (!el) return;
        let text = '';
        if (settings.epg === 0 && connectionType !== 'm3u') {
            if (epgState === 'loading') text = tx('Rehber: yükleniyor…', 'Guide: loading…');
            else if (epgState === 'error') text = tx('Rehber: alınamadı', 'Guide: could not load');
            else if (epgState === 'ready') text = tx('Rehber: ', 'Guide: ') + epgMeta.channels + tx(' kanal, güncelleme ', ' channels, updated ') + epgClock(epgMeta.time / 1000);
        }
        el.textContent = text;
    }

    channelList.addEventListener('focusin', (e) => {
        updateEpgInfo(e.target && e.target.closest ? e.target.closest('.channel-item') : null);
    });
    setInterval(updateEpgViews, 60000);

    // The top menu (Live TV / Movies / Series ...) only makes sense after logging in:
    // hide it while the login screen is showing and bring it back when the login screen goes away.
    function syncLoginMode() {
        document.body.classList.toggle('login-screen', getComputedStyle(loginContainer).display !== 'none');
    }
    syncLoginMode();
    if (typeof MutationObserver !== 'undefined') {
        new MutationObserver(syncLoginMode).observe(loginContainer, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    // Initialize translations on load
    updateTranslations();

    // Video progress saving for VOD
    videoPlayer.addEventListener('timeupdate', function() {
        // Only save progress for VOD (not live streams)
        if (currentStreamUrl && !currentStreamUrl.includes('.m3u8') && videoPlayer.currentTime > 10) {
            saveProgress(false);
            updateContinueEntry(false);
        }

        // Update custom OSD progress bar
        updateCustomOSDProgress();

        // Check if we should show next episode overlay (2 minutes before end)
        if (currentSeriesInfo && currentSeriesInfo.episodes && currentEpisodeIndex >= 0) {
            const duration = videoPlayer.duration;
            const currentTime = videoPlayer.currentTime;

            if (isFinite(duration) && duration > 0) {
                const timeRemaining = duration - currentTime;
                const nextEpisodeIndex = currentEpisodeIndex + 1;

                // Show overlay when 2 minutes (120 seconds) remaining
                if (timeRemaining <= 120 && timeRemaining > 0 && nextEpisodeIndex < currentSeriesInfo.episodes.length) {
                    // Check if overlay is not already showing
                    const overlay = document.getElementById('next-episode-overlay');
                    if (overlay && overlay.style.display !== 'block') {
                        const nextEpisode = currentSeriesInfo.episodes[nextEpisodeIndex];
                        showNextEpisodeOverlay(nextEpisode, nextEpisodeIndex);
                    }
                }
            }
        }
    });

    // Update play/pause button state on video pause
    videoPlayer.addEventListener('pause', function() {
        saveProgress(true);
        const btnPlayPause = document.getElementById('btn-osd-playpause');
        if (btnPlayPause) {
            btnPlayPause.textContent = '▶ Oynat';
        }
        // Keep OSD visible when paused
        if (customOsdTimeout) {
            clearTimeout(customOsdTimeout);
            customOsdTimeout = null;
        }
    });

    // Update play/pause button state on video play
    videoPlayer.addEventListener('play', function() {
        const btnPlayPause = document.getElementById('btn-osd-playpause');
        if (btnPlayPause) {
            btnPlayPause.textContent = '⏸ Duraklat';
        }
        // Start 5-second hide timeout when playing
        const customOSD = document.getElementById('custom-player-osd');
        if (customOSD && customOSD.style.display === 'block') {
            if (customOsdTimeout) {
                clearTimeout(customOsdTimeout);
            }
            customOsdTimeout = setTimeout(() => {
                hideCustomOSD();
            }, 5000);
        }
    });

    // Mouse movement detection for OSD
    window.addEventListener('mousemove', function() {
        const videoContainer = document.getElementById('video-container');
        if (videoContainer && videoContainer.style.display === 'block') {
            showCustomOSD(false);

            // Show cursor and reset hide timeout
            videoContainer.classList.remove('hide-cursor');
            if (mouseCursorTimeout) {
                clearTimeout(mouseCursorTimeout);
            }
            mouseCursorTimeout = setTimeout(() => {
                videoContainer.classList.add('hide-cursor');
            }, 5000);
        }
    });

    // Progress bar hover and click-to-seek
    const progressBar = document.getElementById('osd-progress-bar');
    const timeTooltip = document.getElementById('osd-time-tooltip');

    if (progressBar && timeTooltip) {
        progressBar.addEventListener('mousemove', function(e) {
            const rect = progressBar.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            const duration = videoPlayer.duration;

            if (isFinite(duration) && duration > 0) {
                const timeAtPosition = percentage * duration;
                timeTooltip.textContent = formatTime(timeAtPosition);
                timeTooltip.style.left = x + 'px';
            }
        });

        progressBar.addEventListener('mouseleave', function() {
            timeTooltip.style.opacity = '0';
        });

        progressBar.addEventListener('click', function(e) {
            const rect = progressBar.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            const duration = videoPlayer.duration;

            if (isFinite(duration) && duration > 0) {
                videoPlayer.currentTime = percentage * duration;
            }
        });
    }

    // Clear progress when video ends
    videoPlayer.addEventListener('ended', function() {
        removeContinueEntry();
        if (currentStreamUrl) {
            markWatched(currentStreamUrl);
            if (currentContinueItem && currentContinueItem.type === 'series' && currentSeriesInfo && currentSeriesInfo.episodes && currentEpisodeIndex >= 0) {
                const ep = currentSeriesInfo.episodes[currentEpisodeIndex];
                if (ep) rememberLastEpisode(currentContinueItem.item.series_id, ep.season, ep.id);
            }
            removeProgress(currentStreamUrl);
        }

        // Check if this is a series episode and there's a next episode
        if (currentSeriesInfo && currentSeriesInfo.episodes && currentEpisodeIndex >= 0) {
            const nextEpisodeIndex = currentEpisodeIndex + 1;
            if (nextEpisodeIndex < currentSeriesInfo.episodes.length) {
                const nextEpisode = currentSeriesInfo.episodes[nextEpisodeIndex];
                showNextEpisodeOverlay(nextEpisode, nextEpisodeIndex);
                return;
            }
        }

        // Default behavior: return to channels
        videoPlayer.src = '';
        activeZone = 'channels';
        window.location.hash = '#channels';
    });

    // Spatial navigation with arrow keys
    document.addEventListener('keydown', handleSpatialNavigation);

    // Hash routing for browser back button and refresh persistence
    window.addEventListener('hashchange', function() {
        isProgrammaticHashChange = true;
        // Going "back" onto an old #player history entry with nothing playing would show an empty black player
        if (window.location.hash === '#player' && !playbackActive) {
            history.replaceState(history.state, '', '#channels');
        }
        handleRouting();
        setTimeout(() => isProgrammaticHashChange = false, 100);
    });

    // webOS Back button handling using History API popstate hack
    window.addEventListener('popstate', function(e) {
        // Only handle popstate if it's not a programmatic hash change and not entering player
        if (!isProgrammaticHashChange && !isEnteringPlayer) {
            if (activeZone === 'osd') {
                hideOSD();
                activeZone = 'player';
                history.pushState({'page': 'main'}, 'main', location.href);
            } else if (activeZone === 'catmgr') {
                closeCategoryManager();
                history.pushState({'page': 'main'}, 'main', location.href);
            } else if (activeZone === 'chpanel') {
                closeChannelPanel();
                history.pushState({'page': 'main'}, 'main', location.href);
            } else if (activeZone === 'guide') {
                closeGuide();
                history.pushState({'page': 'main'}, 'main', location.href);
            } else if (activeZone === 'settings') {
                closeSettings();
                history.pushState({'page': 'main'}, 'main', location.href);
            } else if (activeZone === 'resume-modal') {
                resumeModal.style.display = 'none';
                videoPlayer.src = '';
                playbackActive = false;
                activeZone = 'channels';
                window.location.hash = '#channels';
                history.pushState({'page': 'main'}, 'main', location.href);
            } else if (activeZone === 'vod-modal') {
                vodDetailsModal.style.display = 'none';
                activeZone = 'channels';
                if (lastFocusedChannel) {
                    lastFocusedChannel.classList.add('focused');
                    lastFocusedChannel.focus();
                }
                history.pushState({'page': 'main'}, 'main', location.href);
            } else if (activeZone === 'player') {
                videoPlayer.pause();
                const videoContainer = document.getElementById('video-container');
                if (videoContainer) videoContainer.style.display = 'none';
                mainContent.style.display = 'block';
                document.querySelector('header').style.display = 'flex';
                document.querySelector('main').style.display = 'block';
                activeZone = 'channels';
                window.location.hash = '#channels';
                history.pushState({'page': 'channels'}, 'channels', '#channels');
            }
        }
    });
    
    function switchTab(tab) {
        if (tab === 'xtream') {
            tabXtream.classList.add('active');
            tabM3u.classList.remove('active');
            xtreamSection.classList.add('active');
            m3uSection.classList.remove('active');
            serverUrlInput.focus();
        } else {
            tabM3u.classList.add('active');
            tabXtream.classList.remove('active');
            m3uSection.classList.add('active');
            xtreamSection.classList.remove('active');
            playlistUrlInput.focus();
        }
    }
    
    function handleConnect() {
        const activeTab = tabXtream.classList.contains('active') ? 'xtream' : 'm3u';

        if (activeTab === 'xtream') {
            const serverUrl = serverUrlInput.value.trim();
            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim();

            if (!serverUrl || !username || !password) {
                return;
            }

            // Set connection type
            connectionType = 'xtream';

            // Save to localStorage
            localStorage.setItem('xtream_server', serverUrl);
            localStorage.setItem('xtream_username', username);
            localStorage.setItem('xtream_password', password);

            // Use Xtream JSON API - fetch categories first
            fetchCategories(serverUrl, username, password);

        } else {
            let playlistUrl = playlistUrlInput.value.trim();

            if (!playlistUrl || playlistUrl.toLowerCase() === 'test') {
                playlistUrl = 'https://iptv-org.github.io/iptv/countries/tr.m3u';
            }

            if (!playlistUrl) {
                return;
            }

            // Set connection type
            connectionType = 'm3u';

            // Save to localStorage
            localStorage.setItem('m3u_playlist', playlistUrl);

            // Fetch and parse the M3U playlist (text-based parser)
            fetchAndParseM3U(playlistUrl);
        }
    }
    
    function showCategories(categories, keepSelection = false) {
        lastCategories[currentContentType] = categories;
        categories = visibleCategories(categories, currentContentType);
        if (currentContentType === 'live' && !keepSelection) setTimeout(() => loadEpg(false), 3000); // in the background, not while the list loads
        loginContainer.style.display = 'none';
        mainContent.style.display = 'flex';
        sidebar.style.display = 'flex';
        channelList.style.display = 'flex';

        sidebar.innerHTML = '';

        const favoritesItem = document.createElement('div');
        favoritesItem.className = 'category-item';
        favoritesItem.dataset.categoryId = 'favorites';
        favoritesItem.dataset.isFavorites = 'true';
        favoritesItem.tabIndex = 0;
        favoritesItem.innerHTML = '<span class="cat-name">' + translations[currentLang]['category-favorites'] + '</span><span class="cat-count">' + favorites.length + '</span>';
        favoritesItem.addEventListener('click', () => selectCategory(favoritesItem));
        sidebar.appendChild(favoritesItem);

        if (currentContentType !== 'live') {
            [['continue', translations[currentLang]['category-continue']], ['recent', translations[currentLang]['category-recent']]].forEach(([specialId, label]) => {
                const specialItem = document.createElement('div');
                specialItem.className = 'category-item';
                specialItem.dataset.categoryId = specialId;
                specialItem.dataset.special = specialId;
                specialItem.tabIndex = 0;
                specialItem.innerHTML = '<span class="cat-name">' + label + '</span>';
                specialItem.addEventListener('click', () => selectCategory(specialItem));
                sidebar.appendChild(specialItem);
            });
        }

        categories.forEach((category) => {
            const categoryItem = document.createElement('div');
            categoryItem.className = 'category-item';
            categoryItem.dataset.categoryId = category.category_id;
            categoryItem.tabIndex = 0;

            const count = category.stream_count || category.series_count || 0;
            const nameSpan = document.createElement('span');
            nameSpan.className = 'cat-name';
            nameSpan.textContent = category.category_name; // textContent: category names come from the server
            categoryItem.appendChild(nameSpan);
            if (count > 0) {
                const countSpan = document.createElement('span');
                countSpan.className = 'cat-count';
                countSpan.textContent = count;
                categoryItem.appendChild(countSpan);
            }

            categoryItem.addEventListener('click', () => selectCategory(categoryItem));
            sidebar.appendChild(categoryItem);
        });

        if (keepSelection) {
            // redraw only: keep the channel list as it is and highlight the category that was open
            const items = Array.from(sidebar.querySelectorAll('.category-item'));
            const open = items.find(item => item.dataset.categoryId === String(activeCategoryId)) || items[0];
            if (open) {
                open.classList.add('focused');
                open.classList.add('active');
                open.focus();
            }
            activeZone = 'sidebar';
            return;
        }

        const categoryItems = sidebar.querySelectorAll('.category-item');
        const savedCategoryId = localStorage.getItem('activeCategoryId');
        let categoryToFocus = savedCategoryId 
            ? Array.from(categoryItems).find(item => item.dataset.categoryId === savedCategoryId)
            : categoryItems[0];

        if (categoryToFocus) {
            categoryToFocus.classList.add('focused');
            categoryToFocus.classList.add('active');
            categoryToFocus.focus();
            activeCategoryId = categoryToFocus.dataset.categoryId;
            activeZone = 'sidebar';
            const xtreamServer = localStorage.getItem('xtream_server');
            const xtreamUsername = localStorage.getItem('xtream_username');
            const xtreamPassword = localStorage.getItem('xtream_password');
            if (xtreamServer && xtreamUsername && xtreamPassword) {
                fetchChannelsByCategory(xtreamServer, xtreamUsername, xtreamPassword, activeCategoryId);
            }
        }
    }

    function selectCategory(categoryItem) {
        const allCategories = sidebar.querySelectorAll('.category-item');
        allCategories.forEach(cat => cat.classList.remove('active'));

        categoryItem.classList.add('active');
        categoryItem.classList.add('focused');
        categoryItem.focus();

        activeCategoryId = categoryItem.dataset.categoryId;

        if (categoryItem.dataset.isFavorites === 'true') {
            const xtreamServer = localStorage.getItem('xtream_server');
            const xtreamUsername = localStorage.getItem('xtream_username');
            const xtreamPassword = localStorage.getItem('xtream_password');
            if (xtreamServer && xtreamUsername && xtreamPassword) {
                fetchAllStreamsForFavorites(xtreamServer, xtreamUsername, xtreamPassword);
            }
            return;
        }
        if (categoryItem.dataset.special === 'continue') {
            showContinueWatching();
            return;
        }
        if (categoryItem.dataset.special === 'recent') {
            const srv = localStorage.getItem('xtream_server');
            const usr = localStorage.getItem('xtream_username');
            const pwd = localStorage.getItem('xtream_password');
            if (srv && usr && pwd) {
                showRecentChannels(srv, usr, pwd);
            }
            return;
        }
        localStorage.setItem('activeCategoryId', activeCategoryId);

        // Fetch channels for this category
        const xtreamServer = localStorage.getItem('xtream_server');
        const xtreamUsername = localStorage.getItem('xtream_username');
        const xtreamPassword = localStorage.getItem('xtream_password');
        if (xtreamServer && xtreamUsername && xtreamPassword) {
            fetchChannelsByCategory(xtreamServer, xtreamUsername, xtreamPassword, activeCategoryId);
        }
    }

    function showFavoritesChannels() {
        channelList.innerHTML = '';

        if (favorites.length === 0) {
            // Show empty state
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.textContent = translations[currentLang]['no-favorites'];
            emptyState.dataset.i18n = 'no-favorites';
            channelList.appendChild(emptyState);
            return;
        }

        // Get all channels from current cache to find favorited ones
        const allChannels = allStreamsCache || [];
        const favoriteChannels = allChannels.filter(ch => {
            const channelId = ch.id || ch.stream_id;
            return favorites.includes(channelId);
        });

        if (favoriteChannels.length === 0) {
            // Show empty state if no matching channels found
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.textContent = translations[currentLang]['no-favorites'];
            emptyState.dataset.i18n = 'no-favorites';
            channelList.appendChild(emptyState);
            return;
        }

        // Render favorite channels
        favoriteChannels.forEach((channel, index) => {
            const channelElement = document.createElement('div');
            channelElement.className = 'channel-item';
            channelElement.dataset.streamUrl = channel.url;
            channelElement.dataset.channelId = channel.id || channel.stream_id;
            channelElement.dataset.channelName = channel.name;
            channelElement.dataset.channelData = JSON.stringify(channel);
            channelElement.tabIndex = 0;

            const isGridView = channelList.classList.contains('grid-view');

            if (isGridView) {
                // Grid view structure - Netflix-style poster
                // Add logo as background
                const logoContainer = document.createElement('div');
                logoContainer.style.position = 'absolute';
                logoContainer.style.top = '0';
                logoContainer.style.left = '0';
                logoContainer.style.width = '100%';
                logoContainer.style.height = '100%';
                logoContainer.style.background = '#141414';

                const logoImg = document.createElement('img');
                logoImg.src = channel.logo || PLACEHOLDER_IMG;
                logoImg.alt = channel.name;
                logoImg.style.width = '100%';
                logoImg.style.height = '100%';
                logoImg.style.objectFit = 'cover';
                logoImg.style.objectPosition = 'center';
                logoImg.onerror = function() {
                    this.onerror = null;
                    this.src = PLACEHOLDER_IMG;
                };

                logoContainer.appendChild(logoImg);
                channelElement.appendChild(logoContainer);

                // Add overlay with channel name and favorite icon
                const overlay = document.createElement('div');
                overlay.className = 'grid-item-overlay';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'channel-name';
                setChannelName(nameSpan, channel);
                overlay.appendChild(nameSpan);

                // Add favorite icon (always favorited in this view)
                const favoriteIcon = document.createElement('span');
                favoriteIcon.className = 'favorite-icon favorited';
                favoriteIcon.innerHTML = '★';
                favoriteIcon.title = translations[currentLang]['remove-from-favorites'];
                favoriteIcon.dataset.channelId = channel.id || channel.stream_id;
                favoriteIcon.tabIndex = -1;

                // Add click event for favorite icon
                favoriteIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const channelId = channel.id || channel.stream_id;
                    const added = toggleFavorite(channelId);
                    if (!added) {
                        // If removed, refresh the list
                        showFavoritesChannels();
                    }
                });

                overlay.appendChild(favoriteIcon);
                channelElement.appendChild(overlay);
            } else {
                // List view structure - existing layout
                // Add logo if available
                const logoContainer = document.createElement('div');
                logoContainer.style.width = '80px';
                logoContainer.style.height = '50px';
                logoContainer.style.flexShrink = '0';
                logoContainer.style.marginRight = '15px';
                logoContainer.style.borderRadius = '4px';
                logoContainer.style.background = 'rgba(0, 0, 0, 0.3)';
                logoContainer.style.display = 'flex';
                logoContainer.style.alignItems = 'center';
                logoContainer.style.justifyContent = 'center';
                logoContainer.style.overflow = 'hidden';

                const logoImg = document.createElement('img');
                logoImg.src = channel.logo || PLACEHOLDER_IMG;
                logoImg.alt = channel.name;
                logoImg.style.width = '100%';
                logoImg.style.height = '100%';
                logoImg.style.objectFit = 'contain';
                logoImg.style.objectPosition = 'center';
                logoImg.onerror = function() {
                    this.onerror = null;
                    this.src = PLACEHOLDER_IMG;
                };

                logoContainer.appendChild(logoImg);
                channelElement.appendChild(logoContainer);

                // Add channel name
                const nameSpan = document.createElement('span');
                nameSpan.className = 'channel-name';
                setChannelName(nameSpan, channel);
                channelElement.appendChild(nameSpan);

                // Add favorite icon (always favorited in this view)
                const favoriteIcon = document.createElement('span');
                favoriteIcon.className = 'favorite-icon favorited';
                favoriteIcon.innerHTML = '★';
                favoriteIcon.title = translations[currentLang]['remove-from-favorites'];
                favoriteIcon.dataset.channelId = channel.id || channel.stream_id;
                favoriteIcon.tabIndex = -1;

                // Add click event for favorite icon
                favoriteIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const channelId = channel.id || channel.stream_id;
                    const added = toggleFavorite(channelId);
                    if (!added) {
                        // If removed, refresh the list
                        showFavoritesChannels();
                    }
                });

                channelElement.appendChild(favoriteIcon);
            }

            // Add click event listener
            channelElement.addEventListener('click', () => {
                playChannel(channelElement);
            });

            channelList.appendChild(channelElement);
        });

        const firstChannel = channelList.querySelector('.channel-item');
        if (firstChannel) {
            firstChannel.classList.add('focused');
            firstChannel.focus();
            activeZone = 'channels';
        }
    }

    function showChannelList(channels, keepFocus = false) {
        channelList.innerHTML = '';

        // Update category header title
        const categoryHeaderTitle = document.getElementById('category-header-title');
        if (categoryHeaderTitle) {
            let categoryName = '';
            const activeCategory = document.querySelector('.category-item.active');
            
            if (activeCategoryId === 'favorites' || (typeof activeCategoryId === 'string' && activeCategoryId === 'favorites')) {
                categoryName = 'Favoriler';
            } else if (activeCategory) {
                const catNameElement = activeCategory.querySelector('.cat-name');
                categoryName = catNameElement ? catNameElement.textContent : activeCategory.textContent;
            } else {
                categoryName = 'Tüm Kanallar';
            }

            categoryHeaderTitle.textContent = categoryName + ' • Toplam: ' + channels.length + ' İçerik';
        }

        let channelsToRender = channels;
        if (activeCategoryId === 'favorites' || (typeof activeCategoryId === 'string' && activeCategoryId === 'favorites')) {
            channelsToRender = channels.filter(channel => {
                const channelId = channel.id || channel.stream_id;
                return favorites.includes(channelId);
            });

            if (channelsToRender.length === 0) {
                const emptyState = document.createElement('div');
                emptyState.className = 'empty-state';
                emptyState.textContent = translations[currentLang]['no-favorites'];
                channelList.appendChild(emptyState);
                return;
            }
        }

        channelsToRender = channelsToRender.slice(0, 200);

        // Render channels
        channelsToRender.forEach((channel, index) => {
            const channelItem = document.createElement('div');
            channelItem.className = 'channel-item';
            channelItem.dataset.url = channel.url;
            channelItem.tabIndex = 0;

            channelItem.dataset.channelData = JSON.stringify(channel);

            if (channel.series_id) {
                channelItem.dataset.seriesId = channel.series_id;
            }

            if (channel.seriesTitle) {
                channelItem.dataset.seriesTitle = channel.seriesTitle;
            }
            if (channel.season) {
                channelItem.dataset.season = channel.season;
            }
            if (channel.episode) {
                channelItem.dataset.episode = channel.episode;
            }

            const isGridView = channelList.classList.contains('grid-view');

            if (isGridView) {
                const logoContainer = document.createElement('div');
                logoContainer.style.position = 'absolute';
                logoContainer.style.top = '0';
                logoContainer.style.left = '0';
                logoContainer.style.width = '100%';
                logoContainer.style.height = '100%';
                logoContainer.style.background = '#141414';

                const logoImg = document.createElement('img');
                logoImg.alt = channel.name;
                logoImg.style.width = '100%';
                logoImg.style.height = '100%';
                logoImg.style.objectFit = 'cover';
                logoImg.style.objectPosition = 'center';

                if (channel.logo) {
                    logoImg.src = channel.logo;
                } else {
                    logoImg.src = PLACEHOLDER_IMG;
                }

                logoImg.onerror = function() {
                    this.onerror = null;
                    this.src = PLACEHOLDER_IMG;
                };

                logoContainer.appendChild(logoImg);
                channelItem.appendChild(logoContainer);

                const overlay = document.createElement('div');
                overlay.className = 'grid-item-overlay';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'channel-name';
                setChannelName(nameSpan, channel);
                overlay.appendChild(nameSpan);

                const favoriteIcon = document.createElement('span');
                favoriteIcon.className = 'favorite-icon';
                favoriteIcon.innerHTML = '☆';
                favoriteIcon.title = translations[currentLang]['add-to-favorites'];
                favoriteIcon.dataset.channelId = channel.id || channel.stream_id;
                favoriteIcon.tabIndex = -1;

                const channelId = channel.id || channel.stream_id;
                if (channelId && isFavorite(channelId)) {
                    favoriteIcon.classList.add('favorited');
                    favoriteIcon.innerHTML = '★';
                    favoriteIcon.title = translations[currentLang]['remove-from-favorites'];
                }

                favoriteIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const added = toggleFavorite(channelId);
                    if (added) {
                        favoriteIcon.classList.add('favorited');
                        favoriteIcon.innerHTML = '★';
                        favoriteIcon.title = translations[currentLang]['remove-from-favorites'];
                    } else {
                        favoriteIcon.classList.remove('favorited');
                        favoriteIcon.innerHTML = '☆';
                        favoriteIcon.title = translations[currentLang]['add-to-favorites'];
                    }
                });

                overlay.appendChild(favoriteIcon);
                channelItem.appendChild(overlay);
            } else {
                const logoContainer = document.createElement('div');
                logoContainer.style.width = '80px';
                logoContainer.style.height = '50px';
                logoContainer.style.flexShrink = '0';
                logoContainer.style.marginRight = '15px';
                logoContainer.style.borderRadius = '4px';
                logoContainer.style.background = 'rgba(0, 0, 0, 0.3)';
                logoContainer.style.display = 'flex';
                logoContainer.style.alignItems = 'center';
                logoContainer.style.justifyContent = 'center';
                logoContainer.style.overflow = 'hidden';

                const logoImg = document.createElement('img');
                logoImg.alt = channel.name;
                logoImg.style.width = '100%';
                logoImg.style.height = '100%';
                logoImg.style.objectFit = 'contain';
                logoImg.style.objectPosition = 'center';

                if (channel.logo) {
                    logoImg.src = channel.logo;
                } else {
                    logoImg.src = PLACEHOLDER_IMG;
                }

                logoImg.onerror = function() {
                    this.onerror = null;
                    this.src = PLACEHOLDER_IMG;
                };

                logoContainer.appendChild(logoImg);
                channelItem.appendChild(logoContainer);

                const nameSpan = document.createElement('span');
                nameSpan.className = 'channel-name';
                setChannelName(nameSpan, channel);
                channelItem.appendChild(nameSpan);

                const favoriteIcon = document.createElement('span');
                favoriteIcon.className = 'favorite-icon';
                favoriteIcon.innerHTML = '☆';
                favoriteIcon.title = translations[currentLang]['add-to-favorites'];
                favoriteIcon.dataset.channelId = channel.id || channel.stream_id;
                favoriteIcon.tabIndex = -1;

                const channelId = channel.id || channel.stream_id;
                if (channelId && isFavorite(channelId)) {
                    favoriteIcon.classList.add('favorited');
                    favoriteIcon.innerHTML = '★';
                    favoriteIcon.title = translations[currentLang]['remove-from-favorites'];
                }

                favoriteIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const added = toggleFavorite(channelId);
                    if (added) {
                        favoriteIcon.classList.add('favorited');
                        favoriteIcon.innerHTML = '★';
                        favoriteIcon.title = translations[currentLang]['remove-from-favorites'];
                    } else {
                        favoriteIcon.classList.remove('favorited');
                        favoriteIcon.innerHTML = '☆';
                        favoriteIcon.title = translations[currentLang]['add-to-favorites'];
                    }
                });

                channelItem.appendChild(favoriteIcon);
            }

            channelItem.addEventListener('click', () => {
                playChannel(channelItem);
            });

            channelList.appendChild(channelItem);
        });

        const savedIndex = parseInt(localStorage.getItem('selectedChannelIndex')) || 0;
        const channelItems = channelList.querySelectorAll('.channel-item');
        const channelToFocus = channelItems[savedIndex] || channelItems[0];

        // while typing in the search box the focus must stay in the box (otherwise the on-screen keyboard closes)
        if (channelToFocus && !keepFocus) {
            channelToFocus.classList.add('focused');
            channelToFocus.focus();
            activeZone = 'channels';
        }
    }
    
    function parseM3U(content) {
        const lines = content.split('\n');
        const channelsByCategory = {};
        let currentChannel = null;
        let channelIndex = 0;

        // Regular expressions for parsing M3U
        const groupTitleRegex = /group-title="([^"]*)"/i;
        const channelNameRegex = /,(.*)$/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('#EXTINF')) {
                // Extract category name from group-title
                const groupTitleMatch = line.match(groupTitleRegex);
                const category = groupTitleMatch ? groupTitleMatch[1] : 'Uncategorized';

                // Extract channel name (everything after the last comma)
                const channelNameMatch = line.match(channelNameRegex);
                const name = channelNameMatch ? channelNameMatch[1].trim() : 'Unknown Channel';

                currentChannel = {
                    id: null, // Will be set when URL is known
                    name: name,
                    category: category,
                    url: ''
                };
            } else if (line && !line.startsWith('#') && currentChannel) {
                // This is the stream URL
                currentChannel.url = line;
                // Generate ID from URL hash for consistency
                currentChannel.id = btoa(line).substring(0, 16);

                // Add channel to the appropriate category
                if (!channelsByCategory[currentChannel.category]) {
                    channelsByCategory[currentChannel.category] = [];
                }
                channelsByCategory[currentChannel.category].push(currentChannel);

                // Also add to allStreamsCache
                allStreamsCache.push(currentChannel);

                currentChannel = null;
                channelIndex++;
            }
        }

        return channelsByCategory;
    }
    
    async function fetchCategories(serverUrl, username, password) {
        // Show loading indicator with connecting status
        loadingIndicator.style.display = 'block';
        loadingIndicator.querySelector('p').textContent = 'Kategoriler yükleniyor...';
        errorMessage.style.display = 'none';
        connectBtn.disabled = true;

        try {
            // Construct Xtream JSON API URL for categories based on content type
            let action;
            if (currentContentType === 'live') {
                action = 'get_live_categories';
            } else if (currentContentType === 'movies') {
                action = 'get_vod_categories';
            } else if (currentContentType === 'series') {
                action = 'get_series_categories';
            }

            const apiUrl = serverUrl + '/player_api.php?username=' + username + '&password=' + password + '&action=' + action;
            const response = await fetch(apiUrl);

            if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
            }

            const data = await response.json();

            if (!Array.isArray(data) || data.length === 0) {
                showError('Kategori listesi boş veya geçersiz');
                return;
            }

            showCategories(data);

            // Set hash to channels view after successful login
            window.location.hash = '#channels';

        } catch (error) {
            showError('Bağlantı hatası: ' + error.message);
        } finally {
            loadingIndicator.style.display = 'none';
            loadingIndicator.querySelector('p').textContent = 'Yükleniyor...';
            connectBtn.disabled = false;
        }
    }

    // ---- Playback position, "watched" marks, last episode of a series ----
    // Keys are built from the stream's type and id only (never from the address), because the address contains
    // the account name and password.
    const WATCHED_KEY = 'watchedIds';
    const LAST_EPISODE_KEY = 'lastEpisodes';
    const PROGRESS_SAVE_INTERVAL = 5000;   // ms; it used to be written about four times a second
    let lastProgressWrite = 0;
    let suggestedEpisodeId = null;

    function streamRef(url) {
        const m = /\/(movie|series)\/[^\/]+\/[^\/]+\/(\d+)\.\w+/.exec(url || '');
        return m ? { type: m[1], id: m[2] } : null;
    }

    function progressKey(url) {
        const ref = streamRef(url);
        return 'progress_' + (ref ? '/' + ref.type + '/' + ref.id : url);
    }

    function readProgress(url) {
        const v = localStorage.getItem(progressKey(url));
        return v !== null ? v : localStorage.getItem('progress_' + url); // old format, written by earlier versions
    }

    function removeProgress(url) {
        localStorage.removeItem(progressKey(url));
        localStorage.removeItem('progress_' + url);
    }

    function readJsonStore(key) {
        try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
    }

    function writeJsonStore(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota */ }
    }

    function isWatched(type, id) {
        return !!readJsonStore(WATCHED_KEY)[type + '/' + id];
    }

    function markWatched(url) {
        const ref = streamRef(url);
        if (!ref) return;
        const watched = readJsonStore(WATCHED_KEY);
        delete watched[ref.type + '/' + ref.id];
        watched[ref.type + '/' + ref.id] = 1;               // newest last
        const keys = Object.keys(watched);
        while (keys.length > 3000) delete watched[keys.shift()];
        writeJsonStore(WATCHED_KEY, watched);
    }

    function rememberLastEpisode(seriesId, season, episodeId) {
        if (!seriesId || episodeId == null) return;
        const all = readJsonStore(LAST_EPISODE_KEY);
        delete all[seriesId];
        all[seriesId] = { season: season, id: episodeId };
        const keys = Object.keys(all);
        while (keys.length > 200) delete all[keys.shift()];
        writeJsonStore(LAST_EPISODE_KEY, all);
    }

    // The episode to offer when a series is opened: the one that was playing, or the next one if it was finished
    function suggestEpisode(seriesId, episodes) {
        const last = readJsonStore(LAST_EPISODE_KEY)[seriesId];
        if (!last || !episodes) return null;
        let idx = episodes.findIndex(e => String(e.id) === String(last.id));
        if (idx === -1) return null;
        if (isWatched('series', last.id) && idx + 1 < episodes.length) idx++;
        return episodes[idx];
    }

    // Called while playing (rate limited), when pausing and when leaving the player
    function saveProgress(force) {
        if (!currentStreamUrl || isLiveStreamUrl(currentStreamUrl)) return;
        const time = videoPlayer.currentTime;
        if (!(time > 10)) return;
        const now = Date.now();
        if (!force && now - lastProgressWrite < PROGRESS_SAVE_INTERVAL) return;
        lastProgressWrite = now;
        try { localStorage.setItem(progressKey(currentStreamUrl), time); } catch (e) { /* quota */ }
        localStorage.removeItem('progress_' + currentStreamUrl);
        const duration = videoPlayer.duration;
        if (isFinite(duration) && duration > 0 && time / duration >= 0.92) markWatched(currentStreamUrl);
        if (currentContinueItem && currentContinueItem.type === 'series' && currentSeriesInfo && currentSeriesInfo.episodes && currentEpisodeIndex >= 0) {
            const ep = currentSeriesInfo.episodes[currentEpisodeIndex];
            if (ep) rememberLastEpisode(currentContinueItem.item.series_id, ep.season, ep.id);
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { saveProgress(true); updateContinueEntry(true); }
    });

    // ---- Continue watching + recently added ----
    const CONTINUE_KEY = 'continueWatching';
    const CONTINUE_MAX = 20;
    let currentVodModalItem = null;   // movie / series item shown in the details window
    let currentContinueItem = null;   // item being played (null for live TV)
    let lastContinueSave = 0;

    function readContinue() {
        try { return JSON.parse(localStorage.getItem(CONTINUE_KEY)) || []; } catch (e) { return []; }
    }

    function writeContinue(list) {
        try { localStorage.setItem(CONTINUE_KEY, JSON.stringify(list.slice(0, CONTINUE_MAX))); } catch (e) { /* quota */ }
    }

    function removeContinueEntry() {
        if (!currentContinueItem) return;
        const key = currentContinueItem.type + ':' + currentContinueItem.item.id;
        writeContinue(readContinue().filter(e => e.key !== key));
    }

    function updateContinueEntry(force) {
        if (!currentContinueItem) return;
        const now = Date.now();
        if (!force && now - lastContinueSave < 15000) return;
        const duration = videoPlayer.duration;
        const time = videoPlayer.currentTime;
        if (!isFinite(duration) || duration <= 0 || time < 30) return;
        if (time / duration > 0.95) {
            removeContinueEntry();
            return;
        }
        lastContinueSave = now;
        const it = currentContinueItem.item;
        let label = '';
        if (currentContinueItem.type === 'series' && currentSeriesInfo && currentSeriesInfo.episodes && currentEpisodeIndex >= 0) {
            const ep = currentSeriesInfo.episodes[currentEpisodeIndex];
            if (ep && ep.name) label = String(ep.name).split(' - ')[0];
        }
        const key = currentContinueItem.type + ':' + it.id;
        const entry = {
            key: key,
            type: currentContinueItem.type,
            item: { id: it.id, name: it.name, logo: it.logo || null, url: null, ext: (/\.(\w+)$/.exec(it.url || '') || [])[1] || null, series_id: it.series_id || null,
                    plot: it.plot || null, rating: it.rating || null, year: it.year || null, backdrop_path: it.backdrop_path || null },
            label: label,
            t: Math.floor(time),
            dur: Math.floor(duration),
            ts: now
        };
        const list = readContinue().filter(e => e.key !== key);
        list.unshift(entry);
        writeContinue(list);
    }

    function showContinueWatching() {
        const entries = readContinue().filter(e => e.type === currentContentType);
        const items = entries.map(e => {
            const pct = e.dur > 0 ? Math.round(e.t / e.dur * 100) : 0;
            const item = Object.assign({}, e.item, { badge: (e.label ? e.label + ' · ' : '') + '%' + pct });
            if (!item.url && item.ext && e.type === 'movies') { // rebuild the address from the current login
                item.url = localStorage.getItem('xtream_server') + '/movie/' + localStorage.getItem('xtream_username') + '/' +
                    localStorage.getItem('xtream_password') + '/' + item.id + '.' + item.ext;
            }
            return item;
        });
        showChannelList(items);
        if (items.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.textContent = currentLang === 'en' ? 'Nothing to continue yet' : 'Devam edilecek içerik yok';
            channelList.appendChild(emptyState);
        }
    }

    async function showRecentChannels(serverUrl, username, password) {
        loadingIndicator.style.display = 'block';
        loadingIndicator.querySelector('p').textContent = 'Kanallar yükleniyor...';
        errorMessage.style.display = 'none';
        try {
            const action = currentContentType === 'series' ? 'get_series' : 'get_vod_streams';
            const data = await getCatalog(serverUrl, username, password, action);
            if (!Array.isArray(data) || data.length === 0) {
                showChannelList([]);
                return;
            }
            allStreamsCache = data.map(item => mapStreamItem(item, serverUrl, username, password));
            const recent = allStreamsCache.filter(x => x.added > 0).sort((a, b) => b.added - a.added).slice(0, 100);
            showChannelList(recent);
        } catch (error) {
            showError('Bağlantı hatası: ' + error.message);
        } finally {
            loadingIndicator.style.display = 'none';
            loadingIndicator.querySelector('p').textContent = 'Yükleniyor...';
        }
    }

    // Channel name, with an optional small badge (e.g. "S1 E3 · %42" in the continue list)
    function setChannelName(nameSpan, channel) {
        nameSpan.textContent = channel.name;
        if (channel.badge) {
            const badge = document.createElement('span');
            badge.className = 'channel-badge';
            badge.textContent = channel.badge;
            nameSpan.appendChild(badge);
        }
        if (channel.epgId) applyEpgToName(nameSpan, channel.epgId);
        if (channel.url && channel.url.indexOf('/movie/') !== -1 && isWatched('movie', channel.id)) {
            const mark = document.createElement('span');
            mark.className = 'watched-mark-inline';
            mark.textContent = '✓';
            mark.title = currentLang === 'en' ? 'Watched' : 'İzlendi';
            nameSpan.appendChild(mark);
        }
    }

    // Turn one Xtream list entry (live stream / movie / series) into the item format used by the UI
    function mapStreamItem(item, serverUrl, username, password) {
        if (currentContentType === 'series') {
            return {
                id: item.series_id,
                name: item.name,
                series_id: item.series_id,
                // get_series sends the poster as `cover` (live/movie lists use `stream_icon`)
                logo: item.cover || item.stream_icon || null,
                plot: item.plot || null,
                rating: parseFloat(item.rating) > 0 ? String(parseFloat(item.rating).toFixed(1)) : null,
                year: item.year || (item.releaseDate || item.release_date ? String(item.releaseDate || item.release_date).substring(0, 4) : null),
                backdrop_path: Array.isArray(item.backdrop_path) ? (item.backdrop_path[0] || null) : (item.backdrop_path || null),
                added: parseInt(item.last_modified, 10) || 0,
                url: null // set when the user selects a series
            };
        }
        let url;
        if (currentContentType === 'live') {
            url = serverUrl + '/live/' + username + '/' + password + '/' + item.stream_id + '.m3u8';
        } else {
            const containerExtension = item.container_extension || 'mp4';
            url = serverUrl + '/movie/' + username + '/' + password + '/' + item.stream_id + '.' + containerExtension;
        }
        return {
            id: item.stream_id,
            name: item.name,
            logo: item.stream_icon || null,
            added: parseInt(item.added, 10) || 0,
            epgId: item.epg_channel_id || null,
            url: url
        };
    }

    async function fetchAllStreamsForFavorites(serverUrl, username, password) {
        // Show loading indicator
        loadingIndicator.style.display = 'block';
        loadingIndicator.querySelector('p').textContent = 'Kanallar yükleniyor...';
        errorMessage.style.display = 'none';

        try {
            // Construct Xtream JSON API URL for streams based on content type
            let action;
            if (currentContentType === 'live') {
                action = 'get_live_streams';
            } else if (currentContentType === 'movies') {
                action = 'get_vod_streams';
            } else if (currentContentType === 'series') {
                action = 'get_series';
            }

            const data = await getCatalog(serverUrl, username, password, action);

            if (!Array.isArray(data) || data.length === 0) {
                showChannelList([]);
                return;
            }

            // Map Xtream JSON objects to our channel format
            allStreamsCache = data.map(item => mapStreamItem(item, serverUrl, username, password));

            showChannelList(allStreamsCache);

        } catch (error) {
            showError('Bağlantı hatası: ' + error.message);
        } finally {
            loadingIndicator.style.display = 'none';
            loadingIndicator.querySelector('p').textContent = 'Yükleniyor...';
        }
    }

    async function fetchChannelsByCategory(serverUrl, username, password, categoryId) {
        // Show loading indicator
        loadingIndicator.style.display = 'block';
        loadingIndicator.querySelector('p').textContent = 'Kanallar yükleniyor...';
        errorMessage.style.display = 'none';

        try {
            // Construct Xtream JSON API URL for streams based on content type
            let action;
            if (currentContentType === 'live') {
                action = 'get_live_streams';
            } else if (currentContentType === 'movies') {
                action = 'get_vod_streams';
            } else if (currentContentType === 'series') {
                action = 'get_series';
            }

            const apiUrl = serverUrl + '/player_api.php?username=' + username + '&password=' + password + '&action=' + action + '&category_id=' + categoryId;
            const response = await fetch(apiUrl);

            if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
            }

            const data = await response.json();

            if (!Array.isArray(data) || data.length === 0) {
                showError('Bu kategoride içerik bulunamadı');
                return;
            }

            // Map Xtream JSON objects to our channel format with URL construction based on content type
            const channels = data.map(item => mapStreamItem(item, serverUrl, username, password));

            channels.forEach(channel => {
                if (channel.stream_id) {
                    channel.id = channel.stream_id;
                }
                const existingIndex = allStreamsCache.findIndex(c => c.id === channel.id);
                if (existingIndex > -1) {
                    allStreamsCache[existingIndex] = channel;
                } else {
                    allStreamsCache.push(channel);
                }
            });
            showChannelList(channels);

        } catch (error) {
            showError('Bağlantı hatası: ' + error.message);
        } finally {
            loadingIndicator.style.display = 'none';
            loadingIndicator.querySelector('p').textContent = 'Yükleniyor...';
        }
    }

    async function fetchSeriesInfo(seriesId) {
        const serverUrl = localStorage.getItem('xtream_server');
        const username = localStorage.getItem('xtream_username');
        const password = localStorage.getItem('xtream_password');

        if (!serverUrl || !username || !password) {
            showError('Connection credentials not found');
            loadingIndicator.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(serverUrl + '/player_api.php?username=' + username + '&password=' + password + '&action=get_series_info&series_id=' + seriesId);

            if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
            }

            const data = await response.json();

            if (data && data.subtitles && Array.isArray(data.subtitles)) {
                window.currentSubtitles = data.subtitles;
            } else {
                window.currentSubtitles = null;
            }

            if (!data || !data.episodes) {
                showError('No episodes found for this series');
                loadingIndicator.style.display = 'none';
                return;
            }

            // Flatten episodes structure
            const episodes = [];
            const episodesObj = data.episodes;
            const seriesTitle = data.name || 'Series';

            // Iterate through seasons (keys are season numbers)
            for (const seasonKey in episodesObj) {
                const seasonEpisodes = episodesObj[seasonKey];
                if (Array.isArray(seasonEpisodes)) {
                    seasonEpisodes.forEach(episode => {
                        // Format episode name: S1 E1 - Title
                        const seasonNum = episode.season || seasonKey;
                        const episodeNum = episode.episode_num || '1';
                        const title = episode.title || 'Episode';
                        const formattedName = 'S' + seasonNum + ' E' + episodeNum + ' - ' + title;

                        // Construct playable URL
                        const containerExtension = episode.container_extension || 'mp4';
                        const url = serverUrl + '/series/' + username + '/' + password + '/' + episode.id + '.' + containerExtension;

                        episodes.push({
                            name: formattedName,
                            logo: data.cover || null,
                            url: url,
                            seriesTitle: seriesTitle,
                            season: parseInt(seasonNum),
                            episode: parseInt(episodeNum),
                            season_num: parseInt(seasonNum),
                            episode_num: parseInt(episodeNum),
                            id: episode.id,
                            imdb_id: data.imdb_id || episode.imdb_id,
                            tmdb_id: data.tmdb_id || episode.tmdb_id,
                            year: data.year || episode.year,
                            info: data.info || episode.info
                        });
                    });
                }
            }

            if (episodes.length === 0) {
                showError('No episodes available');
                loadingIndicator.style.display = 'none';
                return;
            }

            // Store series info globally for metadata-first subtitle fetching
            currentSeriesInfo = {
                info: data.info || data,
                seasons: data.seasons,
                episodes: episodes,
                name: seriesTitle,
                cover: data.cover || (data.info && data.info.cover) || null,
                plot: data.plot || data.info,
                rating: data.rating,
                year: data.year
            };

            return currentSeriesInfo;

        } catch (error) {
            showError('Bağlantı hatası: ' + error.message);
            return null;
        } finally {
            loadingIndicator.style.display = 'none';
            loadingIndicator.querySelector('p').textContent = 'Yükleniyor...';
        }
    }

    // Full catalog (all movies / series / channels) is big: reuse it for 5 minutes instead of asking the server every time
    const searchDataCache = {}; // content type -> {time, data}
    async function getCatalog(serverUrl, username, password, action) {
        const cached = searchDataCache[currentContentType];
        if (cached && Date.now() - cached.time < 5 * 60 * 1000) return cached.data;
        const response = await fetch(serverUrl + '/player_api.php?username=' + username + '&password=' + password + '&action=' + action);
        if (!response.ok) {
            throw new Error('HTTP error! status: ' + response.status);
        }
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            searchDataCache[currentContentType] = { time: Date.now(), data: data };
        }
        return data;
    }

    async function activateSearch() {
        const serverUrl = localStorage.getItem('xtream_server');
        const username = localStorage.getItem('xtream_username');
        const password = localStorage.getItem('xtream_password');

        if (!serverUrl || !username || !password) {
            showError('Connection credentials not found');
            return;
        }

        // Set search mode
        isSearchActive = true;
        activeZone = 'search';

        // Hide sidebar, expand right pane to 100%
        sidebar.style.display = 'none';
        document.getElementById('content-wrapper').style.justifyContent = 'flex-end';

        // Show search container
        searchContainer.style.display = 'block';

        // Show loading indicator
        loadingIndicator.style.display = 'block';
        loadingIndicator.querySelector('p').textContent = 'Streams yükleniyor...';
        errorMessage.style.display = 'none';

        try {
            let action;
            if (currentContentType === 'live') {
                action = 'get_live_streams';
            } else if (currentContentType === 'movies') {
                action = 'get_vod_streams';
            } else if (currentContentType === 'series') {
                action = 'get_series';
            }

            const data = await getCatalog(serverUrl, username, password, action);

            if (!Array.isArray(data) || data.length === 0) {
                showError('No streams found');
                loadingIndicator.style.display = 'none';
                return;
            }

            // Map streams to our format (same logic as fetchChannelsByCategory)
            allStreamsCache = data.map(item => mapStreamItem(item, serverUrl, username, password));

            showChannelList(allStreamsCache.slice(0, 200));

            searchInput.value = '';
            searchInput.focus();

        } catch (error) {
            showError('Bağlantı hatası: ' + error.message);
        } finally {
            loadingIndicator.style.display = 'none';
            loadingIndicator.querySelector('p').textContent = 'Yükleniyor...';
        }
    }

    function handleSearchInput(e) {
        const query = e.target.value.toLowerCase().trim();

        if (query === '') {
            // Show all cached streams (limited to 200)
            showChannelList(allStreamsCache.slice(0, 200), true);
            return;
        }

        // Filter streams by name (case-insensitive)
        const filtered = allStreamsCache.filter(stream =>
            stream.name.toLowerCase().includes(query)
        );

        // Limit results to 200 for performance
        showChannelList(filtered.slice(0, 200), true);
    }

    function exitSearch() {
        isSearchActive = false;
        allStreamsCache = [];

        // Hide search container
        searchContainer.style.display = 'none';

        // Show sidebar
        sidebar.style.display = 'flex';
        document.getElementById('content-wrapper').style.justifyContent = 'flex-start';

        // Clear search input
        searchInput.value = '';

        // Reload normal categories
        const serverUrl = localStorage.getItem('xtream_server');
        const username = localStorage.getItem('xtream_username');
        const password = localStorage.getItem('xtream_password');
        if (serverUrl && username && password) {
            fetchCategories(serverUrl, username, password);
        }
    }

    async function fetchAndParseM3U(url) {
        // Show loading indicator with connecting status
        loadingIndicator.style.display = 'block';
        loadingIndicator.querySelector('p').textContent = 'Bağlanıyor...';
        errorMessage.style.display = 'none';
        connectBtn.disabled = true;

        try {
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
            }

            const content = await response.text();
            m3uChannelsByCategory = parseM3U(content);
            const categoryNames = Object.keys(m3uChannelsByCategory);

            if (categoryNames.length === 0) {
                showError('Playlist yüklenemedi - kategori bulunamadı');
                return;
            }

            // Render M3U categories into sidebar
            showM3UCategories(categoryNames);

            // Set hash to channels view after successful M3U load
            window.location.hash = '#channels';

        } catch (error) {
            showError('Bağlantı hatası: ' + error.message);
        } finally {
            loadingIndicator.style.display = 'none';
            loadingIndicator.querySelector('p').textContent = 'Yükleniyor...';
            connectBtn.disabled = false;
        }
    }

    function showM3UCategories(categoryNames) {
        loginContainer.style.display = 'none';
        mainContent.style.display = 'flex';
        sidebar.style.display = 'flex';
        channelList.style.display = 'flex';

        // Clear existing categories
        sidebar.innerHTML = '';

        // Add Favorites category at the top
        const favoritesItem = document.createElement('div');
        favoritesItem.className = 'category-item';
        favoritesItem.dataset.categoryName = 'favorites';
        favoritesItem.dataset.isFavorites = 'true';
        favoritesItem.tabIndex = 0;
        favoritesItem.innerHTML = '<span class="cat-name">' + translations[currentLang]['category-favorites'] + '</span><span class="cat-count">' + favorites.length + '</span>';

        // Add click event listener for Favorites
        favoritesItem.addEventListener('click', () => {
            selectM3UCategory(favoritesItem);
        });

        sidebar.appendChild(favoritesItem);

        // Render categories
        categoryNames.forEach((categoryName, index) => {
            const categoryItem = document.createElement('div');
            categoryItem.className = 'category-item';
            categoryItem.dataset.categoryName = categoryName;
            categoryItem.tabIndex = 0;

            const count = m3uChannelsByCategory[categoryName] ? m3uChannelsByCategory[categoryName].length : 0;
            categoryItem.innerHTML = '<span class="cat-name">' + categoryName + '</span><span class="cat-count">' + count + '</span>';

            // Add click event listener
            categoryItem.addEventListener('click', () => {
                selectM3UCategory(categoryItem);
            });

            sidebar.appendChild(categoryItem);
        });

        const categoryItems = sidebar.querySelectorAll('.category-item');
        if (categoryItems.length > 0) {
            categoryItems[0].classList.add('focused');
            categoryItems[0].classList.add('active');
            categoryItems[0].focus();
            activeCategoryId = categoryItems[0].dataset.categoryName;
            activeZone = 'sidebar';

            selectM3UCategory(categoryItems[0]);
        }
    }

    function selectM3UCategory(categoryItem) {
        const allCategories = sidebar.querySelectorAll('.category-item');
        allCategories.forEach(cat => cat.classList.remove('active'));

        categoryItem.classList.add('active');
        categoryItem.classList.add('focused');
        categoryItem.focus();

        activeCategoryId = categoryItem.dataset.categoryName;

        if (categoryItem.dataset.isFavorites === 'true') {
            showChannelList(allStreamsCache);
            return;
        }
        localStorage.setItem('activeCategoryId', activeCategoryId);

        // Get channels for this category from the grouped data
        const categoryName = categoryItem.dataset.categoryName;
        const channels = m3uChannelsByCategory[categoryName] || [];
        showChannelList(channels);
    }
    
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }
    
    function cleanupOldProgress() {
        const progressKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('progress_')) {
                progressKeys.push(key);
            }
        }

        if (progressKeys.length > 50) {
            const keysToDelete = progressKeys.slice(0, 20);
            for (let i = 0; i < keysToDelete.length; i++) {
                localStorage.removeItem(keysToDelete[i]);
            }
        }
    }

    function loadCredentials() {
        const xtreamServer = localStorage.getItem('xtream_server');
        const xtreamUsername = localStorage.getItem('xtream_username');
        const xtreamPassword = localStorage.getItem('xtream_password');
        const m3uPlaylist = localStorage.getItem('m3u_playlist');

        if (xtreamServer) serverUrlInput.value = xtreamServer;
        if (xtreamUsername) usernameInput.value = xtreamUsername;
        if (xtreamPassword) passwordInput.value = xtreamPassword;
        if (m3uPlaylist) playlistUrlInput.value = m3uPlaylist;
    }
    
    function playStream(url, activeItem = null, seriesInfo = null) {
        if (!url) {
            return;
        }
        playbackActive = true;

        // Stop any currently playing video first (but don't hide container yet)
        if (hls) {
            hls.destroy();
            hls = null;
        }
        videoPlayer.pause();
        videoPlayer.src = '';

        // Hide next episode overlay if it's showing
        hideNextEpisodeOverlay();

        // Remove all existing subtitle tracks from video element
        const allSubtitleTracks = videoPlayer.querySelectorAll('track[kind="subtitles"]');
        allSubtitleTracks.forEach(track => track.remove());

        // Clean up previous blob URLs
        cleanupBlobUrls();

        // Reset subtitle sync offset for new stream
        currentSubOffset = 0;

        if (activeZone === 'guide') closeGuide();
        if (activeZone === 'chpanel') closeChannelPanel();

        // Live TV: remember the last two channels for the "last channel" key
        if (url.includes('/live/') || url.includes('.m3u8')) {
            if (!currentLiveChannel || currentLiveChannel.url !== url) {
                if (currentLiveChannel) previousLiveChannel = currentLiveChannel;
                currentLiveChannel = { url: url, item: activeItem };
            }
        }

        // Remember which movie/series this is, for the "Continue watching" list (live TV is not tracked)
        currentContinueItem = (!url.includes('.m3u8') && currentVodModalItem) ? { item: currentVodModalItem, type: currentContentType } : null;
        lastContinueSave = 0;

        // Save current stream URL for progress tracking
        currentStreamUrl = url;
        localStorage.setItem('currentStreamUrl', url);

        // Track current episode index for series
        if (seriesInfo && seriesInfo.episodes && activeItem) {
            currentEpisodeIndex = seriesInfo.episodes.findIndex(ep => ep.url === url);
        } else {
            currentEpisodeIndex = -1;
        }

        // Fetch external subtitle using Subdl API if metadata is provided
        if (activeItem && /\/(movie|series)\//.test(url) && (SUBTITLE_API_KEY || OPEN_SUBTITLES_API_KEY)) {
            fetchAndInjectExternalSubtitle(activeItem, seriesInfo);
        }

        // Set video title in custom OSD
        const osdVideoTitle = document.getElementById('osd-video-title');
        if (osdVideoTitle && activeItem) {
            osdVideoTitle.textContent = activeItem.name || activeItem.title || 'Yükleniyor...';
        }
        refreshLiveOsdTitle();

        const isVOD = !url.includes('.m3u8');
        if (isVOD) {
            const savedProgress = readProgress(url);
            if (savedProgress && parseFloat(savedProgress) > 10) {
                // Show resume modal instead of playing immediately
                videoPlayer.src = url;

                // Format time as HH:MM:SS
                const savedTime = parseFloat(savedProgress);
                const hours = Math.floor(savedTime / 3600);
                const minutes = Math.floor((savedTime % 3600) / 60);
                const seconds = Math.floor(savedTime % 60);
                const formattedTime = hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');

                resumeTimeSpan.textContent = formattedTime;
                pendingResumeTime = savedTime;

                resumeModal.style.display = 'flex';
                activeZone = 'resume-modal';

                // Focus resume button
                btnResume.classList.add('focused');
                btnRestart.classList.remove('focused');
                btnResume.focus();

                return;
            }
        }

        // Show the player view (also when the hash is already #player, which would not fire a hashchange)
        enterPlayerView();

        const isM3U8 = url.includes('.m3u8');

        if (isM3U8) {
            // Use HLS.js for M3U8 streams
            if (Hls.isSupported()) {
                if (hls) {
                    hls.destroy();
                }
                hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(videoPlayer);

                hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    activeZone = 'player';
                    if (isLiveStreamUrl(url)) showCustomOSD(false, 4000); // channel banner, hides itself
                    videoPlayer.play().catch(err => console.log('Play interrupted:', err));
                    isEnteringPlayer = true;
                    setTimeout(() => isEnteringPlayer = false, 300);
                });

                // Detect and populate audio/subtitle tracks when metadata is loaded
                videoPlayer.addEventListener('loadedmetadata', populateOSDTracks, { once: true });
                hls.on(Hls.Events.ERROR, function(event, data) {
                    console.error('HLS Error:', data);

                    // Handle fatal errors (network errors, 404, etc.)
                    if (data.fatal) {
                        // Destroy HLS instance to stop retrying
                        if (hls) {
                            hls.destroy();
                            hls = null;
                        }

                        // Show user-friendly error message
                        showError('Stream is currently unavailable or offline');

                        // Auto-hide error message after 4 seconds
                        setTimeout(() => {
                            errorMessage.style.display = 'none';
                        }, 4000);

                        // Return to channel list
                        window.location.hash = '#channels';
                    }
                });
            } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS support (Safari)
                videoPlayer.src = url;
                videoPlayer.addEventListener('loadedmetadata', function() {
                    activeZone = 'player';
                    videoPlayer.play().catch(err => console.log('Play interrupted:', err));
                    isEnteringPlayer = true;
                    setTimeout(() => isEnteringPlayer = false, 300);
                });

                // Detect and populate audio/subtitle tracks when metadata is loaded
                videoPlayer.addEventListener('loadedmetadata', populateOSDTracks, { once: true });

                // Handle native video errors
                videoPlayer.addEventListener('error', function() {
                    showError('Stream is currently unavailable or offline');

                    // Auto-hide error message after 4 seconds
                    setTimeout(() => {
                        errorMessage.style.display = 'none';
                    }, 4000);

                    // Return to channel list
                    window.location.hash = '#channels';
                });
            }
        } else {
            // Direct video file (mp4, mkv, avi, etc.) - use native playback
            // Destroy any existing HLS instance
            if (hls) {
                hls.destroy();
                hls = null;
            }

            // Set source directly to native video player
            videoPlayer.src = url;

            // Detect and populate audio/subtitle tracks when metadata is loaded
            videoPlayer.addEventListener('loadedmetadata', populateOSDTracks, { once: true });

            videoPlayer.addEventListener('error', function() {
                showError('Stream is currently unavailable or offline');

                // Auto-hide error message after 4 seconds
                setTimeout(() => {
                    errorMessage.style.display = 'none';
                }, 4000);

                // Return to channel list
                window.location.hash = '#channels';
            }, { once: true });

            // Play the video
            activeZone = 'player';
            videoPlayer.play().then(() => {
                // Show the player view after the video starts
                isEnteringPlayer = true;
                enterPlayerView();
                setTimeout(() => isEnteringPlayer = false, 300);
            }).catch(error => {
                showError('Stream is currently unavailable or offline');
                setTimeout(() => {
                    errorMessage.style.display = 'none';
                }, 4000);
                window.location.hash = '#channels';
            });
        }
    }
    
    function showVODModal(channelElement, channelData) {
        let activeItem = channelData;
        if (!activeItem && channelElement.dataset.channelData) {
            try {
                activeItem = JSON.parse(channelElement.dataset.channelData);
            } catch (e) {
                activeItem = null;
            }
        }

        if (!activeItem) {
            return;
        }
        currentVodModalItem = activeItem;

        const isSeries = channelElement.dataset.seriesId && channelElement.dataset.seriesId !== 'undefined';
        const parsed = parseStreamTitle(activeItem.name || activeItem.title || '');
        
        vodTitle.textContent = '';
        vodYear.textContent = '';
        vodRating.textContent = '';
        vodPlot.textContent = '';
        vodDuration.textContent = '';
        vodGenres.textContent = '';
        vodCredits.textContent = '';
        vodPoster.src = PLACEHOLDER_IMG;
        vodModalBackdrop.style.backgroundImage = '';
        modalEpisodesSlider.innerHTML = '';

        // Movies: metadata straight from the server through get_vod_info
        const useVodInfo = !isSeries && activeItem.id != null && activeItem.url;
        const metaToken = ++vodMetaToken;

        if (!isSeries) {
            currentSeriesInfo = null;
            window.currentSubtitles = null;
        }
        
        vodTitle.textContent = (activeItem.name || activeItem.title || '') +
            (activeItem.url && activeItem.url.indexOf('/movie/') !== -1 && isWatched('movie', activeItem.id) ? '  ✓' : '');
        
        const hasXtreamDetails = activeItem.plot || activeItem.description || activeItem.rating || activeItem.year;
        
        if (hasXtreamDetails) {
            vodYear.textContent = activeItem.year || (parsed.year ? parsed.year : '');
            vodRating.textContent = activeItem.rating ? activeItem.rating : '';
            if (activeItem.plot || activeItem.description) {
                vodPlot.textContent = activeItem.plot || activeItem.description;
            } else {
                vodPlot.textContent = '';
            }
        } else {
            vodYear.textContent = parsed.year ? parsed.year : '';
            vodRating.textContent = '';
            vodPlot.textContent = '';
        }

        if (activeItem.poster_path) {
            vodPoster.src = activeItem.poster_path;
        } else if (activeItem.logo) {
            vodPoster.src = activeItem.logo;
        } else {
            vodPoster.src = PLACEHOLDER_IMG;
        }

        if (activeItem.backdrop_path) {
            vodModalBackdrop.style.backgroundImage = 'url(' + activeItem.backdrop_path + ')';
        } else if (activeItem.cover || activeItem.logo) {
            // no dedicated backdrop from the server: use the poster (the modal darkens it)
            vodModalBackdrop.style.backgroundImage = 'url(' + (activeItem.cover || activeItem.logo) + ')';
        } else {
            vodModalBackdrop.style.backgroundImage = 'url(' + PLACEHOLDER_IMG + ')';
        }

        if (useVodInfo) {
            fetchMovieMeta(activeItem.id).then(meta => {
                if (metaToken !== vodMetaToken) return; // another title was opened meanwhile
                if (!meta) return; // get_vod_info unavailable: keep what the list already gave us
                if (meta.year) vodYear.textContent = meta.year;
                if (meta.rating) vodRating.textContent = meta.rating;
                vodDuration.textContent = meta.duration || '';
                vodGenres.textContent = (meta.genres || []).join(' • ');
                if (meta.plot) vodPlot.textContent = meta.plot;
                const credits = [];
                if (meta.director) credits.push('Yönetmen: ' + meta.director);
                if (meta.cast && meta.cast.length) credits.push('Oyuncular: ' + meta.cast.join(', '));
                vodCredits.textContent = credits.join('  |  ');
                const poster = meta.poster;
                if (poster) vodPoster.src = poster;
                if (meta.backdrop) vodModalBackdrop.style.backgroundImage = 'url(' + meta.backdrop + ')';
            });
        }

        modalEpisodesSlider.innerHTML = '';
        
        if (isSeries) {
            vodPlayBtn.style.display = 'none';
            modalEpisodesContainer.style.display = 'block';
            
            loadingIndicator.style.display = 'block';
            loadingIndicator.querySelector('p').textContent = 'Bölümler yükleniyor...';
            
            fetchSeriesInfo(channelElement.dataset.seriesId).then(() => {
                loadingIndicator.style.display = 'none';

                // Series details the server sends with get_series_info (backdrop, plot, rating, genre, cast)
                if (currentSeriesInfo && metaToken === vodMetaToken) {
                    const si = (currentSeriesInfo.info && typeof currentSeriesInfo.info === 'object') ? currentSeriesInfo.info : {};
                    const backdrop = Array.isArray(si.backdrop_path) ? si.backdrop_path[0] : si.backdrop_path;
                    if (backdrop) vodModalBackdrop.style.backgroundImage = 'url(' + backdrop + ')';
                    if (!vodPlot.textContent && si.plot) vodPlot.textContent = si.plot;
                    if (!vodRating.textContent && parseFloat(si.rating) > 0) vodRating.textContent = parseFloat(si.rating).toFixed(1);
                    const released = si.releaseDate || si.release_date;
                    if (!vodYear.textContent && released) vodYear.textContent = String(released).substring(0, 4);
                    if (!vodGenres.textContent && si.genre) vodGenres.textContent = String(si.genre).split(/[,\/]/).map(g => g.trim()).filter(Boolean).slice(0, 3).join(' • ');
                    const credits = [];
                    if (si.director) credits.push('Yönetmen: ' + si.director);
                    if (si.cast) credits.push('Oyuncular: ' + String(si.cast).split(',').slice(0, 5).map(c => c.trim()).join(', '));
                    if (!vodCredits.textContent && credits.length) vodCredits.textContent = credits.join('  |  ');
                }
                
                // Store the main poster from modal as fallback
                const mainPosterSrc = vodPoster.src;
                
                if (currentSeriesInfo && currentSeriesInfo.episodes) {
                    // Group episodes by season
                    const episodesBySeason = {};
                    currentSeriesInfo.episodes.forEach(episode => {
                        const seasonNum = episode.season || 1;
                        if (!episodesBySeason[seasonNum]) {
                            episodesBySeason[seasonNum] = [];
                        }
                        episodesBySeason[seasonNum].push(episode);
                    });

                    // Create season selector
                    const seasonSelector = document.getElementById('season-selector');
                    seasonSelector.innerHTML = '';
                    
                    const seasonNumbers = Object.keys(episodesBySeason).sort((a, b) => parseInt(a) - parseInt(b));
                    const suggested = suggestEpisode(String(activeItem.series_id || activeItem.id), currentSeriesInfo.episodes);
                    suggestedEpisodeId = suggested ? suggested.id : null;
                    const startSeason = suggested && episodesBySeason[suggested.season] ? String(suggested.season) : seasonNumbers[0];
                    let firstSeason = true;

                    seasonNumbers.forEach(seasonNum => {
                        const seasonBtn = document.createElement('button');
                        seasonBtn.className = 'season-btn';
                        seasonBtn.textContent = 'Sezon ' + seasonNum;
                        seasonBtn.dataset.season = seasonNum;
                        seasonBtn.tabIndex = 0;

                        seasonBtn.addEventListener('click', () => {
                            // Remove active class from all buttons
                            seasonSelector.querySelectorAll('.season-btn').forEach(btn => btn.classList.remove('active'));
                            seasonBtn.classList.add('active');
                            // Render episodes for this season
                            renderEpisodesForSeason(episodesBySeason[seasonNum], mainPosterSrc, channelElement);
                        });

                        if (String(seasonNum) === String(startSeason) && firstSeason) {
                            seasonBtn.classList.add('active', 'focused');
                            seasonBtn.focus();
                            renderEpisodesForSeason(episodesBySeason[seasonNum], mainPosterSrc, channelElement);
                            firstSeason = false;
                        }

                        seasonSelector.appendChild(seasonBtn);
                    });
                }
            }).catch(error => {
                loadingIndicator.style.display = 'none';
                console.log('Series info fetch error:', error);
            });
        } else {
            modalEpisodesContainer.style.display = 'none';
        }

        // Show play button for non-series content
        if (!isSeries) {
            vodPlayBtn.style.display = 'block';
        }

        vodDetailsModal.style.display = 'block';
        activeZone = 'vod-modal';
        
        if (!isSeries) {
            vodPlayBtn.classList.add('focused');
            vodPlayBtn.focus();
        } else {
            // For series, focus on first season button
            const firstSeasonBtn = document.querySelector('.season-btn.focused');
            if (firstSeasonBtn) {
                firstSeasonBtn.focus();
            }
        }
        vodCloseBtn.classList.remove('focused');

        vodPlayBtn.onclick = function(e) {
            e.preventDefault();
            vodDetailsModal.style.display = 'none';
            const streamUrl = channelElement.dataset.url || channelElement.dataset.streamUrl;
            if (streamUrl) {
                lastFocusedChannel = channelElement;
                injectSubtitleTracks();
                const seriesInfo = currentSeriesInfo || null;
                const itemData = channelElement.dataset.channelData ? JSON.parse(channelElement.dataset.channelData) : activeItem;
                playStream(streamUrl, itemData, seriesInfo);
            }
        };

        vodCloseBtn.onclick = function() {
            vodDetailsModal.style.display = 'none';
            activeZone = 'channels';
            if (lastFocusedChannel) {
                lastFocusedChannel.classList.add('focused');
                lastFocusedChannel.focus();
            }
        };

        vodDetailsModal.style.display = 'block';
        activeZone = 'vod-modal';
        
        if (!isSeries) {
            vodPlayBtn.classList.add('focused');
            vodPlayBtn.focus();
        } else {
            // For series, focus on first season button
            const firstSeasonBtn = document.querySelector('.season-btn.focused');
            if (firstSeasonBtn) {
                firstSeasonBtn.focus();
            }
        }
        vodCloseBtn.classList.remove('focused');

        vodPlayBtn.onclick = function(e) {
            e.preventDefault();
            vodDetailsModal.style.display = 'none';
            const streamUrl = channelElement.dataset.url || channelElement.dataset.streamUrl;
            if (streamUrl) {
                lastFocusedChannel = channelElement;
                injectSubtitleTracks();
                const seriesInfo = currentSeriesInfo || null;
                const itemData = channelElement.dataset.channelData ? JSON.parse(channelElement.dataset.channelData) : activeItem;
                playStream(streamUrl, itemData, seriesInfo);
            }
        };

        vodCloseBtn.onclick = function() {
            vodDetailsModal.style.display = 'none';
            activeZone = 'channels';
            if (lastFocusedChannel) {
                lastFocusedChannel.classList.add('focused');
                lastFocusedChannel.focus();
            }
        };
    }

    function renderEpisodesForSeason(episodes, mainPosterSrc, channelElement) {
        modalEpisodesSlider.innerHTML = '';
        
        episodes.forEach((episode, index) => {
            const episodeCard = document.createElement('div');
            episodeCard.className = 'episode-card';
            episodeCard.tabIndex = 0;
            episodeCard.dataset.url = episode.url;
            episodeCard.dataset.channelData = JSON.stringify(episode);
            
            const thumb = document.createElement('img');
            thumb.className = 'episode-thumb';
            const episodePoster = episode.cover || episode.poster || episode.logo || currentSeriesInfo.cover || mainPosterSrc || PLACEHOLDER_IMG;
            thumb.src = episodePoster;
            thumb.alt = episode.title || 'Episode ' + (index + 1);
            thumb.onerror = function() {
                if (this.src !== PLACEHOLDER_IMG && this.src !== mainPosterSrc && mainPosterSrc !== PLACEHOLDER_IMG) {
                    this.src = mainPosterSrc;
                }
            };
            episodeCard.appendChild(thumb);
            
            const info = document.createElement('div');
            info.className = 'episode-info';
            
            const number = document.createElement('div');
            number.className = 'episode-number';
            number.textContent = 'S' + (episode.season || 1) + ' E' + (episode.episode || (index + 1));
            info.appendChild(number);
            
            const title = document.createElement('div');
            title.className = 'episode-title';
            title.textContent = episode.title || episode.name || 'Bölüm ' + (index + 1);
            info.appendChild(title);
            
            episodeCard.appendChild(info);

            if (isWatched('series', episode.id)) {
                const tick = document.createElement('div');
                tick.className = 'watched-mark';
                tick.textContent = '✓';
                episodeCard.appendChild(tick);
            }
            if (suggestedEpisodeId != null && String(episode.id) === String(suggestedEpisodeId)) {
                episodeCard.classList.add('suggested');
                const tag = document.createElement('div');
                tag.className = 'suggested-tag';
                tag.textContent = currentLang === 'en' ? '▶ Continue' : '▶ Devam';
                episodeCard.appendChild(tag);
            }

            episodeCard.addEventListener('click', (e) => {
                e.preventDefault();
                vodDetailsModal.style.display = 'none';
                lastFocusedChannel = channelElement;
                injectSubtitleTracks();
                playStream(episode.url, episode, currentSeriesInfo);
            });
            
            modalEpisodesSlider.appendChild(episodeCard);
        });
    }

    function playChannel(channelElement) {
        if (currentContentType === 'live') {
            const streamUrl = channelElement.dataset.url || channelElement.dataset.streamUrl;
            if (!streamUrl) {
                return;
            }

            lastFocusedChannel = channelElement;
            injectSubtitleTracks();

            let activeItem = null;
            if (channelElement.dataset.channelData) {
                try {
                    activeItem = JSON.parse(channelElement.dataset.channelData);
                } catch (e) {
                }
            }

            const seriesInfo = currentSeriesInfo || null;
            playStream(streamUrl, activeItem, seriesInfo);
            return;
        }

        if (channelElement.dataset.seriesId && channelElement.dataset.seriesId !== 'undefined') {
            let channelData = null;
            if (channelElement.dataset.channelData) {
                try {
                    channelData = JSON.parse(channelElement.dataset.channelData);
                } catch (e) {
                }
            }
            showVODModal(channelElement, channelData);
            return;
        }

        let channelData = null;
        if (channelElement.dataset.channelData) {
            try {
                channelData = JSON.parse(channelElement.dataset.channelData);
            } catch (e) {
            }
        }
        showVODModal(channelElement, channelData);
    }

    // SRT to WebVTT converter utility
    function srtToVtt(srtText) {
        // Add WebVTT header
        let vttText = 'WEBVTT\n\n';

        // Replace SRT timecode format (00:00:00,000) with WebVTT format (00:00:00.000)
        vttText += srtText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

        return vttText;
    }

    function showNextEpisodeOverlay(nextEpisode, nextIndex) {
        nextEpisodeOverlay = document.getElementById('next-episode-overlay');
        const nextEpisodeText = document.getElementById('next-episode-text');
        const btnNextEp = document.getElementById('btn-next-ep');

        if (!nextEpisodeOverlay) return;

        // Set the episode info
        const season = nextEpisode.season || 1;
        const episode = nextEpisode.episode || (nextIndex + 1);
        const title = nextEpisode.title || nextEpisode.name || 'Bölüm ' + (nextIndex + 1);
        nextEpisodeText.textContent = 'Sonraki Bölüm: S' + season + ' E' + episode + ' - ' + title;

        // Show overlay
        nextEpisodeOverlay.style.display = 'block';

        // Focus on button
        btnNextEp.classList.add('focused');
        btnNextEp.focus();
        activeZone = 'next-episode-overlay';

        // Button click handler
        btnNextEp.onclick = function() {
            playNextEpisode(nextEpisode, nextIndex);
        };
    }

    function playNextEpisode(nextEpisode, nextIndex) {
        if (nextEpisodeOverlay) {
            nextEpisodeOverlay.style.display = 'none';
        }

        currentEpisodeIndex = nextIndex;
        injectSubtitleTracks();
        playStream(nextEpisode.url, nextEpisode, currentSeriesInfo);
    }

    function hideNextEpisodeOverlay() {
        if (nextEpisodeOverlay) {
            nextEpisodeOverlay.style.display = 'none';
        }
        if (nextEpisodeCountdown) {
            clearInterval(nextEpisodeCountdown);
            nextEpisodeCountdown = null;
        }
    }

    function formatTime(seconds) {
        if (!isFinite(seconds) || isNaN(seconds)) {
            return 'Canlı';
        }
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
    }

    function showSkipIndicator(text) {
        const skipIndicator = document.getElementById('skip-indicator');
        if (!skipIndicator) return;

        skipIndicator.textContent = text;
        skipIndicator.classList.add('visible');

        setTimeout(() => {
            skipIndicator.classList.remove('visible');
        }, 1000);
    }

    function updateCustomOSDProgress() {
        const progressFill = document.getElementById('osd-progress-fill');
        const currentTimeEl = document.getElementById('osd-current-time');
        const totalTimeEl = document.getElementById('osd-total-time');

        if (!progressFill || !currentTimeEl || !totalTimeEl) return;

        const current = videoPlayer.currentTime;
        const duration = videoPlayer.duration;

        if (isLiveStreamUrl(currentStreamUrl)) {
            // live TV: the bar is the rewind buffer; the right label says "LIVE" or how far behind we are
            const seekable = videoPlayer.seekable;
            let pct = 100;
            if (seekable && seekable.length > 0) {
                const start = seekable.start(0);
                const end = seekable.end(seekable.length - 1);
                if (end > start) pct = Math.max(0, Math.min(100, (current - start) / (end - start) * 100));
            }
            progressFill.style.width = pct + '%';
            const behind = liveBehindSeconds();
            currentTimeEl.textContent = '';
            totalTimeEl.textContent = (behind === null || behind < 4) ? '● ' + tx('CANLI', 'LIVE') : '-' + formatTime(behind);
            totalTimeEl.style.color = (behind === null || behind < 4) ? '#ff5252' : '#fff';
            updateLiveBanner();
            return;
        }

        if (duration > 0) {
            const percentage = (current / duration) * 100;
            progressFill.style.width = percentage + '%';
            currentTimeEl.textContent = formatTime(current);
            totalTimeEl.textContent = formatTime(duration);
        }
    }

    function showCustomOSD(changeZone = true, hideAfter = 5000) {
        const customOSD = document.getElementById('custom-player-osd');
        if (!customOSD) return;
        if (activeZone === 'guide' || activeZone === 'chpanel') return; // a side list is open: keep the bar away
        refreshLiveOsdTitle();
        updateCustomOSDProgress();

        customOSD.style.display = 'block';

        if (changeZone) {
            activeZone = 'custom-osd';

            // Focus on first button
            const firstBtn = document.getElementById('btn-osd-playpause');
            if (firstBtn) {
                firstBtn.classList.add('focused');
                firstBtn.focus();
            }
        }

        // Reset timeout
        if (customOsdTimeout) {
            clearTimeout(customOsdTimeout);
        }

        // Set new timeout
        customOsdTimeout = setTimeout(() => {
            hideCustomOSD();
        }, hideAfter);
    }

    function hideCustomOSD() {
        const customOSD = document.getElementById('custom-player-osd');
        if (customOSD) {
            customOSD.style.display = 'none';
        }
        if (customOsdTimeout) {
            clearTimeout(customOsdTimeout);
            customOsdTimeout = null;
        }
        // Only give the zone back when the bar owned it. The bar's auto-hide timer (started e.g. by a mouse move)
        // used to reset the zone while the program list was open, so the next key opened the track menu behind it.
        if (activeZone === 'custom-osd') {
            activeZone = 'player';
        }
    }

    // Custom OSD button event listeners
    const btnPlayPause = document.getElementById('btn-osd-playpause');
    const btnTracks = document.getElementById('btn-osd-tracks');
    const btnStop = document.getElementById('btn-osd-stop');

    if (btnPlayPause) {
        btnPlayPause.addEventListener('click', function() {
            if (videoPlayer.paused) {
                videoPlayer.play();
                btnPlayPause.textContent = '⏸ Duraklat';
            } else {
                videoPlayer.pause();
                btnPlayPause.textContent = '⏯ Oynat';
            }
        });
    }

    if (btnTracks) {
        btnTracks.addEventListener('click', function() {
            hideCustomOSD();
            showOSD();
        });
    }

    const btnGuide = document.getElementById('btn-osd-guide');
    if (btnGuide) {
        btnGuide.addEventListener('click', openGuide);
    }

    if (btnStop) {
        btnStop.addEventListener('click', function() {
            hideCustomOSD();
            restoreChannelList();
        });
    }

    // Subdl API subtitle fetcher (Metadata-First)
    let subdlReason = ''; // why the last Subdl attempt produced nothing (shown on screen)
    async function fetchSubdlSubtitle(activeItem, seriesInfo = null) {
        subdlReason = '';
        if (!SUBTITLE_API_KEY) {
            subdlReason = 'anahtar tanımlı değil';
            return null;
        }
        if (typeof JSZip === 'undefined') {
            subdlReason = 'JSZip yüklenemedi';
            return null;
        }

        try {
            const info = seriesInfo && seriesInfo.info ? seriesInfo.info : activeItem;
            const imdbId = info && info.imdb_id ? info.imdb_id : (activeItem && activeItem.imdb_id ? activeItem.imdb_id : null);
            const movieTmdbId = getMovieTmdbId(activeItem);
            const tmdbId = info && info.tmdb_id ? info.tmdb_id : (activeItem && activeItem.tmdb_id ? activeItem.tmdb_id : movieTmdbId);
            const title = info && info.name ? info.name : (activeItem && activeItem.name ? activeItem.name : (activeItem && activeItem.title ? activeItem.title : (activeItem && activeItem.stream_name ? activeItem.stream_name : null)));
            const targetSeason = activeItem && activeItem.season_num ? activeItem.season_num : (activeItem && activeItem.season ? activeItem.season : (seriesInfo && seriesInfo.season ? seriesInfo.season : null));
            const targetEpisode = activeItem && activeItem.episode_num ? activeItem.episode_num : (activeItem && activeItem.episode ? activeItem.episode : (seriesInfo && seriesInfo.episode ? seriesInfo.episode : null));
            const year = info && info.year ? info.year : (info && info.release_year ? info.release_year : (activeItem && activeItem.year ? activeItem.year : null));


            // Dynamic URL builder
            let apiUrl = 'https://api.subdl.com/api/v1/subtitles?api_key=' + SUBTITLE_API_KEY + '&languages=tr';

            if (imdbId) {
                apiUrl += '&imdb_id=' + imdbId;
            } else if (tmdbId) {
                apiUrl += '&tmdb_id=' + tmdbId + (movieTmdbId ? '&type=movie' : '');
            } else {
                if (!title) {
                    subdlReason = 'başlık yok';
                    return null;
                }

                // Parse and clean title using regex
                const parsed = parseStreamTitle(title);
                const cleanTitle = parsed.title;
                const parsedYear = parsed.year;
                const finalYear = year || parsedYear;

                apiUrl += '&film_name=' + encodeURIComponent(cleanTitle);

                if (targetSeason > 0 && targetEpisode > 0) {
                    apiUrl += '&season_number=' + targetSeason + '&episode_number=' + targetEpisode;
                } else if (finalYear) {
                    // Movie fallback: append year
                    apiUrl += '&year=' + finalYear;
                }
            }

            if ((imdbId || tmdbId) && targetSeason > 0 && targetEpisode > 0) {
                apiUrl += '&season_number=' + targetSeason + '&episode_number=' + targetEpisode;
            }

            const response = await fetch(apiUrl, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                subdlReason = 'arama HTTP ' + response.status;
                return null;
            }

            const data = await response.json();

            // Extract subtitle download link from Subdl response
            if (data && data.subtitles && data.subtitles.length > 0) {
                // Strict episode filtering for TV shows
                let filteredSubtitles = data.subtitles;
                if (targetSeason !== null && targetEpisode !== null) {
                    filteredSubtitles = data.subtitles.filter(sub =>
                        (sub.season == targetSeason || sub.season_num == targetSeason) &&
                        (sub.episode == targetEpisode || sub.episode_num == targetEpisode)
                    );
                }

                // Find Turkish subtitle with foolproof condition
                const trSub = filteredSubtitles.find(sub =>
                    (sub.language && sub.language.toUpperCase() === 'TR') ||
                    (sub.lang && sub.lang.toLowerCase() === 'turkish')
                );

                if (trSub) {

                    // Construct download URL with base URL prefix if needed
                    let downloadUrl = trSub.url || trSub.download_link;
                    if (downloadUrl && downloadUrl.startsWith('/')) {
                        downloadUrl = 'https://dl.subdl.com' + downloadUrl;
                    } else if (downloadUrl && !downloadUrl.startsWith('http://') && !downloadUrl.startsWith('https://')) {
                        downloadUrl = 'https://dl.subdl.com/' + downloadUrl;
                    }

                    if (!downloadUrl) {
                        subdlReason = 'indirme adresi yok';
                        return null;
                    }

                    // Fetch the ZIP file as arrayBuffer
                    const subtitleResponse = await fetch(downloadUrl);
                    if (!subtitleResponse.ok) {
                        subdlReason = 'indirme HTTP ' + subtitleResponse.status;
                        return null;
                    }

                    const arrayBuffer = await subtitleResponse.arrayBuffer();

                    // Unzip using JSZip
                    const zip = await JSZip.loadAsync(arrayBuffer);

                    // Find the first .srt file
                    let srtFile = null;
                    for (const filename of Object.keys(zip.files)) {
                        if (filename.toLowerCase().endsWith('.srt')) {
                            srtFile = zip.files[filename];
                            break;
                        }
                    }

                    if (!srtFile) {
                        subdlReason = 'zip içinde .srt yok';
                        return null;
                    }

                    // Extract SRT content as raw bytes (Uint8Array)
                    const uint8arrayData = await srtFile.async('uint8array');

                    // Smart decoding: Try UTF-8 first, fallback to Windows-1254
                    let srtText;
                    try {
                        // Strict UTF-8 decoder - throws if file is not valid UTF-8
                        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                        srtText = utf8Decoder.decode(uint8arrayData);
                    } catch (e) {
                        const win1254Decoder = new TextDecoder('windows-1254');
                        srtText = win1254Decoder.decode(uint8arrayData);
                    }
                    return srtText;
                }
            }

            subdlReason = 'Türkçe altyazı bulunamadı';
            return null;
        } catch (error) {
            subdlReason = 'hata: ' + (error && error.message ? error.message : error);
            return null;
        }
    }

    // Inject external subtitle as blob URL
    function injectExternalSubtitle(vttText, label = 'Harici Türkçe (Subdl)') {
        // Clean up previous blob URLs
        cleanupBlobUrls();

        // Convert to WebVTT if needed
        const vttContent = vttText.startsWith('WEBVTT') ? vttText : srtToVtt(vttText);

        // Create blob URL
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const blobUrl = URL.createObjectURL(blob);

        // Track for cleanup
        activeBlobUrls.push(blobUrl);

        // Create and append track element
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = label;
        track.src = blobUrl;
        track.srclang = 'tr';
        track.default = false;
        videoPlayer.appendChild(track);

        return blobUrl;
    }

    // Clean up blob URLs to prevent memory leaks
    function cleanupBlobUrls() {
        activeBlobUrls.forEach(url => {
            URL.revokeObjectURL(url);
        });
        activeBlobUrls = [];

        // Remove existing external subtitle tracks
        const existingTracks = videoPlayer.querySelectorAll('track[label^="Harici"]');
        existingTracks.forEach(track => track.remove());
    }

    function injectSubtitleTracks() {
        // Clear existing subtitle tracks from video element (except external ones)
        const existingTracks = videoPlayer.querySelectorAll('track[kind="subtitles"]:not([label^="Harici"])');
        existingTracks.forEach(track => track.remove());

        if (window.currentSubtitles && Array.isArray(window.currentSubtitles)) {
            window.currentSubtitles.forEach((subtitle, index) => {
                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = subtitle.language || 'Subtitle ' + (index + 1);
                track.src = subtitle.url || subtitle.subtitle_url;
                track.srclang = subtitle.lang || subtitle.language || 'en';
                track.default = index === 0;
                videoPlayer.appendChild(track);
            });

        }
    }

    // Small on-screen note about where the subtitle came from / why a source failed (TVs have no console)
    function showSubtitleNote(text) {
        console.log('[SUBTITLE] ' + text);
        let box = document.getElementById('subtitle-note');
        if (!box) {
            box = document.createElement('div');
            box.id = 'subtitle-note';
            box.style.cssText = 'position:fixed;left:20px;bottom:20px;z-index:99998;max-width:70vw;padding:10px 16px;background:rgba(0,0,0,0.75);color:#fff;font:20px sans-serif;border-radius:8px;pointer-events:none;';
            document.body.appendChild(box);
        }
        box.textContent = text;
        box.style.display = 'block';
        clearTimeout(box._hideTimer);
        box._hideTimer = setTimeout(() => { box.style.display = 'none'; }, 8000);
    }

    // Subtitle sources, in order: 1) Subdl, 2) OpenSubtitles.
    // The first one that works is used; failures are reported on screen.
    async function fetchAndInjectExternalSubtitle(activeItem, seriesInfo = null) {
        const streamUrl = currentStreamUrl;
        const stale = () => streamUrl !== currentStreamUrl; // user already switched to another stream
        const reasons = [];

        // 1) Subdl
        if (SUBTITLE_API_KEY) {
            try {
                const subtitleText = await fetchSubdlSubtitle(activeItem, seriesInfo);
                if (stale()) return;
                if (subtitleText) {
                    injectExternalSubtitle(subtitleText, 'Harici Türkçe (Subdl)');
                    populateOSDTracks();
                    showSubtitleNote('Altyazı: Subdl' + (reasons.length ? ' — ' + reasons.join('; ') : ''));
                    return;
                }
                reasons.push('Subdl: ' + (subdlReason || 'bulunamadı'));
            } catch (error) {
                reasons.push('Subdl: hata (' + (error && error.message ? error.message : error) + ')');
            }
        } else {
            reasons.push('Subdl: anahtar yok');
        }

        // 2) OpenSubtitles
        try {
            const openSubtitleText = await fetchOpenSubtitles(activeItem, seriesInfo);
            if (stale()) return;
            if (openSubtitleText) {
                injectExternalSubtitle(openSubtitleText, 'Harici Türkçe (OpenSub)');
                populateOSDTracks();
                showSubtitleNote('Altyazı: OpenSubtitles — ' + reasons.join('; '));
                return;
            }
            reasons.push('OpenSub: bulunamadı');
        } catch (error) {
            reasons.push('OpenSub: hata (' + (error && error.message ? error.message : error) + ')');
        }
        showSubtitleNote('Altyazı bulunamadı — ' + reasons.join('; '));
    }

    async function fetchOpenSubtitles(activeItem, seriesInfo = null) {
        if (!OPEN_SUBTITLES_API_KEY) {
            console.log('OpenSubtitles API key not configured');
            return null;
        }

        const imdbId = activeItem.imdb_id || seriesInfo?.imdb_id;
        const movieTmdbId = getMovieTmdbId(activeItem);
        const rawTitle = activeItem.name || activeItem.title || '';
        const parsedTitle = parseStreamTitle(rawTitle);
        const title = parsedTitle.title || rawTitle; // without year/quality tags ("72 Saat 2026" -> "72 Saat")
        const year = activeItem.year || seriesInfo?.year || parsedTitle.year || '';
        const season = seriesInfo?.season || activeItem.season || '';
        const episode = seriesInfo?.episode || activeItem.episode || '';

        if (!title && !imdbId) {
            return null;
        }

        try {
            // Build search URL
            let searchUrl = 'https://api.opensubtitles.com/api/v1/subtitles?languages=tr';

            if (imdbId) {
                searchUrl += '&imdb_id=' + imdbId;
            } else if (movieTmdbId) {
                searchUrl += '&tmdb_id=' + movieTmdbId;
            } else {
                // Clean title for search
                const cleanTitle = title.replace(/\s+/g, ' ').trim();
                searchUrl += '&query=' + encodeURIComponent(cleanTitle);
                if (year) {
                    searchUrl += '&year=' + year;
                }
            }

            // Add season and episode for series
            if (season && episode) {
                searchUrl += '&season_number=' + season + '&episode_number=' + episode;
            }

            // Search request
            const searchResponse = await fetch(searchUrl, {
                headers: {
                    'Api-Key': OPEN_SUBTITLES_API_KEY,
                    'User-Agent': APP_USER_AGENT,
                    'Accept': 'application/json'
                }
            });

            if (!searchResponse.ok) {
                if (searchResponse.status === 429) {
                    console.log('OpenSubtitles rate limit exceeded');
                }
                return null;
            }

            const searchData = await searchResponse.json();
            
            if (!searchData.data || searchData.data.length === 0) {
                console.log('No subtitles found on OpenSubtitles');
                return null;
            }

            // Get first subtitle file_id
            const firstSubtitle = searchData.data[0];
            const fileId = firstSubtitle.attributes.files[0]?.file_id;

            if (!fileId) {
                console.log('No file_id found in subtitle data');
                return null;
            }

            // Download request
            const downloadResponse = await fetch('https://api.opensubtitles.com/api/v1/download', {
                method: 'POST',
                headers: {
                    'Api-Key': OPEN_SUBTITLES_API_KEY,
                    'User-Agent': APP_USER_AGENT,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file_id: fileId })
            });

            if (!downloadResponse.ok) {
                console.log('OpenSubtitles download request failed');
                return null;
            }

            const downloadData = await downloadResponse.json();
            const downloadLink = downloadData.link;

            if (!downloadLink) {
                console.log('No download link in response');
                return null;
            }

            // Download the subtitle file
            const fileResponse = await fetch(downloadLink);
            if (!fileResponse.ok) {
                console.log('Failed to download subtitle file');
                return null;
            }

            const fileContent = await fileResponse.text();

            // Convert SRT to VTT if needed
            if (fileContent.includes('WEBVTT')) {
                return fileContent;
            } else if (fileContent.includes(' --> ')) {
                return srtToVtt(fileContent);
            }

            return null;

        } catch (error) {
            console.log('OpenSubtitles API error:', error.message);
            return null;
        }
    }

    function populateOSDTracks() {
        audioTracksList.innerHTML = '';
        subtitleTracksList.innerHTML = '';

        // Populate audio tracks
        if (videoPlayer.audioTracks && videoPlayer.audioTracks.length > 0) {
            for (let i = 0; i < videoPlayer.audioTracks.length; i++) {
                const track = videoPlayer.audioTracks[i];
                const item = document.createElement('div');
                item.className = 'osd-item';
                item.textContent = track.label || track.language || 'Audio ' + (i + 1);
                item.dataset.trackIndex = i;
                item.dataset.trackType = 'audio';
                item.tabIndex = 0;

                if (track.enabled) {
                    item.classList.add('active');
                }

                item.addEventListener('click', () => selectOSDItem(item));
                audioTracksList.appendChild(item);
            }
        } else {
            const item = document.createElement('div');
            item.className = 'osd-item';
            item.textContent = 'No audio tracks';
            item.style.color = '#888';
            item.tabIndex = 0;
            audioTracksList.appendChild(item);
        }

        // Populate subtitle tracks from injected HTML5 tracks
        // Add subtitle sync control at the top
        const syncItem = document.createElement('div');
        syncItem.className = 'osd-item sync-control';
        syncItem.dataset.type = 'sync';
        syncItem.tabIndex = 0;
        const sign = currentSubOffset >= 0 ? '+' : '';
        syncItem.innerHTML = '< Senkron: <span id="sync-value">' + sign + currentSubOffset.toFixed(1) + '</span>s >';
        subtitleTracksList.appendChild(syncItem);

        const offItem = document.createElement('div');
        offItem.className = 'osd-item';
        offItem.textContent = translations[currentLang]['osd-off'];
        offItem.dataset.trackIndex = -1;
        offItem.dataset.trackType = 'subtitle';
        offItem.tabIndex = 0;
        offItem.addEventListener('click', () => selectOSDItem(offItem));
        subtitleTracksList.appendChild(offItem);

        if (videoPlayer.textTracks && videoPlayer.textTracks.length > 0) {
            for (let i = 0; i < videoPlayer.textTracks.length; i++) {
                const track = videoPlayer.textTracks[i];
                if (track.kind === 'subtitles') {
                    const item = document.createElement('div');
                    item.className = 'osd-item';
                    item.textContent = track.label || track.language || 'Subtitle ' + (i + 1);
                    item.dataset.trackIndex = i;
                    item.dataset.trackType = 'subtitle';
                    item.tabIndex = 0;

                    if (track.mode === 'showing') {
                        item.classList.add('active');
                    }

                    item.addEventListener('click', () => selectOSDItem(item));
                    subtitleTracksList.appendChild(item);
                }
            }
        }

        if (subtitleTracksList.children.length === 2) {
            const item = document.createElement('div');
            item.className = 'osd-item';
            item.textContent = 'No subtitles';
            item.style.color = '#888';
            item.tabIndex = 0;
            subtitleTracksList.appendChild(item);
        }

    }

    function showOSD() {
        playerOsd.style.display = 'flex';
        activeZone = 'osd';
        osdFocusedColumn = 'audio';
        osdFocusedIndex = 0;

        videoPlayer.removeAttribute('controls');

        const firstAudioItem = audioTracksList.querySelector('.osd-item');
        if (firstAudioItem) {
            firstAudioItem.classList.add('focused');
            firstAudioItem.focus();
        }
    }

    function hideOSD() {
        playerOsd.style.display = 'none';
        activeZone = 'player';

        // Remove all focused classes
        document.querySelectorAll('.osd-item.focused').forEach(item => {
            item.classList.remove('focused');
        });

        // Focus video player for keyboard controls (Spacebar to pause, etc.)
        videoPlayer.focus();
    }

    function selectOSDItem(item) {
        if (!item || !item.dataset) {
            return;
        }

        const trackType = item.dataset.trackType;
        const trackIndex = parseInt(item.dataset.trackIndex);

        if (trackType === 'audio') {
            // Select audio track
            if (videoPlayer.audioTracks) {
                for (let i = 0; i < videoPlayer.audioTracks.length; i++) {
                    videoPlayer.audioTracks[i].enabled = (i === trackIndex);
                }

                // Update active class
                audioTracksList.querySelectorAll('.osd-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            }
        } else if (trackType === 'subtitle') {
            // Native HTML5 subtitle track switching
            if (videoPlayer.textTracks) {
                if (trackIndex === -1) {
                    // Turn off all subtitles
                    for (let i = 0; i < videoPlayer.textTracks.length; i++) {
                        videoPlayer.textTracks[i].mode = 'disabled';
                    }
                } else {
                    // Enable selected subtitle, disable others
                    for (let i = 0; i < videoPlayer.textTracks.length; i++) {
                        videoPlayer.textTracks[i].mode = (i === trackIndex) ? 'showing' : 'disabled';
                    }
                }
            }

            // Update active class
            subtitleTracksList.querySelectorAll('.osd-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        }

        // Hide OSD after selection and return to player zone
        hideOSD();
        activeZone = 'player';
    }

    function adjustSubtitleSync(deltaSeconds) {
        let activeTrack = null;
        if (videoPlayer.textTracks) {
            activeTrack = Array.from(videoPlayer.textTracks).find(t =>
                t.language === 'tr' || t.label.includes('Subdl') || t.mode === 'showing'
            );
        }

        if (!activeTrack || !activeTrack.cues) {
            return;
        }

        // Shift all cues by deltaSeconds
        for (let i = 0; i < activeTrack.cues.length; i++) {
            const cue = activeTrack.cues[i];
            cue.startTime += deltaSeconds;
            cue.endTime += deltaSeconds;
        }

        // Update offset
        currentSubOffset += deltaSeconds;
    }

    // Update sync value display in OSD
    function updateSyncValueDisplay() {
        const syncValueSpan = document.getElementById('sync-value');
        if (syncValueSpan) {
            const sign = currentSubOffset >= 0 ? '+' : '';
            syncValueSpan.textContent = sign + currentSubOffset.toFixed(1);
        }
    }

    function stopVideo() {
        saveProgress(true);
        updateContinueEntry(true);
        playbackActive = false;
        if (hls) {
            hls.destroy();
            hls = null;
        }
        videoPlayer.pause();
        videoPlayer.src = '';
        const videoContainer = document.getElementById('video-container');
        if (videoContainer) videoContainer.style.display = 'none';

        // Clean up blob URLs to prevent memory leaks
        cleanupBlobUrls();

        // Reset subtitle sync offset
        currentSubOffset = 0;
    }
    
    // Switch to the player screen. Setting the hash only works when it changes: after leaving the player with the
    // "Kapat" button the hash used to stay "#player", so the next channel played audio-only behind the channel list.
    function enterPlayerView() {
        if (window.location.hash === '#player') {
            handleRouting();
        } else {
            window.location.hash = '#player';
        }
    }

    function restoreChannelList() {
        stopVideo();
        document.querySelector('header').style.display = 'block';
        document.querySelector('main').style.display = 'block';
        mainContent.style.display = 'flex';
        // keep the address in sync with what is on screen, without adding a history entry or firing events
        if (window.location.hash === '#player') {
            history.replaceState(history.state, '', '#channels');
        }
        activeZone = 'channels';

        // Restore .focused class to last selected channel
        if (lastFocusedChannel) {
            // Remove focused from all channels first
            const allChannels = channelList.querySelectorAll('.channel-item');
            allChannels.forEach(ch => ch.classList.remove('focused'));

            // Add focused to last selected channel
            lastFocusedChannel.classList.add('focused');
            activeZone = 'channels';
        }
    }
    
    function handleRouting() {
        const hash = window.location.hash;

        if (hash === '#player') {
            // GÜNCELLEME: Şartı kaldırdık. Hash #player ise HER DURUMDA ana menüyü gizle ve oynatıcıyı göster.
            mainContent.style.display = 'none';
            const header = document.querySelector('header');
            const main = document.querySelector('main');
            if (header) header.style.display = 'none';
            if (main) main.style.display = 'none';

            const videoContainer = document.getElementById('video-container');
            if (videoContainer) videoContainer.style.display = 'block';

        } else if (hash === '#channels') {
            // Stop video, show main content
            if (mainContent.style.display !== 'flex') {
                stopVideo();
                const header = document.querySelector('header');
                const main = document.querySelector('main');
                if (header) header.style.display = 'block';
                if (main) main.style.display = 'block';
                mainContent.style.display = 'flex';
                restoreChannelList();
            }
        } else {
            // #login or empty
            if (loginContainer.style.display !== 'block') {
                stopVideo();
                loginContainer.style.display = 'block';
                mainContent.style.display = 'none';
                const videoContainer = document.getElementById('video-container');
                if (videoContainer) videoContainer.style.display = 'none';
                const header = document.querySelector('header');
                const main = document.querySelector('main');
                if (header) header.style.display = 'block';
                if (main) main.style.display = 'block';
            }
        }
    }

    
    function handleSpatialNavigation(e) {
        const key = e.key || '';
        const keyLower = key.toLowerCase();
        const keyCode = e.keyCode || e.which;
        const focusedElement = document.activeElement;

        // Handle both keyboard and webOS remote control keys
        const isArrowKey = keyLower === 'arrowup' || keyLower === 'arrowdown' || keyLower === 'arrowleft' || keyLower === 'arrowright' ||
                          keyCode === 38 || keyCode === 40 || keyCode === 37 || keyCode === 39;
        const isEnterKey = keyLower === 'enter' || keyCode === 13;


        // Category manager
        if (activeZone === 'catmgr') {
            handleCategoryManagerKey(e, key, keyCode, isEnterKey);
            return;
        }

        // Channel list inside the player
        if (activeZone === 'chpanel') {
            handleChannelPanelKey(e, key, keyCode, isEnterKey);
            return;
        }

        // Day's program list
        if (activeZone === 'guide') {
            handleGuideKey(e, key, keyCode, isEnterKey);
            return;
        }

        // Settings screen
        if (activeZone === 'settings') {
            handleSettingsKey(e, key, keyCode, isEnterKey);
            return;
        }

        // Remote control color keys / channel keys
        if (handleColorKeys(e, keyCode)) {
            return;
        }

        // Player zone - handle ArrowUp/Enter to show OSD
        if (activeZone === 'player' && (keyLower === 'arrowup' || keyCode === 38 || isEnterKey)) {
            e.preventDefault();
            showOSD();
            return;
        }

        // Next Episode Overlay Navigation
        if (activeZone === 'next-episode-overlay') {
            const btnNextEp = document.getElementById('btn-next-ep');
            
            if (key === 'Enter' || isEnterKey) {
                if (btnNextEp) {
                    btnNextEp.click();
                }
                e.preventDefault();
            } else if (key === 'Escape' || key === 'Backspace' || keyCode === 27 || keyCode === 10009) {
                hideNextEpisodeOverlay();
                videoPlayer.src = '';
                activeZone = 'channels';
                window.location.hash = '#channels';
                e.preventDefault();
            }
            return;
        }

        // Custom OSD Navigation
        if (activeZone === 'custom-osd') {
            const osdButtons = Array.from(document.querySelectorAll('.osd-control-btn')).filter(b => b.offsetParent !== null);
            const focusedBtn = document.querySelector('.osd-control-btn.focused');
            const btnIndex = Array.from(osdButtons).indexOf(focusedBtn);

            if (key === 'ArrowRight' || keyLower === 'arrowright' || keyCode === 39) {
                if (btnIndex < osdButtons.length - 1) {
                    focusedBtn.classList.remove('focused');
                    osdButtons[btnIndex + 1].classList.add('focused');
                    osdButtons[btnIndex + 1].focus();
                }
                e.preventDefault();
            } else if (key === 'ArrowLeft' || keyLower === 'arrowleft' || keyCode === 37) {
                if (btnIndex > 0) {
                    focusedBtn.classList.remove('focused');
                    osdButtons[btnIndex - 1].classList.add('focused');
                    osdButtons[btnIndex - 1].focus();
                }
                e.preventDefault();
            } else if (key === 'ArrowDown' || keyLower === 'arrowdown' || keyCode === 40 || key === 'Escape' || key === 'Backspace' || keyCode === 27 || keyCode === 10009) {
                hideCustomOSD();
                e.preventDefault();
            } else if (key === 'Enter' || isEnterKey) {
                if (focusedBtn) {
                    focusedBtn.click();
                }
                e.preventDefault();
            }
            return;
        }

        // Player zone - handle seek controls and show custom OSD
        if (activeZone === 'player') {
            if (key === 'ArrowRight' || keyLower === 'arrowright' || keyCode === 39) {
                videoPlayer.currentTime += 10;
                showSkipIndicator('+10s');
                if (!isLiveStreamUrl(currentStreamUrl)) showCustomOSD(false);
                e.preventDefault();
            } else if (key === 'ArrowLeft' || keyLower === 'arrowleft' || keyCode === 37) {
                const behindLive = liveBehindSeconds();
                if (isLiveStreamUrl(currentStreamUrl) && (behindLive === null || behindLive < 4)) {
                    openChannelPanel();   // live and not rewound: Left opens the channel list
                } else {
                    videoPlayer.currentTime -= 10;
                    showSkipIndicator('-10s');
                    if (!isLiveStreamUrl(currentStreamUrl)) showCustomOSD(false);
                }
                e.preventDefault();
            } else if (key === 'ArrowUp' || keyLower === 'arrowup' || keyCode === 38 || key === 'ArrowDown' || keyLower === 'arrowdown' || keyCode === 40 || isEnterKey) {
                showCustomOSD(true);
                e.preventDefault();
                return;
            }
        }

        // If no focused element or body is focused, try to auto-focus first element
        if (!focusedElement || focusedElement === document.body) {
            if (activeZone === 'osd') {
                const firstAudioItem = audioTracksList.querySelector('.osd-item');
                if (firstAudioItem) {
                    firstAudioItem.classList.add('focused');
                    firstAudioItem.focus();
                    e.preventDefault();
                    return;
                }
            } else if (activeZone === 'sidebar') {
                const firstCategory = sidebar.querySelector('.category-item');
                if (firstCategory) {
                    firstCategory.focus();
                    e.preventDefault();
                    return;
                }
            } else if (activeZone === 'channels') {
                const firstChannel = channelList.querySelector('.channel-item');
                if (firstChannel) {
                    firstChannel.focus();
                    e.preventDefault();
                    return;
                }
            } else if (activeZone === 'topnav') {
                const activeNav = document.querySelector('.nav-button.active');
                if (activeNav) {
                    activeNav.focus();
                    e.preventDefault();
                    return;
                }
            }
            return;
        }

        // Navigation map for login screen
        const loginNavMap = {
            'tab-xtream': {
                'ArrowRight': 'tab-m3u',
                'ArrowDown': 'server-url'
            },
            'tab-m3u': {
                'ArrowLeft': 'tab-xtream',
                'ArrowDown': 'playlist-url'
            },
            'server-url': {
                'ArrowUp': 'tab-xtream',
                'ArrowDown': 'username'
            },
            'username': {
                'ArrowUp': 'server-url',
                'ArrowDown': 'password'
            },
            'password': {
                'ArrowUp': 'username',
                'ArrowDown': 'connect-btn'
            },
            'playlist-url': {
                'ArrowUp': 'tab-m3u',
                'ArrowDown': 'connect-btn'
            },
            'connect-btn': {
                'ArrowUp': 'password',
                'ArrowLeft': 'tab-xtream',
                'ArrowRight': 'tab-m3u'
            }
        };

        // Handle login screen navigation
        if (loginContainer.style.display !== 'none') {
            if (loginNavMap[focusedElement.id] && loginNavMap[focusedElement.id][key]) {
                const targetId = loginNavMap[focusedElement.id][key];
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    targetElement.focus();
                    e.preventDefault();
                }
            }
            return;
        }

        // TOP NAV Navigation
        if (activeZone === 'topnav') {
            const navItems = [navLive, navMovies, navSeries, navSearch, viewToggleBtn, langToggleBtn, navSettings];
            const currentFocused = (focusedElement.classList && focusedElement.classList.contains('nav-button')) ? focusedElement : navLive;
            let currentIndex = navItems.indexOf(currentFocused);

            // Guard clause - if currentFocused not found, default to first item
            if (currentIndex === -1 && navItems.length > 0) {
                currentFocused = navItems[0];
                currentIndex = 0;
            }

            if (isSearchActive && (key === 'ArrowLeft' || key === 'ArrowRight')) {
                exitSearch();
            }

            if (key === 'ArrowRight' && currentIndex < navItems.length - 1) {
                if (currentFocused && currentFocused.classList) {
                    currentFocused.classList.remove('focused');
                }
                const newFocused = navItems[currentIndex + 1];
                if (newFocused && newFocused.classList) {
                    newFocused.classList.add('focused');
                    newFocused.focus();
                }
                e.preventDefault();
            } else if (key === 'ArrowLeft' && currentIndex > 0) {
                if (currentFocused && currentFocused.classList) {
                    currentFocused.classList.remove('focused');
                }
                const newFocused = navItems[currentIndex - 1];
                if (newFocused && newFocused.classList) {
                    newFocused.classList.add('focused');
                    newFocused.focus();
                }
                e.preventDefault();
            } else if (key === 'ArrowDown') {
                if (currentFocused && currentFocused.classList) {
                    currentFocused.classList.remove('focused');
                }
                if (isSearchActive) {
                    activeZone = 'search';
                    if (searchInput) {
                        searchInput.focus();
                    }
                } else {
                    activeZone = 'sidebar';
                    const firstCategory = sidebar.querySelector('.category-item');
                    if (firstCategory && firstCategory.classList) {
                        firstCategory.classList.add('focused');
                        firstCategory.focus();
                    }
                }
                e.preventDefault();
            } else if (key === 'Enter' || isEnterKey) {
                if (isTransitionInProgress) {
                    e.preventDefault();
                    return;
                }
                isTransitionInProgress = true;
                if (currentFocused === langToggleBtn) {
                    toggleLanguage();
                } else {
                    currentFocused.click();
                }
                e.preventDefault();
                setTimeout(() => isTransitionInProgress = false, 500);
            }
            return;
        }

        // SEARCH Navigation
        if (activeZone === 'search') {
            if (key === 'ArrowDown' || keyCode === 40) {
                activeZone = 'channels';
                const firstChannel = channelList.querySelector('.channel-item');
                if (firstChannel) {
                    firstChannel.classList.add('focused');
                    firstChannel.focus();
                }
                e.preventDefault();
            }
            return;
        }

        // RESUME MODAL Navigation
        if (activeZone === 'resume-modal') {
            if (key === 'ArrowLeft' || key === 'ArrowRight' || keyCode === 37 || keyCode === 39) {
                if (btnResume.classList.contains('focused')) {
                    btnResume.classList.remove('focused');
                    btnRestart.classList.add('focused');
                    btnRestart.focus();
                } else {
                    btnRestart.classList.remove('focused');
                    btnResume.classList.add('focused');
                    btnResume.focus();
                }
                e.preventDefault();
            } else if (key === 'Enter' || isEnterKey) {
                if (isTransitionInProgress) {
                    e.preventDefault();
                    return;
                }
                isTransitionInProgress = true;
                if (btnResume.classList.contains('focused')) {
                    videoPlayer.currentTime = pendingResumeTime;
                    videoPlayer.play().catch(err => console.log('Play interrupted:', err));
                } else {
                    videoPlayer.currentTime = 0;
                    videoPlayer.play().catch(err => console.log('Play interrupted:', err));
                }
                resumeModal.style.display = 'none';

                // Arayüzü manuel olarak gizle ve oynatıcıyı zorla göster
                const videoContainer = document.getElementById('video-container');
                const mainContent = document.getElementById('main-content');
                const header = document.querySelector('header');
                const main = document.querySelector('main');

                if (videoContainer) videoContainer.style.display = 'block';
                if (mainContent) mainContent.style.display = 'none';
                if (header) header.style.display = 'none';
                if (main) main.style.display = 'none';

                // Oynatıcı alanına odaklan
                activeZone = 'player';
                videoPlayer.focus();

                isEnteringPlayer = true;
                window.location.hash = '#player';
                e.preventDefault();
                setTimeout(() => {
                    isTransitionInProgress = false;
                    isEnteringPlayer = false;
                }, 500);
            } else if (key === 'Backspace' || key === 'Escape' || keyCode === 461) {
                resumeModal.style.display = 'none';
                videoPlayer.src = '';
                playbackActive = false;
                activeZone = 'channels';
                window.location.hash = '#channels';
                e.preventDefault();
            }
            return;
        }

        // VOD MODAL Navigation
        if (activeZone === 'vod-modal') {
            const seasonButtons = document.querySelectorAll('.season-btn');
            const focusedSeasonBtn = document.querySelector('.season-btn.focused');
            const episodes = modalEpisodesSlider.querySelectorAll('.episode-card');
            const focusedEpisode = modalEpisodesSlider.querySelector('.episode-card.focused');
            const episodeIndex = Array.from(episodes).indexOf(focusedEpisode);

            // Season Selector Navigation
            if (focusedSeasonBtn) {
                const seasonIndex = Array.from(seasonButtons).indexOf(focusedSeasonBtn);
                
                if (key === 'ArrowRight' || keyLower === 'arrowright' || keyCode === 39) {
                    if (seasonIndex < seasonButtons.length - 1) {
                        focusedSeasonBtn.classList.remove('focused');
                        const nextSeasonBtn = seasonButtons[seasonIndex + 1];
                        nextSeasonBtn.classList.add('focused');
                        nextSeasonBtn.focus();
                        // Trigger click to change season
                        nextSeasonBtn.click();
                    }
                    e.preventDefault();
                } else if (key === 'ArrowLeft' || keyLower === 'arrowleft' || keyCode === 37) {
                    if (seasonIndex > 0) {
                        focusedSeasonBtn.classList.remove('focused');
                        const prevSeasonBtn = seasonButtons[seasonIndex - 1];
                        prevSeasonBtn.classList.add('focused');
                        prevSeasonBtn.focus();
                        // Trigger click to change season
                        prevSeasonBtn.click();
                    }
                    e.preventDefault();
                } else if (key === 'ArrowDown' || keyLower === 'arrowdown' || keyCode === 40) {
                    if (episodes.length > 0) {
                        focusedSeasonBtn.classList.remove('focused');
                        const firstEpisode = modalEpisodesSlider.querySelector('.episode-card.suggested') || episodes[0];
                        firstEpisode.classList.add('focused');
                        firstEpisode.focus();
                        try {
                            modalEpisodesSlider.scrollTo({ left: firstEpisode.offsetLeft - (modalEpisodesSlider.clientWidth / 2) + (firstEpisode.clientWidth / 2) });
                        } catch (error) { /* ignore */ }
                    }
                    e.preventDefault();
                }
            }

            // Episode Slider Navigation
            if (episodes.length > 0 && modalEpisodesContainer.style.display !== 'none') {
                if (key === 'ArrowLeft' || keyLower === 'arrowleft' || keyCode === 37) {
                    if (focusedEpisode && episodeIndex > 0) {
                        focusedEpisode.classList.remove('focused');
                        episodes[episodeIndex - 1].classList.add('focused');
                        const newFocused = episodes[episodeIndex - 1];
                        newFocused.focus();
                        
                        try {
                            const scrollPosition = newFocused.offsetLeft - (modalEpisodesSlider.clientWidth / 2) + (newFocused.clientWidth / 2);
                            modalEpisodesSlider.scrollTo({
                                left: scrollPosition,
                                behavior: 'smooth'
                            });
                        } catch (error) {
                            console.log('Scroll error:', error);
                        }
                    }
                    e.preventDefault();
                } else if (key === 'ArrowRight' || keyLower === 'arrowright' || keyCode === 39) {
                    if (focusedEpisode && episodeIndex < episodes.length - 1) {
                        focusedEpisode.classList.remove('focused');
                        episodes[episodeIndex + 1].classList.add('focused');
                        const newFocused = episodes[episodeIndex + 1];
                        newFocused.focus();
                        
                        try {
                            const scrollPosition = newFocused.offsetLeft - (modalEpisodesSlider.clientWidth / 2) + (newFocused.clientWidth / 2);
                            modalEpisodesSlider.scrollTo({
                                left: scrollPosition,
                                behavior: 'smooth'
                            });
                        } catch (error) {
                            console.log('Scroll error:', error);
                        }
                    }
                    e.preventDefault();
                } else if (key === 'ArrowDown' || keyLower === 'arrowdown' || keyCode === 40) {
                    if (focusedEpisode) {
                        focusedEpisode.classList.remove('focused');
                        vodCloseBtn.classList.add('focused');
                        vodCloseBtn.focus();
                    }
                    e.preventDefault();
                } else if (key === 'ArrowUp' || keyLower === 'arrowup' || keyCode === 38) {
                    if (vodCloseBtn.classList.contains('focused')) {
                        vodCloseBtn.classList.remove('focused');
                        if (focusedEpisode) {
                            focusedEpisode.classList.add('focused');
                            focusedEpisode.focus();
                        } else if (episodes.length > 0) {
                            episodes[0].classList.add('focused');
                            episodes[0].focus();
                        }
                    } else if (focusedEpisode && seasonButtons.length > 0) {
                        // Go back to season selector from episodes
                        focusedEpisode.classList.remove('focused');
                        const activeSeasonBtn = document.querySelector('.season-btn.active');
                        if (activeSeasonBtn) {
                            activeSeasonBtn.classList.add('focused');
                            activeSeasonBtn.focus();
                        } else {
                            seasonButtons[0].classList.add('focused');
                            seasonButtons[0].focus();
                        }
                    }
                    e.preventDefault();
                } else if (key === 'Enter' || isEnterKey) {
                    if (isTransitionInProgress) {
                        e.preventDefault();
                        return;
                    }
                    isTransitionInProgress = true;
                    if (focusedEpisode) {
                        focusedEpisode.click();
                    } else if (vodCloseBtn.classList.contains('focused')) {
                        vodCloseBtn.click();
                    }
                    e.preventDefault();
                    setTimeout(() => isTransitionInProgress = false, 500);
                } else if (key === 'Backspace' || key === 'Escape' || keyCode === 461) {
                    vodCloseBtn.click();
                    e.preventDefault();
                }
            } else {
                if (key === 'ArrowLeft' || key === 'ArrowRight' || keyCode === 37 || keyCode === 39) {
                    if (vodPlayBtn.classList.contains('focused')) {
                        vodPlayBtn.classList.remove('focused');
                        vodCloseBtn.classList.add('focused');
                        vodCloseBtn.focus();
                    } else {
                        vodCloseBtn.classList.remove('focused');
                        vodPlayBtn.classList.add('focused');
                        vodPlayBtn.focus();
                    }
                    e.preventDefault();
                } else if (key === 'Enter' || isEnterKey) {
                    if (isTransitionInProgress) {
                        e.preventDefault();
                        return;
                    }
                    isTransitionInProgress = true;
                    if (vodPlayBtn.classList.contains('focused')) {
                        vodPlayBtn.click();
                    } else {
                        vodCloseBtn.click();
                    }
                    e.preventDefault();
                    setTimeout(() => isTransitionInProgress = false, 500);
                } else if (key === 'Backspace' || key === 'Escape' || keyCode === 461) {
                    vodCloseBtn.click();
                    e.preventDefault();
                }
            }
            return;
        }

        // SIDEBAR Navigation
        if (activeZone === 'sidebar') {
            const focusedCategory = document.querySelector('.category-item.focused');
            const categories = Array.from(sidebar.querySelectorAll('.category-item'));
            const currentFocused = focusedCategory || categories[0];
            const currentIndex = categories.indexOf(currentFocused);

            if (key === 'ArrowUp' || keyCode === 38) {
                if (currentIndex > 0) {
                    currentFocused.classList.remove('focused');
                    const newFocused = categories[currentIndex - 1];
                    newFocused.classList.add('focused');
                    newFocused.focus();
                    newFocused.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    e.preventDefault();
                } else if (currentIndex === 0) {
                    if (connectionType === 'xtream') {
                        currentFocused.classList.remove('focused');
                        activeZone = 'topnav';
                        const activeNavButton = document.querySelector('.nav-button.active');
                        if (activeNavButton) {
                            activeNavButton.classList.add('focused');
                            activeNavButton.focus();
                        } else if (navLive) {
                            navLive.classList.add('focused');
                            navLive.focus();
                        }
                    }
                    e.preventDefault();
                }
            } else if ((key === 'ArrowDown' || keyCode === 40) && currentIndex < categories.length - 1) {
                currentFocused.classList.remove('focused');
                const newFocused = categories[currentIndex + 1];
                newFocused.classList.add('focused');
                newFocused.focus();
                newFocused.scrollIntoView({ block: 'center', behavior: 'smooth' });
                e.preventDefault();
            } else if (key === 'ArrowRight' || keyCode === 39) {
                activeZone = 'channels';
                const firstChannel = channelList.querySelector('.channel-item');
                if (firstChannel) {
                    firstChannel.classList.add('focused');
                    firstChannel.focus();
                }
                e.preventDefault();
            } else if (key === 'Enter' || isEnterKey) {
                if (isTransitionInProgress) {
                    e.preventDefault();
                    return;
                }
                isTransitionInProgress = true;
                if (connectionType === 'm3u') {
                    selectM3UCategory(currentFocused);
                } else {
                    selectCategory(currentFocused);
                }
                e.preventDefault();
                setTimeout(() => isTransitionInProgress = false, 500);
            }
            return;
        }

        // CHANNELS Navigation
        if (activeZone === 'channels') {
            const focusedChannel = document.querySelector('.channel-item.focused');
            const channels = Array.from(channelList.querySelectorAll('.channel-item'));
            const currentFocused = focusedChannel || channels[0];

            // GÜVENLİK KONTROLÜ: Eğer liste boşsa veya odaklanacak öğe yoksa, hata vermemesi için direkt menüye dön.
            if (!currentFocused || channels.length === 0) {
                activeZone = 'sidebar';
                const activeCategory = document.querySelector('.category-item.active') || sidebar.querySelector('.category-item');
                if (activeCategory) {
                    activeCategory.classList.add('focused');
                    activeCategory.focus();
                }
                e.preventDefault();
                return;
            }

            const currentIndex = channels.indexOf(currentFocused);
            const isGridView = channelList.classList.contains('grid-view');

            if (isGridView) {
                if (key === 'ArrowRight' || keyCode === 39) {
                    if (currentIndex < channels.length - 1) {
                        currentFocused.classList.remove('focused');
                        const newFocused = channels[currentIndex + 1];
                        newFocused.classList.add('focused');
                        newFocused.focus();
                        newFocused.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        e.preventDefault();
                    }
                } else if (key === 'ArrowLeft' || keyCode === 37) {
                    // KESİN ÇÖZÜM: İlk elemanın ekrandaki X koordinatını referans alıyoruz
                    const firstChannelRect = channels[0].getBoundingClientRect();
                    const currentRect = currentFocused.getBoundingClientRect();

                    // Eğer mevcut öğenin sol kenarı, ızgaranın ilk öğesiyle aynı hizadaysa (10px tolerans)
                    // Demek ki ızgaranın EN SOL sütunundayız! Kaçıncı satırda olduğumuz fark etmeksizin menüye atla.
                    if (Math.abs(currentRect.left - firstChannelRect.left) < 10) {
                        currentFocused.classList.remove('focused');
                        activeZone = 'sidebar';
                        const activeCategory = document.querySelector('.category-item.active');
                        if (activeCategory) {
                            activeCategory.classList.add('focused');
                            activeCategory.focus();
                        } else {
                            const firstCategory = sidebar.querySelector('.category-item');
                            if (firstCategory) {
                                firstCategory.classList.add('focused');
                                firstCategory.focus();
                            }
                        }
                        e.preventDefault();
                    } else if (currentIndex > 0) {
                        // En sol sütunda değilsek normal bir şekilde sola (önceki elemana) kay
                        currentFocused.classList.remove('focused');
                        const newFocused = channels[currentIndex - 1];
                        newFocused.classList.add('focused');
                        newFocused.focus();
                        newFocused.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        e.preventDefault();
                    }
                } else if (key === 'ArrowDown' || keyCode === 40) {
                    const currentRect = currentFocused.getBoundingClientRect();
                    const currentCenterX = currentRect.left + currentRect.width / 2;
                    let bestMatch = null;
                    let bestDistance = Infinity;

                    channels.forEach((channel, index) => {
                        if (index > currentIndex) {
                            const rect = channel.getBoundingClientRect();
                            const channelCenterX = rect.left + rect.width / 2;
                            const horizontalDistance = Math.abs(currentCenterX - channelCenterX);
                            const verticalDistance = rect.top - currentRect.bottom;

                            if (verticalDistance > 0 && verticalDistance < 100) {
                                const totalDistance = horizontalDistance + verticalDistance;
                                if (totalDistance < bestDistance) {
                                    bestDistance = totalDistance;
                                    bestMatch = channel;
                                }
                            }
                        }
                    });

                    if (bestMatch) {
                        currentFocused.classList.remove('focused');
                        bestMatch.classList.add('focused');
                        bestMatch.focus();
                        bestMatch.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        e.preventDefault();
                    }
                } else if (key === 'ArrowUp' || keyCode === 38) {
                    const currentRect = currentFocused.getBoundingClientRect();
                    const currentCenterX = currentRect.left + currentRect.width / 2;
                    let bestMatch = null;
                    let bestDistance = Infinity;

                    channels.forEach((channel, index) => {
                        if (index < currentIndex) {
                            const rect = channel.getBoundingClientRect();
                            const channelCenterX = rect.left + rect.width / 2;
                            const horizontalDistance = Math.abs(currentCenterX - channelCenterX);
                            const verticalDistance = currentRect.top - rect.bottom;

                            if (verticalDistance > 0 && verticalDistance < 100) {
                                const totalDistance = horizontalDistance + verticalDistance;
                                if (totalDistance < bestDistance) {
                                    bestDistance = totalDistance;
                                    bestMatch = channel;
                                }
                            }
                        }
                    });

                    if (bestMatch) {
                        currentFocused.classList.remove('focused');
                        bestMatch.classList.add('focused');
                        bestMatch.focus();
                        bestMatch.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        e.preventDefault();
                    } else if (currentIndex === 0 && isSearchActive) {
                        currentFocused.classList.remove('focused');
                        activeZone = 'search';
                        searchInput.focus();
                        e.preventDefault();
                    }
                } else if (key === 'Enter' || isEnterKey) {
                    if (isTransitionInProgress) {
                        e.preventDefault();
                        return;
                    }
                    isTransitionInProgress = true;
                    playChannel(currentFocused);
                    e.preventDefault();
                    setTimeout(() => isTransitionInProgress = false, 500);
                } else if (e.keyCode === 405 || e.keyCode === 70) {
                    const favoriteIcon = currentFocused.querySelector('.favorite-icon');
                    if (favoriteIcon) {
                        const channelId = favoriteIcon.dataset.channelId;
                        const added = toggleFavorite(channelId);
                        if (added) {
                            favoriteIcon.classList.add('favorited');
                            favoriteIcon.innerHTML = '★';
                            favoriteIcon.title = translations[currentLang]['remove-from-favorites'];
                        } else {
                            favoriteIcon.classList.remove('favorited');
                            favoriteIcon.innerHTML = '☆';
                            favoriteIcon.title = translations[currentLang]['add-to-favorites'];
                        }
                        e.preventDefault();
                    }
                }
            } else {
                if (key === 'ArrowUp' || keyCode === 38) {
                    if (currentIndex > 0) {
                        currentFocused.classList.remove('focused');
                        const newFocused = channels[currentIndex - 1];
                        newFocused.classList.add('focused');
                        newFocused.focus();
                        newFocused.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        localStorage.setItem('selectedChannelIndex', currentIndex - 1);
                        e.preventDefault();
                    } else if (currentIndex === 0 && isSearchActive) {
                        currentFocused.classList.remove('focused');
                        activeZone = 'search';
                        searchInput.focus();
                        e.preventDefault();
                    }
                } else if ((key === 'ArrowDown' || keyCode === 40) && currentIndex < channels.length - 1) {
                    currentFocused.classList.remove('focused');
                    const newFocused = channels[currentIndex + 1];
                    newFocused.classList.add('focused');
                    newFocused.focus();
                    newFocused.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    localStorage.setItem('selectedChannelIndex', currentIndex + 1);
                    e.preventDefault();
                } else if (key === 'ArrowLeft' || keyCode === 37) {
                    if (isSearchActive) {
                        currentFocused.classList.remove('focused');
                        activeZone = 'search';
                        searchInput.focus();
                    } else {
                        activeZone = 'sidebar';
                        const activeCategory = document.querySelector('.category-item.active');
                        if (activeCategory) {
                            activeCategory.classList.add('focused');
                            activeCategory.focus();
                        } else {
                            const firstCategory = sidebar.querySelector('.category-item');
                            if (firstCategory) {
                                firstCategory.classList.add('focused');
                                firstCategory.focus();
                            }
                        }
                    }
                    e.preventDefault();
                } else if (key === 'ArrowRight' || keyCode === 39) {
                    const favoriteIcon = currentFocused.querySelector('.favorite-icon');
                    if (favoriteIcon) {
                        favoriteIcon.tabIndex = 0;
                        favoriteIcon.focus();
                        e.preventDefault();
                    }
                } else if (key === 'Enter' || isEnterKey) {
                    if (isTransitionInProgress) {
                        e.preventDefault();
                        return;
                    }
                    isTransitionInProgress = true;
                    playChannel(currentFocused);
                    e.preventDefault();
                    setTimeout(() => isTransitionInProgress = false, 500);
                } else if (e.keyCode === 405 || e.keyCode === 70) {
                    const favoriteIcon = currentFocused.querySelector('.favorite-icon');
                    if (favoriteIcon) {
                        const channelId = favoriteIcon.dataset.channelId;
                        const added = toggleFavorite(channelId);
                        if (added) {
                            favoriteIcon.classList.add('favorited');
                            favoriteIcon.innerHTML = '★';
                            favoriteIcon.title = translations[currentLang]['remove-from-favorites'];
                        } else {
                            favoriteIcon.classList.remove('favorited');
                            favoriteIcon.innerHTML = '☆';
                            favoriteIcon.title = translations[currentLang]['add-to-favorites'];
                        }
                        e.preventDefault();
                    }
                }
            }
            return;
        }

        // FAVORITE ICON Navigation
        if (document.activeElement && document.activeElement.classList.contains('favorite-icon')) {
            if (key === 'ArrowLeft' || keyCode === 37) {
                const channelItem = document.activeElement.parentElement;
                document.activeElement.tabIndex = -1;
                channelItem.focus();
                e.preventDefault();
            } else if (key === 'Enter' || isEnterKey) {
                const favoriteIcon = document.activeElement;
                const channelId = favoriteIcon.dataset.channelId;
                const added = toggleFavorite(channelId);
                if (added) {
                    favoriteIcon.classList.add('favorited');
                    favoriteIcon.innerHTML = '★';
                    favoriteIcon.title = translations[currentLang]['remove-from-favorites'];
                } else {
                    favoriteIcon.classList.remove('favorited');
                    favoriteIcon.innerHTML = '☆';
                    favoriteIcon.title = translations[currentLang]['add-to-favorites'];
                }
                e.preventDefault();
            }
            return;
        }

        // OSD Navigation
        if (activeZone === 'osd') {
            if (key === 'ArrowUp' || keyLower === 'arrowup' || keyCode === 38) {
                if (osdFocusedColumn === 'close') {
                    if (osdCloseBtn && osdCloseBtn.classList) {
                        osdCloseBtn.classList.remove('focused');
                    }
                    osdFocusedColumn = 'subtitle';
                    osdFocusedIndex = 0;
                    const subtitleItems = Array.from(subtitleTracksList.querySelectorAll('.osd-item'));
                    if (subtitleItems.length > 0 && subtitleItems[0] && subtitleItems[0].classList) {
                        subtitleItems[0].classList.add('focused');
                        subtitleItems[0].focus();
                    }
                } else {
                    const currentList = osdFocusedColumn === 'audio' ? audioTracksList : subtitleTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
                    if (items.length === 0) return;
                    if (osdFocusedIndex > 0) {
                        const currentFocused = items[osdFocusedIndex];
                        if (currentFocused && currentFocused.classList) {
                            currentFocused.classList.remove('focused');
                        }
                        osdFocusedIndex--;
                        if (items[osdFocusedIndex] && items[osdFocusedIndex].classList) {
                            items[osdFocusedIndex].classList.add('focused');
                            items[osdFocusedIndex].focus();
                            items[osdFocusedIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
                        }
                    }
                }
                e.preventDefault();
            } else if (key === 'ArrowDown' || keyLower === 'arrowdown' || keyCode === 40) {
                if (osdFocusedColumn !== 'close') {
                    const currentList = osdFocusedColumn === 'audio' ? audioTracksList : subtitleTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
                    if (items.length === 0) return;
                    if (osdFocusedIndex < items.length - 1) {
                        const currentFocused = items[osdFocusedIndex];
                        if (currentFocused && currentFocused.classList) {
                            currentFocused.classList.remove('focused');
                        }
                        osdFocusedIndex++;
                        if (items[osdFocusedIndex] && items[osdFocusedIndex].classList) {
                            items[osdFocusedIndex].classList.add('focused');
                            items[osdFocusedIndex].focus();
                            items[osdFocusedIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
                        }
                    } else {
                        const currentFocused = items[osdFocusedIndex];
                        if (currentFocused && currentFocused.classList) {
                            currentFocused.classList.remove('focused');
                        }
                        osdFocusedColumn = 'close';
                        if (osdCloseBtn && osdCloseBtn.classList) {
                            osdCloseBtn.classList.add('focused');
                            osdCloseBtn.focus();
                        }
                    }
                }
                e.preventDefault();
            } else if (key === 'ArrowLeft' || keyLower === 'arrowleft' || keyCode === 37) {
                if (osdFocusedColumn === 'subtitle') {
                    const currentList = subtitleTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
                    if (items.length === 0) return;
                    const currentFocused = items[osdFocusedIndex];
                    if (currentFocused && currentFocused.classList && currentFocused.classList.contains('sync-control')) {
                        adjustSubtitleSync(-0.5);
                        updateSyncValueDisplay();
                        e.preventDefault();
                        return;
                    }
                }

                if (osdFocusedColumn === 'subtitle') {
                    const currentList = subtitleTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
                    if (items.length === 0) return;
                    const currentFocused = items[osdFocusedIndex];
                    if (currentFocused && currentFocused.classList) {
                        currentFocused.classList.remove('focused');
                    }
                    osdFocusedColumn = 'audio';
                    osdFocusedIndex = 0;
                    const audioItems = Array.from(audioTracksList.querySelectorAll('.osd-item'));
                    if (audioItems.length > 0 && audioItems[0] && audioItems[0].classList) {
                        audioItems[0].classList.add('focused');
                        audioItems[0].focus();
                    }
                } else if (osdFocusedColumn === 'close') {
                    if (osdCloseBtn && osdCloseBtn.classList) {
                        osdCloseBtn.classList.remove('focused');
                    }
                    osdFocusedColumn = 'subtitle';
                    osdFocusedIndex = 0;
                    const subtitleItems = Array.from(subtitleTracksList.querySelectorAll('.osd-item'));
                    if (subtitleItems.length > 0 && subtitleItems[0] && subtitleItems[0].classList) {
                        subtitleItems[0].classList.add('focused');
                        subtitleItems[0].focus();
                    }
                }
                e.preventDefault();
            } else if (key === 'ArrowRight' || keyLower === 'arrowright' || keyCode === 39) {
                if (osdFocusedColumn === 'subtitle') {
                    const currentList = subtitleTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
                    if (items.length === 0) return;
                    const currentFocused = items[osdFocusedIndex];
                    if (currentFocused && currentFocused.classList && currentFocused.classList.contains('sync-control')) {
                        adjustSubtitleSync(0.5);
                        updateSyncValueDisplay();
                        e.preventDefault();
                        return;
                    }
                }

                if (osdFocusedColumn === 'audio') {
                    const currentList = audioTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
                    if (items.length === 0) return;
                    const currentFocused = items[osdFocusedIndex];
                    if (currentFocused && currentFocused.classList) {
                        currentFocused.classList.remove('focused');
                    }
                    osdFocusedColumn = 'subtitle';
                    osdFocusedIndex = 0;
                    const subtitleItems = Array.from(subtitleTracksList.querySelectorAll('.osd-item'));
                    if (subtitleItems.length > 0 && subtitleItems[0] && subtitleItems[0].classList) {
                        subtitleItems[0].classList.add('focused');
                        subtitleItems[0].focus();
                    }
                } else if (osdFocusedColumn === 'subtitle') {
                    const currentList = subtitleTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
                    if (items.length === 0) return;
                    const currentFocused = items[osdFocusedIndex];
                    if (currentFocused && currentFocused.classList) {
                        currentFocused.classList.remove('focused');
                    }
                    osdFocusedColumn = 'close';
                    if (osdCloseBtn && osdCloseBtn.classList) {
                        osdCloseBtn.classList.add('focused');
                        osdCloseBtn.focus();
                    }
                }
                e.preventDefault();
            } else if (key === 'Enter' || keyLower === 'enter' || isEnterKey) {
                if (isTransitionInProgress) {
                    e.preventDefault();
                    return;
                }
                isTransitionInProgress = true;
                if (osdFocusedColumn === 'close') {
                    hideOSD();
                    activeZone = 'player';
                } else {
                    const currentList = osdFocusedColumn === 'audio' ? audioTracksList : subtitleTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
                    if (items.length === 0 || osdFocusedIndex >= items.length) return;
                    const currentFocused = items[osdFocusedIndex];
                    selectOSDItem(currentFocused);
                }
                e.preventDefault();
                setTimeout(() => isTransitionInProgress = false, 500);
            }
            return;
        }

        // Player zone - Back button is handled by popstate listener only
        if (activeZone === 'player') {
            return;
        }
    }
});
