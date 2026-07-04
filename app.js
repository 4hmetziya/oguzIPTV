document.addEventListener('DOMContentLoaded', function() {
    console.log('oguzIPTV initialized');

    // Global placeholder image for missing logos/posters
    const PLACEHOLDER_IMG = 'assets/placeholder.png';

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

            'lang-toggle': 'Language: EN',
            'category-favorites': 'Favorites',
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
            // Check if we're in favorites category
            if (activeCategoryId === 'favorites' || (typeof activeCategoryId === 'string' && activeCategoryId === 'favorites')) {
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
    }

    // Toggle language function
    function toggleLanguage() {
        currentLang = currentLang === 'tr' ? 'en' : 'tr';
        localStorage.setItem('appLang', currentLang);
        updateTranslations();
    }

    // Favorites management functions
    function getFavorites() {
        return favorites;
    }

    function saveFavorites() {
        localStorage.setItem('favorites', JSON.stringify(favorites));
    }

    function isFavorite(channelId) {
        return favorites.includes(channelId);
    }

    function toggleFavorite(channelId) {
        console.log('toggleFavorite called with channelId:', channelId);
        console.log('Current favorites before toggle:', favorites);

        const index = favorites.indexOf(channelId);

        if (index > -1) {
            // Remove from favorites
            favorites.splice(index, 1);
            console.log('Removed from favorites');
        } else {
            // Add to favorites
            favorites.push(channelId);
            console.log('Added to favorites');
        }

        console.log('Current favorites after toggle:', favorites);

        // Immediately save to localStorage
        saveFavorites();
        console.log('Saved to localStorage');

        return index === -1; // Returns true if added, false if removed
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
    let favorites = JSON.parse(localStorage.getItem('favorites')) || []; // Global favorites array

    // Initialize webOS history state for back button handling
    history.pushState({'page': 'main'}, 'main', location.href);

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
        // Refreshed on channels view, reload categories and channels
        console.log('Restoring channels view');
        loadCredentials();
        switchTab('xtream');
        fetchCategories(xtreamServer, xtreamUsername, xtreamPassword);
    } else if (currentHash === '#player') {
        // Refreshed on player view, restore video playback
        console.log('Restoring player view');
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
    
    // Tab switching
    tabXtream.addEventListener('click', () => {
        console.log('Xtream tab clicked');
        switchTab('xtream');
    });
    tabM3u.addEventListener('click', () => {
        console.log('M3U tab clicked');
        switchTab('m3u');
    });

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
    searchInput.addEventListener('input', handleSearchInput);

    // Resume modal button click handlers
    btnResume.addEventListener('click', function() {
        videoPlayer.currentTime = pendingResumeTime;
        videoPlayer.play().catch(err => console.log('Play interrupted:', err));
        resumeModal.style.display = 'none';
        activeZone = 'player';
        isEnteringPlayer = true;
        window.location.hash = '#player';
        setTimeout(() => isEnteringPlayer = false, 300);
    });

    btnRestart.addEventListener('click', function() {
        videoPlayer.currentTime = 0;
        videoPlayer.play().catch(err => console.log('Play interrupted:', err));
        resumeModal.style.display = 'none';
        activeZone = 'player';
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

    // Initialize translations on load
    updateTranslations();

    // Video progress saving for VOD
    videoPlayer.addEventListener('timeupdate', function() {
        // Only save progress for VOD (not live streams)
        if (currentStreamUrl && !currentStreamUrl.includes('.m3u8') && videoPlayer.currentTime > 10) {
            localStorage.setItem(`progress_${currentStreamUrl}`, videoPlayer.currentTime);
        }
    });

    // Clear progress when video ends
    videoPlayer.addEventListener('ended', function() {
        if (currentStreamUrl) {
            localStorage.removeItem(`progress_${currentStreamUrl}`);
        }
    });

    // Spatial navigation with arrow keys
    document.addEventListener('keydown', handleSpatialNavigation);

    // Hash routing for browser back button and refresh persistence
    window.addEventListener('hashchange', function() {
        isProgrammaticHashChange = true;
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
            } else if (activeZone === 'resume-modal') {
                resumeModal.style.display = 'none';
                videoPlayer.src = '';
                activeZone = 'channels';
                window.location.hash = '#channels';
                history.pushState({'page': 'main'}, 'main', location.href);
            } else if (activeZone === 'player') {
                videoPlayer.pause();
                videoPlayer.style.display = 'none';
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
                console.log('Please fill all Xtream fields');
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

            // Test fallback: empty or 'test' input
            if (!playlistUrl || playlistUrl.toLowerCase() === 'test') {
                playlistUrl = 'https://iptv-org.github.io/iptv/countries/tr.m3u';
                console.log('Using test playlist URL:', playlistUrl);
            }

            if (!playlistUrl) {
                console.log('Please enter playlist URL');
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
    
    function showCategories(categories) {
        console.log('showCategories called with', categories.length, 'categories');

        // Hide login container, show main content
        loginContainer.style.display = 'none';
        mainContent.style.display = 'flex';
        sidebar.style.display = 'flex';
        channelList.style.display = 'flex';

        // Clear existing categories
        sidebar.innerHTML = '';

        // Add Favorites category at the top
        const favoritesItem = document.createElement('div');
        favoritesItem.className = 'category-item';
        favoritesItem.textContent = translations[currentLang]['category-favorites'];
        favoritesItem.dataset.categoryId = 'favorites';
        favoritesItem.dataset.isFavorites = 'true';
        favoritesItem.tabIndex = 0;

        // Add click event listener for Favorites
        favoritesItem.addEventListener('click', () => {
            selectCategory(favoritesItem);
        });

        sidebar.appendChild(favoritesItem);

        // Render regular categories
        categories.forEach((category, index) => {
            const categoryItem = document.createElement('div');
            categoryItem.className = 'category-item';
            categoryItem.textContent = category.category_name;
            categoryItem.dataset.categoryId = category.category_id;
            categoryItem.tabIndex = 0;

            // Add click event listener
            categoryItem.addEventListener('click', () => {
                selectCategory(categoryItem);
            });

            sidebar.appendChild(categoryItem);
        });

        console.log('Categories appended to DOM, total children:', sidebar.children.length);

        // Apply .focused class to first category or restore saved category
        const savedCategoryId = localStorage.getItem('activeCategoryId');
        const categoryItems = sidebar.querySelectorAll('.category-item');
        let categoryToFocus;

        if (savedCategoryId) {
            categoryToFocus = Array.from(categoryItems).find(item => item.dataset.categoryId === savedCategoryId);
        }

        if (!categoryToFocus) {
            categoryToFocus = categoryItems[0];
        }

        if (categoryToFocus) {
            categoryToFocus.classList.add('focused');
            categoryToFocus.classList.add('active');
            activeCategoryId = categoryToFocus.dataset.categoryId;
            activeZone = 'sidebar';
            console.log('Applied focused class to category:', categoryToFocus.textContent);

            // Auto-load channels for the selected category
            const xtreamServer = localStorage.getItem('xtream_server');
            const xtreamUsername = localStorage.getItem('xtream_username');
            const xtreamPassword = localStorage.getItem('xtream_password');
            if (xtreamServer && xtreamUsername && xtreamPassword) {
                fetchChannelsByCategory(xtreamServer, xtreamUsername, xtreamPassword, activeCategoryId);
            }
        }

        console.log('showCategories completed');
    }

    function selectCategory(categoryItem) {
        // Remove active class from all categories
        const allCategories = sidebar.querySelectorAll('.category-item');
        allCategories.forEach(cat => cat.classList.remove('active'));

        // Add active class to selected category
        categoryItem.classList.add('active');
        categoryItem.classList.add('focused');

        // Save to localStorage
        activeCategoryId = categoryItem.dataset.categoryId;

        // Check if this is the Favorites category
        if (categoryItem.dataset.isFavorites === 'true') {
            // Fetch all streams for current content type to ensure cache is populated
            const xtreamServer = localStorage.getItem('xtream_server');
            const xtreamUsername = localStorage.getItem('xtream_username');
            const xtreamPassword = localStorage.getItem('xtream_password');
            if (xtreamServer && xtreamUsername && xtreamPassword) {
                fetchAllStreamsForFavorites(xtreamServer, xtreamUsername, xtreamPassword);
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
        const favorites = getFavorites();
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
            channelElement.tabIndex = 0;

            // Check if grid view is active
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
                nameSpan.textContent = channel.name;
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
                nameSpan.textContent = channel.name;
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

        // Focus first channel
        const firstChannel = channelList.querySelector('.channel-item');
        if (firstChannel) {
            firstChannel.classList.add('focused');
            activeZone = 'channels';
        }
    }

    function showChannelList(channels) {
        console.log('showChannelList called with', channels.length, 'channels');
        console.log('Current activeCategoryId:', activeCategoryId);
        console.log('Current favorites:', favorites);

        // Clear existing channels
        channelList.innerHTML = '';

        // Filter for Favorites category
        let channelsToRender = channels;
        if (activeCategoryId === 'favorites' || (typeof activeCategoryId === 'string' && activeCategoryId === 'favorites')) {
            console.log('Filtering for favorites category');
            channelsToRender = channels.filter(channel => {
                const channelId = channel.id || channel.stream_id;
                console.log('Checking channel:', channel.name, 'ID:', channelId, 'Is favorite:', favorites.includes(channelId));
                return favorites.includes(channelId);
            });
            console.log(`Filtered to ${channelsToRender.length} favorite channels`);

            if (channelsToRender.length === 0) {
                const emptyState = document.createElement('div');
                emptyState.className = 'empty-state';
                emptyState.textContent = translations[currentLang]['no-favorites'];
                channelList.appendChild(emptyState);
                return;
            }
        }

        // Limit to first 200 channels for performance
        channelsToRender = channelsToRender.slice(0, 200);
        console.log(`Rendering ${channelsToRender.length} channels (limited from ${channels.length} total)`);

        // Render channels
        channelsToRender.forEach((channel, index) => {
            const channelItem = document.createElement('div');
            channelItem.className = 'channel-item';
            channelItem.dataset.url = channel.url;
            channelItem.tabIndex = 0; // Make focusable

            // Assign series_id if it exists
            if (channel.series_id) {
                channelItem.dataset.seriesId = channel.series_id;
            }

            // Check if grid view is active
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
                channelItem.appendChild(logoContainer);

                // Add overlay with channel name and favorite icon
                const overlay = document.createElement('div');
                overlay.className = 'grid-item-overlay';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'channel-name';
                nameSpan.textContent = channel.name;
                overlay.appendChild(nameSpan);

                // Add favorite icon
                const favoriteIcon = document.createElement('span');
                favoriteIcon.className = 'favorite-icon';
                favoriteIcon.innerHTML = '☆';
                favoriteIcon.title = translations[currentLang]['add-to-favorites'];
                favoriteIcon.dataset.channelId = channel.id || channel.stream_id;
                favoriteIcon.tabIndex = -1;

                // Check if this channel is already a favorite
                const channelId = channel.id || channel.stream_id;
                if (channelId && isFavorite(channelId)) {
                    favoriteIcon.classList.add('favorited');
                    favoriteIcon.innerHTML = '★';
                    favoriteIcon.title = translations[currentLang]['remove-from-favorites'];
                }

                // Add click event for favorite icon
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
                channelItem.appendChild(logoContainer);

                // Add channel name
                const nameSpan = document.createElement('span');
                nameSpan.className = 'channel-name';
                nameSpan.textContent = channel.name;
                channelItem.appendChild(nameSpan);

                // Add favorite icon
                const favoriteIcon = document.createElement('span');
                favoriteIcon.className = 'favorite-icon';
                favoriteIcon.innerHTML = '☆';
                favoriteIcon.title = translations[currentLang]['add-to-favorites'];
                favoriteIcon.dataset.channelId = channel.id || channel.stream_id;
                favoriteIcon.tabIndex = -1; // Not focusable by default, only via navigation

                // Check if this channel is already a favorite
                const channelId = channel.id || channel.stream_id;
                if (channelId && isFavorite(channelId)) {
                    favoriteIcon.classList.add('favorited');
                    favoriteIcon.innerHTML = '★';
                    favoriteIcon.title = translations[currentLang]['remove-from-favorites'];
                }

                // Add click event for favorite icon
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

            // Add click event listener for mouse selection (common to both views)
            channelItem.addEventListener('click', () => {
                playChannel(channelItem);
            });

            channelList.appendChild(channelItem);
        });

        console.log('Channels appended to DOM, total children:', channelList.children.length);

        // Apply .focused class to first channel or restore saved index
        const savedIndex = parseInt(localStorage.getItem('selectedChannelIndex')) || 0;
        const channelItems = channelList.querySelectorAll('.channel-item');
        const channelToFocus = channelItems[savedIndex] || channelItems[0];

        if (channelToFocus) {
            channelToFocus.classList.add('focused');
            console.log('Applied focused class to channel at index:', savedIndex);
        }

        console.log('showChannelList completed');
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

        console.log('Parsed M3U channels:', Object.keys(channelsByCategory).length, 'categories');
        console.log('Total channels in allStreamsCache:', allStreamsCache.length);

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

            const apiUrl = `${serverUrl}/player_api.php?username=${username}&password=${password}&action=${action}`;
            console.log('Fetching categories from:', apiUrl);

            const response = await fetch(apiUrl);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Categories received:', data.length);

            if (!Array.isArray(data) || data.length === 0) {
                showError('Kategori listesi boş veya geçersiz');
                console.error('Invalid categories response');
                return;
            }

            showCategories(data);

            // Set hash to channels view after successful login
            window.location.hash = '#channels';

        } catch (error) {
            console.error('Error fetching categories:', error);
            showError(`Bağlantı hatası: ${error.message}`);
        } finally {
            loadingIndicator.style.display = 'none';
            loadingIndicator.querySelector('p').textContent = 'Yükleniyor...';
            connectBtn.disabled = false;
        }
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

            const apiUrl = `${serverUrl}/player_api.php?username=${username}&password=${password}&action=${action}`;
            console.log('Fetching all streams for favorites from:', apiUrl);

            const response = await fetch(apiUrl);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('All streams received:', data.length);

            if (!Array.isArray(data) || data.length === 0) {
                showChannelList([]);
                return;
            }

            // Map Xtream JSON objects to our channel format
            allStreamsCache = data.map(item => {
                let url;
                if (currentContentType === 'live') {
                    url = `${serverUrl}/live/${username}/${password}/${item.stream_id}.m3u8`;
                } else if (currentContentType === 'movies') {
                    const containerExtension = item.container_extension || 'mp4';
                    url = `${serverUrl}/movie/${username}/${password}/${item.stream_id}.${containerExtension}`;
                } else if (currentContentType === 'series') {
                    return {
                        id: item.series_id,
                        name: item.name,
                        series_id: item.series_id,
                        logo: item.stream_icon || null,
                        url: null
                    };
                }

                return {
                    id: item.stream_id,
                    name: item.name,
                    logo: item.stream_icon || null,
                    url: url
                };
            });

            console.log('Cached streams:', allStreamsCache.length);

            // Show filtered favorites
            showChannelList(allStreamsCache);

        } catch (error) {
            console.error('Error fetching streams for favorites:', error);
            showError(`Bağlantı hatası: ${error.message}`);
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

            const apiUrl = `${serverUrl}/player_api.php?username=${username}&password=${password}&action=${action}&category_id=${categoryId}`;
            console.log('Fetching streams for category', categoryId, 'from:', apiUrl);

            const response = await fetch(apiUrl);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Streams received for category:', data.length);

            if (!Array.isArray(data) || data.length === 0) {
                showError('Bu kategoride içerik bulunamadı');
                console.error('Invalid streams response');
                return;
            }

            // Map Xtream JSON objects to our channel format with URL construction based on content type
            const channels = data.map(item => {
                let url;
                if (currentContentType === 'live') {
                    url = `${serverUrl}/live/${username}/${password}/${item.stream_id}.m3u8`;
                } else if (currentContentType === 'movies') {
                    const containerExtension = item.container_extension || 'mp4';
                    url = `${serverUrl}/movie/${username}/${password}/${item.stream_id}.${containerExtension}`;
                } else if (currentContentType === 'series') {
                    // Series require a different approach - we need to fetch series info first
                    // For now, store the series_id and handle it in selectSeries
                    return {
                        id: item.series_id,
                        name: item.name,
                        series_id: item.series_id,
                        logo: item.stream_icon || null,
                        url: null // Will be set when user selects a series
                    };
                }

                return {
                    id: item.stream_id,
                    name: item.name,
                    logo: item.stream_icon || null,
                    url: url
                };
            });

            console.log('Mapped streams:', channels.length);

            // Update allStreamsCache with these channels
            channels.forEach(channel => {
                if (channel.stream_id) {
                    channel.id = channel.stream_id;
                }
                // Check if channel already exists in cache
                const existingIndex = allStreamsCache.findIndex(c => c.id === channel.id);
                if (existingIndex > -1) {
                    allStreamsCache[existingIndex] = channel;
                } else {
                    allStreamsCache.push(channel);
                }
            });
            console.log('Updated allStreamsCache:', allStreamsCache.length);

            showChannelList(channels);

        } catch (error) {
            console.error('Error fetching streams:', error);
            showError(`Bağlantı hatası: ${error.message}`);
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
            console.log('Fetching series info for series_id:', seriesId);

            const response = await fetch(`${serverUrl}/player_api.php?username=${username}&password=${password}&action=get_series_info&series_id=${seriesId}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Series info received:', data);

            // Check for subtitles in series info
            if (data && data.subtitles && Array.isArray(data.subtitles)) {
                console.log('Found subtitles in series info:', data.subtitles);
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

            // Iterate through seasons (keys are season numbers)
            for (const seasonKey in episodesObj) {
                const seasonEpisodes = episodesObj[seasonKey];
                if (Array.isArray(seasonEpisodes)) {
                    seasonEpisodes.forEach(episode => {
                        // Format episode name: S1 E1 - Title
                        const seasonNum = episode.season || seasonKey;
                        const episodeNum = episode.episode_num || '1';
                        const title = episode.title || 'Episode';
                        const formattedName = `S${seasonNum} E${episodeNum} - ${title}`;

                        // Construct playable URL
                        const containerExtension = episode.container_extension || 'mp4';
                        const url = `${serverUrl}/series/${username}/${password}/${episode.id}.${containerExtension}`;

                        episodes.push({
                            name: formattedName,
                            logo: data.cover || null,
                            url: url
                        });
                    });
                }
            }

            console.log('Flattened episodes:', episodes.length);

            if (episodes.length === 0) {
                showError('No episodes available');
                loadingIndicator.style.display = 'none';
                return;
            }

            // Render episodes in channel list
            showChannelList(episodes);

        } catch (error) {
            console.error('Error fetching series info:', error);
            showError(`Bağlantı hatası: ${error.message}`);
        } finally {
            loadingIndicator.style.display = 'none';
            loadingIndicator.querySelector('p').textContent = 'Yükleniyor...';
        }
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
            console.log('Fetching all streams for content type:', currentContentType);

            let action;
            if (currentContentType === 'live') {
                action = 'get_live_streams';
            } else if (currentContentType === 'movies') {
                action = 'get_vod_streams';
            } else if (currentContentType === 'series') {
                action = 'get_series';
            }

            const response = await fetch(`${serverUrl}/player_api.php?username=${username}&password=${password}&action=${action}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('All streams received:', data.length);

            if (!Array.isArray(data) || data.length === 0) {
                showError('No streams found');
                loadingIndicator.style.display = 'none';
                return;
            }

            // Map streams to our format (same logic as fetchChannelsByCategory)
            allStreamsCache = data.map(item => {
                let url;
                if (currentContentType === 'live') {
                    url = `${serverUrl}/live/${username}/${password}/${item.stream_id}.m3u8`;
                } else if (currentContentType === 'movies') {
                    const containerExtension = item.container_extension || 'mp4';
                    url = `${serverUrl}/movie/${username}/${password}/${item.stream_id}.${containerExtension}`;
                } else if (currentContentType === 'series') {
                    return {
                        id: item.series_id,
                        name: item.name,
                        series_id: item.series_id,
                        logo: item.stream_icon || null,
                        url: null
                    };
                }

                return {
                    id: item.stream_id,
                    name: item.name,
                    logo: item.stream_icon || null,
                    url: url
                };
            });

            console.log('Cached streams:', allStreamsCache.length);

            // Show all streams initially (limit to 200)
            showChannelList(allStreamsCache.slice(0, 200));

            // Focus search input
            searchInput.value = '';
            searchInput.focus();

        } catch (error) {
            console.error('Error fetching all streams:', error);
            showError(`Bağlantı hatası: ${error.message}`);
        } finally {
            loadingIndicator.style.display = 'none';
            loadingIndicator.querySelector('p').textContent = 'Yükleniyor...';
        }
    }

    function handleSearchInput(e) {
        const query = e.target.value.toLowerCase().trim();

        if (query === '') {
            // Show all cached streams (limited to 200)
            showChannelList(allStreamsCache.slice(0, 200));
            return;
        }

        // Filter streams by name (case-insensitive)
        const filtered = allStreamsCache.filter(stream =>
            stream.name.toLowerCase().includes(query)
        );

        // Limit results to 200 for performance
        showChannelList(filtered.slice(0, 200));
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
            console.log('Fetching M3U playlist from:', url);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const content = await response.text();
            console.log('M3U content fetched, length:', content.length);

            // Parse M3U and group channels by category
            m3uChannelsByCategory = parseM3U(content);
            const categoryNames = Object.keys(m3uChannelsByCategory);
            console.log('Parsed categories:', categoryNames.length);

            if (categoryNames.length === 0) {
                showError('Playlist yüklenemedi - kategori bulunamadı');
                return;
            }

            // Render M3U categories into sidebar
            showM3UCategories(categoryNames);

            // Set hash to channels view after successful M3U load
            window.location.hash = '#channels';

        } catch (error) {
            console.error('Error fetching or parsing M3U:', error);
            showError(`Bağlantı hatası: ${error.message}`);
        } finally {
            loadingIndicator.style.display = 'none';
            loadingIndicator.querySelector('p').textContent = 'Yükleniyor...';
            connectBtn.disabled = false;
        }
    }

    function showM3UCategories(categoryNames) {
        console.log('showM3HCategories called with', categoryNames.length, 'categories');

        // Hide login container, show main content
        loginContainer.style.display = 'none';
        mainContent.style.display = 'flex';
        sidebar.style.display = 'flex';
        channelList.style.display = 'flex';

        // Clear existing categories
        sidebar.innerHTML = '';

        // Add Favorites category at the top
        const favoritesItem = document.createElement('div');
        favoritesItem.className = 'category-item';
        favoritesItem.textContent = translations[currentLang]['category-favorites'];
        favoritesItem.dataset.categoryName = 'favorites';
        favoritesItem.dataset.isFavorites = 'true';
        favoritesItem.tabIndex = 0;

        // Add click event listener for Favorites
        favoritesItem.addEventListener('click', () => {
            selectM3UCategory(favoritesItem);
        });

        sidebar.appendChild(favoritesItem);

        // Render categories
        categoryNames.forEach((categoryName, index) => {
            const categoryItem = document.createElement('div');
            categoryItem.className = 'category-item';
            categoryItem.textContent = categoryName;
            categoryItem.dataset.categoryName = categoryName;
            categoryItem.tabIndex = 0;

            // Add click event listener
            categoryItem.addEventListener('click', () => {
                selectM3UCategory(categoryItem);
            });

            sidebar.appendChild(categoryItem);
        });

        console.log('M3U categories appended to DOM, total children:', sidebar.children.length);

        // Apply .focused class to first category
        const categoryItems = sidebar.querySelectorAll('.category-item');
        if (categoryItems.length > 0) {
            categoryItems[0].classList.add('focused');
            categoryItems[0].classList.add('active');
            activeCategoryId = categoryItems[0].dataset.categoryName;
            activeZone = 'sidebar';

            // Auto-load channels for the first category
            selectM3UCategory(categoryItems[0]);
        }

        console.log('showM3UCategories completed');
    }

    function selectM3UCategory(categoryItem) {
        // Remove active class from all categories
        const allCategories = sidebar.querySelectorAll('.category-item');
        allCategories.forEach(cat => cat.classList.remove('active'));

        // Add active class to selected category
        categoryItem.classList.add('active');
        categoryItem.classList.add('focused');

        // Save to localStorage
        activeCategoryId = categoryItem.dataset.categoryName;

        // Check if this is the Favorites category
        if (categoryItem.dataset.isFavorites === 'true') {
            console.log('Favorites category selected in M3U');
            console.log('allStreamsCache length:', allStreamsCache.length);
            console.log('Current favorites:', favorites);
            // Use allStreamsCache to render favorites
            showChannelList(allStreamsCache);
            return;
        }
        localStorage.setItem('activeCategoryId', activeCategoryId);

        // Get channels for this category from the grouped data
        const categoryName = categoryItem.dataset.categoryName;
        const channels = m3uChannelsByCategory[categoryName] || [];

        console.log('Loading channels for category:', categoryName, 'count:', channels.length);

        // Show channels in the channel list
        showChannelList(channels);
    }
    
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
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
    
    function playStream(url) {
        if (!url) {
            console.log('No stream URL provided');
            return;
        }

        // Save current stream URL for progress tracking
        currentStreamUrl = url;
        localStorage.setItem('currentStreamUrl', url);

        // Check if this is VOD and has saved progress
        const isVOD = !url.includes('.m3u8');
        if (isVOD) {
            const savedProgress = localStorage.getItem(`progress_${url}`);
            if (savedProgress && parseFloat(savedProgress) > 10) {
                // Show resume modal instead of playing immediately
                videoPlayer.src = url;

                // Format time as HH:MM:SS
                const savedTime = parseFloat(savedProgress);
                const hours = Math.floor(savedTime / 3600);
                const minutes = Math.floor((savedTime % 3600) / 60);
                const seconds = Math.floor(savedTime % 60);
                const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

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

        // Hide main content and show video player
        mainContent.style.display = 'none';
        document.querySelector('header').style.display = 'none';
        document.querySelector('main').style.display = 'none';
        videoPlayer.style.display = 'block';

        // Check if URL is an M3U8 stream or direct video file
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
                    videoPlayer.play().catch(err => console.log('Play interrupted:', err));
                    // Set hash to player view after HLS is ready
                    isEnteringPlayer = true;
                    window.location.hash = '#player';
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
                    // Set hash to player view after video is ready
                    isEnteringPlayer = true;
                    window.location.hash = '#player';
                    setTimeout(() => isEnteringPlayer = false, 300);
                });

                // Detect and populate audio/subtitle tracks when metadata is loaded
                videoPlayer.addEventListener('loadedmetadata', populateOSDTracks, { once: true });

                // Handle native video errors
                videoPlayer.addEventListener('error', function() {
                    console.error('Native video error occurred');

                    // Show user-friendly error message
                    showError('Stream is currently unavailable or offline');

                    // Auto-hide error message after 4 seconds
                    setTimeout(() => {
                        errorMessage.style.display = 'none';
                    }, 4000);

                    // Return to channel list
                    window.location.hash = '#channels';
                });
            } else {
                console.error('HLS is not supported in this browser');
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

            // Handle native video errors
            videoPlayer.addEventListener('error', function() {
                console.error('Native video error occurred');

                // Show user-friendly error message
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
                // Set hash to player view after video starts
                isEnteringPlayer = true;
                window.location.hash = '#player';
                setTimeout(() => isEnteringPlayer = false, 300);
            }).catch(error => {
                console.error('Playback failed:', error);
                showError('Stream is currently unavailable or offline');
                setTimeout(() => {
                    errorMessage.style.display = 'none';
                }, 4000);
                window.location.hash = '#channels';
            });
        }
    }
    
    function playChannel(channelElement) {
        // Check if this is a series (has series_id)
        if (channelElement.dataset.seriesId && channelElement.dataset.seriesId !== 'undefined') {
            // Show loading indicator
            loadingIndicator.style.display = 'block';
            loadingIndicator.querySelector('p').textContent = 'Episodes yükleniyor...';
            errorMessage.style.display = 'none';

            // Fetch series info
            fetchSeriesInfo(channelElement.dataset.seriesId);
            return;
        }

        const streamUrl = channelElement.dataset.url;
        if (!streamUrl) {
            console.log('No stream URL available for this channel');
            return;
        }

        // Store last focused channel
        lastFocusedChannel = channelElement;

        // Inject subtitle tracks if available
        injectSubtitleTracks();

        playStream(streamUrl);
    }

    function injectSubtitleTracks() {
        // Clear existing subtitle tracks from video element
        const existingTracks = videoPlayer.querySelectorAll('track[kind="subtitles"]');
        existingTracks.forEach(track => track.remove());

        // Check if we have subtitles from API response
        if (window.currentSubtitles && Array.isArray(window.currentSubtitles)) {
            console.log('Injecting subtitle tracks:', window.currentSubtitles);

            window.currentSubtitles.forEach((subtitle, index) => {
                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = subtitle.language || `Subtitle ${index + 1}`;
                track.src = subtitle.url || subtitle.subtitle_url;
                track.srclang = subtitle.lang || subtitle.language || 'en';
                track.default = index === 0;
                videoPlayer.appendChild(track);
            });

            console.log('Subtitle tracks injected successfully');
        } else {
            console.log('No subtitle tracks available to inject');
        }
    }

    function populateOSDTracks() {
        console.log('Populating OSD tracks');

        // Clear existing lists
        audioTracksList.innerHTML = '';
        subtitleTracksList.innerHTML = '';

        // Populate audio tracks
        if (videoPlayer.audioTracks && videoPlayer.audioTracks.length > 0) {
            for (let i = 0; i < videoPlayer.audioTracks.length; i++) {
                const track = videoPlayer.audioTracks[i];
                const item = document.createElement('div');
                item.className = 'osd-item';
                item.textContent = track.label || track.language || `Audio ${i + 1}`;
                item.dataset.trackIndex = i;
                item.dataset.trackType = 'audio';

                if (track.enabled) {
                    item.classList.add('active');
                }

                audioTracksList.appendChild(item);
            }
        } else {
            // No audio tracks available
            const item = document.createElement('div');
            item.className = 'osd-item';
            item.textContent = 'No audio tracks';
            item.style.color = '#888';
            audioTracksList.appendChild(item);
        }

        // Populate subtitle tracks from injected HTML5 tracks
        // Always add 'Off' option at the top
        const offItem = document.createElement('div');
        offItem.className = 'osd-item';
        offItem.textContent = translations[currentLang]['osd-off'];
        offItem.dataset.trackIndex = -1;
        offItem.dataset.trackType = 'subtitle';
        subtitleTracksList.appendChild(offItem);

        if (videoPlayer.textTracks && videoPlayer.textTracks.length > 0) {
            for (let i = 0; i < videoPlayer.textTracks.length; i++) {
                const track = videoPlayer.textTracks[i];
                // Only show subtitle tracks (kind='subtitles')
                if (track.kind === 'subtitles') {
                    const item = document.createElement('div');
                    item.className = 'osd-item';
                    item.textContent = track.label || track.language || `Subtitle ${i + 1}`;
                    item.dataset.trackIndex = i;
                    item.dataset.trackType = 'subtitle';

                    if (track.mode === 'showing') {
                        item.classList.add('active');
                    }

                    subtitleTracksList.appendChild(item);
                }
            }
        }

        // If no subtitle tracks found after filtering
        if (subtitleTracksList.children.length === 1) {
            // Only 'Off' item exists, meaning no subtitles
            const item = document.createElement('div');
            item.className = 'osd-item';
            item.textContent = 'No subtitles';
            item.style.color = '#888';
            subtitleTracksList.appendChild(item);
        }

        console.log('OSD tracks populated');
    }

    function showOSD() {
        playerOsd.style.display = 'flex';
        activeZone = 'osd';
        osdFocusedColumn = 'audio';
        osdFocusedIndex = 0;

        // Hide native controls to prevent visual clash with OSD
        videoPlayer.removeAttribute('controls');

        // Focus first audio item
        const firstAudioItem = audioTracksList.querySelector('.osd-item');
        if (firstAudioItem) {
            firstAudioItem.classList.add('focused');
        }
    }

    function hideOSD() {
        playerOsd.style.display = 'none';
        activeZone = 'player';

        // Remove all focused classes
        document.querySelectorAll('.osd-item.focused').forEach(item => {
            item.classList.remove('focused');
        });

        // Restore native controls for mouse interaction
        videoPlayer.setAttribute('controls', 'controls');

        // Focus video player for keyboard controls (Spacebar to pause, etc.)
        videoPlayer.focus();
    }

    function selectOSDItem(item) {
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
    
    function stopVideo() {
        if (hls) {
            hls.destroy();
            hls = null;
        }
        videoPlayer.pause();
        videoPlayer.src = '';
        videoPlayer.style.display = 'none';
    }
    
    function restoreChannelList() {
        stopVideo();
        document.querySelector('header').style.display = 'block';
        document.querySelector('main').style.display = 'block';
        mainContent.style.display = 'flex';

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
        console.log('Hash changed to:', hash);

        if (hash === '#player') {
            // Show video player, hide main content (only if not already in player view)
            if (videoPlayer.style.display !== 'block') {
                mainContent.style.display = 'none';
                document.querySelector('header').style.display = 'none';
                document.querySelector('main').style.display = 'none';
                videoPlayer.style.display = 'block';
            }
        } else if (hash === '#channels') {
            // Stop video, show main content (only if not already in channels view)
            if (mainContent.style.display !== 'flex') {
                stopVideo();
                document.querySelector('header').style.display = 'block';
                document.querySelector('main').style.display = 'block';
                mainContent.style.display = 'flex';
                restoreChannelList();
            }
        } else {
            // #login or empty - show login container (only if not already in login view)
            if (loginContainer.style.display !== 'block') {
                stopVideo();
                loginContainer.style.display = 'block';
                mainContent.style.display = 'none';
                videoPlayer.style.display = 'none';
                document.querySelector('header').style.display = 'block';
                document.querySelector('main').style.display = 'block';
            }
        }
    }
    
    function handleSpatialNavigation(e) {
        const key = e.key;
        const focusedElement = document.activeElement;

        // Guard clause - if no focused element, return
        if (!focusedElement) {
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
            const navItems = [navLive, navMovies, navSeries, navSearch, viewToggleBtn, langToggleBtn];
            const currentFocused = (focusedElement.classList && focusedElement.classList.contains('nav-button')) ? focusedElement : navLive;
            let currentIndex = navItems.indexOf(currentFocused);

            // Guard clause - if currentFocused not found, default to first item
            if (currentIndex === -1 && navItems.length > 0) {
                currentFocused = navItems[0];
                currentIndex = 0;
            }

            // Exit search mode if navigating away from search button
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
                // Move down to the Sidebar (or search if search is active)
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
            } else if (key === 'Enter') {
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
            if (key === 'ArrowDown') {
                // Move to first item in channel list
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
            if (key === 'ArrowLeft' || key === 'ArrowRight') {
                // Toggle focus between resume and restart buttons
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
            } else if (key === 'Enter') {
                if (isTransitionInProgress) {
                    e.preventDefault();
                    return;
                }
                isTransitionInProgress = true;
                // Execute selected action
                if (btnResume.classList.contains('focused')) {
                    // Resume from saved time
                    videoPlayer.currentTime = pendingResumeTime;
                    videoPlayer.play().catch(err => console.log('Play interrupted:', err));
                } else {
                    // Start from beginning
                    videoPlayer.currentTime = 0;
                    videoPlayer.play().catch(err => console.log('Play interrupted:', err));
                }
                // Hide modal and set player zone
                resumeModal.style.display = 'none';
                activeZone = 'player';
                isEnteringPlayer = true;
                window.location.hash = '#player';
                e.preventDefault();
                setTimeout(() => {
                    isTransitionInProgress = false;
                    isEnteringPlayer = false;
                }, 500);
            } else if (key === 'Backspace' || key === 'Escape') {
                // Cancel and return to channels
                resumeModal.style.display = 'none';
                videoPlayer.src = '';
                activeZone = 'channels';
                window.location.hash = '#channels';
                e.preventDefault();
            }
            return;
        }

        // SIDEBAR Navigation
        if (activeZone === 'sidebar') {
            const focusedCategory = document.querySelector('.category-item.focused');
            const categories = Array.from(sidebar.querySelectorAll('.category-item'));
            const currentFocused = focusedCategory || categories[0];
            const currentIndex = categories.indexOf(currentFocused);

            if (key === 'ArrowUp') {
                if (currentIndex > 0) {
                    currentFocused.classList.remove('focused');
                    const newFocused = categories[currentIndex - 1];
                    newFocused.classList.add('focused');
                    newFocused.focus();
                    newFocused.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    e.preventDefault();
                } else if (currentIndex === 0) {
                    // If at the very top and using Xtream, move up to Top Nav
                    // For M3U connections, top-nav is hidden, so stay at top
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
            } else if (key === 'ArrowDown' && currentIndex < categories.length - 1) {
                currentFocused.classList.remove('focused');
                const newFocused = categories[currentIndex + 1];
                newFocused.classList.add('focused');
                newFocused.focus();
                newFocused.scrollIntoView({ block: 'center', behavior: 'smooth' });
                e.preventDefault();
            } else if (key === 'ArrowRight') {
                // Move to channels zone
                activeZone = 'channels';
                const firstChannel = channelList.querySelector('.channel-item');
                if (firstChannel) {
                    firstChannel.classList.add('focused');
                    firstChannel.focus();
                }
                e.preventDefault();
            } else if (key === 'Enter') {
                if (isTransitionInProgress) {
                    e.preventDefault();
                    return;
                }
                isTransitionInProgress = true;
                // Use appropriate select function based on connection type
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
            const currentIndex = channels.indexOf(currentFocused);
            const isGridView = channelList.classList.contains('grid-view');

            if (isGridView) {
                // 2D Grid Navigation
                if (key === 'ArrowRight') {
                    // Move to next item in row
                    if (currentIndex < channels.length - 1) {
                        currentFocused.classList.remove('focused');
                        const newFocused = channels[currentIndex + 1];
                        newFocused.classList.add('focused');
                        newFocused.focus();
                        newFocused.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        e.preventDefault();
                    }
                } else if (key === 'ArrowLeft') {
                    // Move to previous item in row
                    if (currentIndex > 0) {
                        currentFocused.classList.remove('focused');
                        const newFocused = channels[currentIndex - 1];
                        newFocused.classList.add('focused');
                        newFocused.focus();
                        newFocused.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        e.preventDefault();
                    } else {
                        // Move back to sidebar zone
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
                    }
                } else if (key === 'ArrowDown') {
                    // Move to item in same column in row below
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

                            // Only consider items below current row
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
                } else if (key === 'ArrowUp') {
                    // Move to item in same column in row above
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

                            // Only consider items above current row
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
                        // If at first item and search is active, move back to search input
                        currentFocused.classList.remove('focused');
                        activeZone = 'search';
                        searchInput.focus();
                        e.preventDefault();
                    }
                } else if (key === 'Enter') {
                    if (isTransitionInProgress) {
                        e.preventDefault();
                        return;
                    }
                    isTransitionInProgress = true;
                    playChannel(currentFocused);
                    e.preventDefault();
                    setTimeout(() => isTransitionInProgress = false, 500);
                } else if (e.keyCode === 405 || e.keyCode === 70) {
                    // Yellow button (405) or F key (70) - toggle favorite
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
                // List View Navigation (existing logic)
                if (key === 'ArrowUp') {
                    if (currentIndex > 0) {
                        currentFocused.classList.remove('focused');
                        const newFocused = channels[currentIndex - 1];
                        newFocused.classList.add('focused');
                        newFocused.focus();
                        newFocused.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        localStorage.setItem('selectedChannelIndex', currentIndex - 1);
                        e.preventDefault();
                    } else if (currentIndex === 0 && isSearchActive) {
                        // If at first item and search is active, move back to search input
                        currentFocused.classList.remove('focused');
                        activeZone = 'search';
                        searchInput.focus();
                        e.preventDefault();
                    }
                } else if (key === 'ArrowDown' && currentIndex < channels.length - 1) {
                    currentFocused.classList.remove('focused');
                    const newFocused = channels[currentIndex + 1];
                    newFocused.classList.add('focused');
                    newFocused.focus();
                    newFocused.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    localStorage.setItem('selectedChannelIndex', currentIndex + 1);
                    e.preventDefault();
                } else if (key === 'ArrowLeft') {
                    // Move back to sidebar zone (or search if active)
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
                } else if (key === 'ArrowRight') {
                    // Move to favorite icon
                    const favoriteIcon = currentFocused.querySelector('.favorite-icon');
                    if (favoriteIcon) {
                        favoriteIcon.tabIndex = 0;
                        favoriteIcon.focus();
                        e.preventDefault();
                    }
                } else if (key === 'Enter') {
                    if (isTransitionInProgress) {
                        e.preventDefault();
                        return;
                    }
                    isTransitionInProgress = true;
                    playChannel(currentFocused);
                    e.preventDefault();
                    setTimeout(() => isTransitionInProgress = false, 500);
                } else if (e.keyCode === 405 || e.keyCode === 70) {
                    // Yellow button (405) or F key (70) - toggle favorite
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
            if (key === 'ArrowLeft') {
                // Return to channel item
                const channelItem = document.activeElement.parentElement;
                document.activeElement.tabIndex = -1;
                channelItem.focus();
                e.preventDefault();
            } else if (key === 'Enter') {
                // Toggle favorite
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
            if (key === 'ArrowUp') {
                if (osdFocusedColumn === 'close') {
                    // Return to subtitle column
                    if (osdCloseBtn && osdCloseBtn.classList) {
                        osdCloseBtn.classList.remove('focused');
                    }
                    osdFocusedColumn = 'subtitle';
                    osdFocusedIndex = 0;
                    const subtitleItems = Array.from(subtitleTracksList.querySelectorAll('.osd-item'));
                    if (subtitleItems.length > 0 && subtitleItems[0] && subtitleItems[0].classList) {
                        subtitleItems[0].classList.add('focused');
                    }
                } else {
                    const currentList = osdFocusedColumn === 'audio' ? audioTracksList : subtitleTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
                    if (osdFocusedIndex > 0) {
                        const currentFocused = items[osdFocusedIndex];
                        if (currentFocused && currentFocused.classList) {
                            currentFocused.classList.remove('focused');
                        }
                        osdFocusedIndex--;
                        if (items[osdFocusedIndex] && items[osdFocusedIndex].classList) {
                            items[osdFocusedIndex].classList.add('focused');
                            items[osdFocusedIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
                        }
                    }
                }
                e.preventDefault();
            } else if (key === 'ArrowDown') {
                if (osdFocusedColumn !== 'close') {
                    const currentList = osdFocusedColumn === 'audio' ? audioTracksList : subtitleTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
                    if (osdFocusedIndex < items.length - 1) {
                        const currentFocused = items[osdFocusedIndex];
                        if (currentFocused && currentFocused.classList) {
                            currentFocused.classList.remove('focused');
                        }
                        osdFocusedIndex++;
                        if (items[osdFocusedIndex] && items[osdFocusedIndex].classList) {
                            items[osdFocusedIndex].classList.add('focused');
                            items[osdFocusedIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
                        }
                    } else {
                        // Move to Close button
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
            } else if (key === 'ArrowLeft') {
                // Switch to audio column
                if (osdFocusedColumn === 'subtitle') {
                    const currentList = subtitleTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
                    const currentFocused = items[osdFocusedIndex];
                    if (currentFocused && currentFocused.classList) {
                        currentFocused.classList.remove('focused');
                    }
                    osdFocusedColumn = 'audio';
                    osdFocusedIndex = 0;
                    const audioItems = Array.from(audioTracksList.querySelectorAll('.osd-item'));
                    if (audioItems.length > 0 && audioItems[0] && audioItems[0].classList) {
                        audioItems[0].classList.add('focused');
                    }
                } else if (osdFocusedColumn === 'close') {
                    // Switch to subtitle column
                    if (osdCloseBtn && osdCloseBtn.classList) {
                        osdCloseBtn.classList.remove('focused');
                    }
                    osdFocusedColumn = 'subtitle';
                    osdFocusedIndex = 0;
                    const subtitleItems = Array.from(subtitleTracksList.querySelectorAll('.osd-item'));
                    if (subtitleItems.length > 0 && subtitleItems[0] && subtitleItems[0].classList) {
                        subtitleItems[0].classList.add('focused');
                    }
                }
                e.preventDefault();
            } else if (key === 'ArrowRight') {
                // Switch to subtitle column or Close button
                if (osdFocusedColumn === 'audio') {
                    const currentList = audioTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
                    const currentFocused = items[osdFocusedIndex];
                    if (currentFocused && currentFocused.classList) {
                        currentFocused.classList.remove('focused');
                    }
                    osdFocusedColumn = 'subtitle';
                    osdFocusedIndex = 0;
                    const subtitleItems = Array.from(subtitleTracksList.querySelectorAll('.osd-item'));
                    if (subtitleItems.length > 0 && subtitleItems[0] && subtitleItems[0].classList) {
                        subtitleItems[0].classList.add('focused');
                    }
                } else if (osdFocusedColumn === 'subtitle') {
                    // Switch to Close button
                    const currentList = subtitleTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
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
            } else if (key === 'Enter') {
                if (isTransitionInProgress) {
                    e.preventDefault();
                    return;
                }
                isTransitionInProgress = true;
                if (osdFocusedColumn === 'close') {
                    // Close OSD
                    hideOSD();
                    activeZone = 'player';
                } else {
                    // Select track item
                    const currentList = osdFocusedColumn === 'audio' ? audioTracksList : subtitleTracksList;
                    const items = Array.from(currentList.querySelectorAll('.osd-item'));
                    const currentFocused = items[osdFocusedIndex];
                    selectOSDItem(currentFocused);
                }
                e.preventDefault();
                setTimeout(() => isTransitionInProgress = false, 500);
            }
            return;
        }

        // Player zone
        if (activeZone === 'player') {
            if (key === 'ArrowUp' || key === 'Enter') {
                e.preventDefault();
                showOSD(); // This changes activeZone to 'osd'
            }
            // Back button is handled by popstate listener only
            return;
        }
    }
});
