document.addEventListener('DOMContentLoaded', function() {
    console.log('oguzIPTV initialized');
    
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
    let osdFocusedColumn = 'audio'; // 'audio' or 'subtitle'
    let osdFocusedIndex = 0;
    let allStreamsCache = []; // Cache for search functionality
    let isSearchActive = false; // Search mode state
    let pendingResumeTime = 0; // Store pending resume time for modal
    let currentStreamUrl = ''; // Track current stream URL for progress saving
    
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

    // Back button navigation
    document.addEventListener('keydown', handleBackButton);

    // Hash routing for browser back button and refresh persistence
    window.addEventListener('hashchange', handleRouting);
    
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

        // Render categories
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
        localStorage.setItem('activeCategoryId', activeCategoryId);

        // Fetch channels for this category
        const xtreamServer = localStorage.getItem('xtream_server');
        const xtreamUsername = localStorage.getItem('xtream_username');
        const xtreamPassword = localStorage.getItem('xtream_password');
        if (xtreamServer && xtreamUsername && xtreamPassword) {
            fetchChannelsByCategory(xtreamServer, xtreamUsername, xtreamPassword, activeCategoryId);
        }
    }

    function showChannelList(channels) {
        console.log('showChannelList called with', channels.length, 'channels');

        // Clear existing channels
        channelList.innerHTML = '';

        // Limit to first 200 channels for performance
        const channelsToRender = channels.slice(0, 200);
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

            // Add logo if available
            if (channel.logo) {
                const logoImg = document.createElement('img');
                logoImg.className = 'channel-logo';
                logoImg.src = channel.logo;
                logoImg.alt = channel.name;
                logoImg.onerror = function() {
                    this.style.display = 'none'; // Hide broken logos
                };
                channelItem.appendChild(logoImg);
            }

            // Add channel name
            const nameSpan = document.createElement('span');
            nameSpan.className = 'channel-name';
            nameSpan.textContent = channel.name;
            channelItem.appendChild(nameSpan);

            // Add click event listener for mouse selection
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
                    name: name,
                    category: category,
                    url: ''
                };
            } else if (line && !line.startsWith('#') && currentChannel) {
                // This is the stream URL
                currentChannel.url = line;

                // Add channel to the appropriate category
                if (!channelsByCategory[currentChannel.category]) {
                    channelsByCategory[currentChannel.category] = [];
                }
                channelsByCategory[currentChannel.category].push(currentChannel);

                currentChannel = null;
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
                        name: item.name,
                        series_id: item.series_id,
                        logo: item.stream_icon || null,
                        url: null // Will be set when user selects a series
                    };
                }

                return {
                    name: item.name,
                    logo: item.stream_icon || null,
                    url: url
                };
            });

            console.log('Mapped streams:', channels.length);
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
                        name: item.name,
                        series_id: item.series_id,
                        logo: item.stream_icon || null,
                        url: null
                    };
                }

                return {
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
                    videoPlayer.play();
                    // Set hash to player view after HLS is ready
                    window.location.hash = '#player';
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
                    videoPlayer.play();
                    // Set hash to player view after video is ready
                    window.location.hash = '#player';
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
                window.location.hash = '#player';
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

        playStream(streamUrl);
    }
    
    function handleBackButton(e) {
        // WebOS Back keycode: 461
        // Fallback: Backspace and Escape
        if (e.keyCode === 461 || e.key === 'Backspace' || e.key === 'Escape') {
            // If OSD is visible, dismiss it without stopping video
            if (playerOsd.style.display === 'flex') {
                e.preventDefault();
                hideOSD();
                return;
            }

            // Otherwise, return to channel list
            if (videoPlayer.style.display === 'block') {
                e.preventDefault();
                window.location.hash = '#channels';
            }
        }
    }

    function populateOSDTracks() {
        console.log('Populating OSD tracks');

        // Warn about browser limitations for embedded tracks
        console.warn('HTML5 browsers cannot natively extract embedded MKV audio/subtitle tracks. External files or a custom demuxer are required.');

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

        // Populate subtitle tracks
        // Always add 'Off' option at the top
        const offItem = document.createElement('div');
        offItem.className = 'osd-item';
        offItem.textContent = 'Off';
        offItem.dataset.trackIndex = -1;
        offItem.dataset.trackType = 'subtitle';
        subtitleTracksList.appendChild(offItem);

        if (videoPlayer.textTracks && videoPlayer.textTracks.length > 0) {
            for (let i = 0; i < videoPlayer.textTracks.length; i++) {
                const track = videoPlayer.textTracks[i];
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
        } else {
            // No subtitle tracks available
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
            // Select subtitle track
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

                // Update active class
                subtitleTracksList.querySelectorAll('.osd-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            }
        }

        // Hide OSD after selection
        hideOSD();
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
            const navItems = [navLive, navMovies, navSeries, navSearch];
            const currentFocused = focusedElement.classList.contains('nav-button') ? focusedElement : navLive;
            let currentIndex = navItems.indexOf(currentFocused);

            // Exit search mode if navigating away from search button
            if (isSearchActive && (key === 'ArrowLeft' || key === 'ArrowRight')) {
                exitSearch();
            }

            if (key === 'ArrowRight' && currentIndex < navItems.length - 1) {
                currentFocused.classList.remove('focused');
                const newFocused = navItems[currentIndex + 1];
                newFocused.classList.add('focused');
                newFocused.focus();
                e.preventDefault();
            } else if (key === 'ArrowLeft' && currentIndex > 0) {
                currentFocused.classList.remove('focused');
                const newFocused = navItems[currentIndex - 1];
                newFocused.classList.add('focused');
                newFocused.focus();
                e.preventDefault();
            } else if (key === 'ArrowDown') {
                // Move down to the Sidebar (or search if search is active)
                currentFocused.classList.remove('focused');
                if (isSearchActive) {
                    activeZone = 'search';
                    searchInput.focus();
                } else {
                    activeZone = 'sidebar';
                    const firstCategory = sidebar.querySelector('.category-item');
                    if (firstCategory) {
                        firstCategory.classList.add('focused');
                        firstCategory.focus();
                    }
                }
                e.preventDefault();
            } else if (key === 'Enter') {
                currentFocused.click();
                e.preventDefault();
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
                // Execute selected action
                if (btnResume.classList.contains('focused')) {
                    // Resume from saved time
                    videoPlayer.currentTime = pendingResumeTime;
                    videoPlayer.play();
                } else {
                    // Start from beginning
                    videoPlayer.currentTime = 0;
                    videoPlayer.play();
                }
                // Hide modal and set player zone
                resumeModal.style.display = 'none';
                activeZone = 'player';
                window.location.hash = '#player';
                e.preventDefault();
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
                // Use appropriate select function based on connection type
                if (connectionType === 'm3u') {
                    selectM3UCategory(currentFocused);
                } else {
                    selectCategory(currentFocused);
                }
                e.preventDefault();
            }
            return;
        }

        // CHANNELS Navigation
        if (activeZone === 'channels') {
            const focusedChannel = document.querySelector('.channel-item.focused');
            const channels = Array.from(channelList.querySelectorAll('.channel-item'));
            const currentFocused = focusedChannel || channels[0];
            const currentIndex = channels.indexOf(currentFocused);

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
            } else if (key === 'Enter') {
                playChannel(currentFocused);
                e.preventDefault();
            }
        }

        // OSD Navigation
        if (activeZone === 'osd') {
            const currentList = osdFocusedColumn === 'audio' ? audioTracksList : subtitleTracksList;
            const items = Array.from(currentList.querySelectorAll('.osd-item'));
            const currentFocused = items[osdFocusedIndex];

            if (key === 'ArrowUp') {
                if (osdFocusedIndex > 0) {
                    currentFocused.classList.remove('focused');
                    osdFocusedIndex--;
                    items[osdFocusedIndex].classList.add('focused');
                    items[osdFocusedIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
                }
                e.preventDefault();
            } else if (key === 'ArrowDown') {
                if (osdFocusedIndex < items.length - 1) {
                    currentFocused.classList.remove('focused');
                    osdFocusedIndex++;
                    items[osdFocusedIndex].classList.add('focused');
                    items[osdFocusedIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
                }
                e.preventDefault();
            } else if (key === 'ArrowLeft') {
                // Switch to audio column
                if (osdFocusedColumn === 'subtitle') {
                    currentFocused.classList.remove('focused');
                    osdFocusedColumn = 'audio';
                    osdFocusedIndex = 0;
                    const audioItems = Array.from(audioTracksList.querySelectorAll('.osd-item'));
                    if (audioItems.length > 0) {
                        audioItems[0].classList.add('focused');
                    }
                }
                e.preventDefault();
            } else if (key === 'ArrowRight') {
                // Switch to subtitle column
                if (osdFocusedColumn === 'audio') {
                    currentFocused.classList.remove('focused');
                    osdFocusedColumn = 'subtitle';
                    osdFocusedIndex = 0;
                    const subtitleItems = Array.from(subtitleTracksList.querySelectorAll('.osd-item'));
                    if (subtitleItems.length > 0) {
                        subtitleItems[0].classList.add('focused');
                    }
                }
                e.preventDefault();
            } else if (key === 'Enter') {
                selectOSDItem(currentFocused);
                e.preventDefault();
            }
            return;
        }

        // Player zone
        if (activeZone === 'player') {
            if (key === 'ArrowUp' || key === 'Enter') {
                e.preventDefault();
                showOSD(); // This changes activeZone to 'osd'
            } else if (key === 'Backspace' || key === 'Escape') {
                e.preventDefault();
                stopVideo();
                window.location.hash = '#channels';
            }
            return;
        }
    }
});
