// Configuration
console.log('App initialized - Version 5');
const CONFIG = {
    tileLayer: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    apiBase: 'https://earthquake.usgs.gov/fdsnws/event/1/query',
    refreshInterval: 5 * 60 * 1000 // 5 minutes
};

function getMagClass(mag) {
    if (mag >= 7.0) return 'marker-pulse-extreme';
    if (mag >= 6.0) return 'marker-pulse-high';
    if (mag >= 5.0) return 'marker-glow-med';
    return 'marker-glow-low';
}

// State
let map;
let markersLayer;
let earthquakeData = [];
let audioContext = null;
let isPlaying = false;
let playbackInterval;
let playbackSpeed = 1000 * 60 * 60 * 1; // 1 hour per tick
let currentTime = null;
let startTime = null;
let endTime = null;
let refreshTimer = null;

// DOM Elements
const dom = {
    timeFilter: document.getElementById('timeFilter'),
    magFilter: document.getElementById('magFilter'),
    quakeList: document.getElementById('quakeList'),
    totalCount: document.getElementById('totalCount'),
    maxMag: document.getElementById('maxMag'),
    avgDepth: document.getElementById('avgDepth'),
    playBtn: document.getElementById('playBtn'),
    iconPlay: document.querySelector('.icon-play'),
    iconPause: document.querySelector('.icon-pause'),
    timeSlider: document.getElementById('timeSlider'),
    currentDate: document.getElementById('currentDate'),
    audioToggle: document.getElementById('audioToggle'),
    dashboardToggle: document.getElementById('dashboardToggle'),
    dashboardContent: document.getElementById('dashboardContent'),
    magChart: document.getElementById('magChart'),
    topRegions: document.getElementById('topRegions')
};

// Initialize Application
function init() {
    initMap();
    setupEventListeners();
    fetchData();

    // Auto Refresh
    refreshTimer = setInterval(checkForUpdates, CONFIG.refreshInterval);
}

// Initialize Leaflet Map with Clustering
function initMap() {
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        worldCopyJump: true,
        minZoom: 2
    }).setView([20, 0], 2);

    L.tileLayer(CONFIG.tileLayer, {
        attribution: CONFIG.attribution,
        subdomains: 'abcd',
        maxZoom: 19,
        noWrap: false
    }).addTo(map);

    L.control.attribution({ position: 'bottomright' }).addTo(map);

    // Use MarkerClusterGroup instead of regular LayerGroup
    markersLayer = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        disableClusteringAtZoom: 10,
        iconCreateFunction: function (cluster) {
            const count = cluster.getChildCount();
            let size = 'small';
            let className = 'marker-cluster marker-cluster-';

            if (count >= 100) {
                size = 'large';
            } else if (count >= 10) {
                size = 'medium';
            }

            return L.divIcon({
                html: '<div>' + count + '</div>',
                className: className + size,
                iconSize: L.point(40, 40)
            });
        }
    });

    map.addLayer(markersLayer);
}

// Setup Event Listeners
function setupEventListeners() {
    dom.timeFilter.addEventListener('change', () => {
        fetchData();
        clearInterval(refreshTimer);
        refreshTimer = setInterval(checkForUpdates, CONFIG.refreshInterval);
    });
    dom.magFilter.addEventListener('change', fetchData);

    dom.playBtn.addEventListener('click', togglePlayback);

    dom.timeSlider.addEventListener('input', (e) => {
        if (!startTime || !endTime) return;
        const percent = e.target.value;
        const totalDuration = endTime - startTime;
        currentTime = new Date(startTime.getTime() + (totalDuration * (percent / 100)));
        updatePlaybackDisplay();
        renderQuakes(true);
    });

    // Dashboard toggle
    dom.dashboardToggle.addEventListener('click', () => {
        dom.dashboardToggle.classList.toggle('active');
        dom.dashboardContent.classList.toggle('open');
    });
}

// Audio System
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function playQuakeSound(mag) {
    if (!dom.audioToggle.checked || !audioContext) return;

    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);

    const frequency = Math.max(80, 600 - (mag * 60));
    osc.frequency.value = frequency;

    const volume = Math.min(0.3, Math.max(0.05, (mag - 2) / 20));
    osc.type = mag > 5 ? 'triangle' : 'sine';

    const now = audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + (mag * 0.2));

    osc.start(now);
    osc.stop(now + 2);
}

// Playback Logic
function togglePlayback() {
    if (isPlaying) {
        pausePlayback();
    } else {
        startPlayback();
    }
}

function startPlayback() {
    initAudio();
    isPlaying = true;
    dom.iconPlay.style.display = 'none';
    dom.iconPause.style.display = 'block';

    if (!currentTime || currentTime >= endTime) {
        currentTime = new Date(startTime);
    }

    playbackInterval = setInterval(() => {
        currentTime = new Date(currentTime.getTime() + playbackSpeed);

        if (currentTime >= endTime) {
            pausePlayback();
            currentTime = endTime;
        }

        updatePlaybackDisplay();
        renderQuakes(true);
    }, 50);
}

function pausePlayback() {
    isPlaying = false;
    dom.iconPlay.style.display = 'block';
    dom.iconPause.style.display = 'none';
    clearInterval(playbackInterval);
}

function updatePlaybackDisplay() {
    if (!startTime || !endTime) return;

    dom.currentDate.textContent = currentTime.toLocaleString();

    const totalDuration = endTime - startTime;
    const elapsed = currentTime - startTime;
    const percent = (elapsed / totalDuration) * 100;

    dom.timeSlider.value = percent;
}

// Fetch Data from USGS API
async function fetchData() {
    setLoading(true);
    pausePlayback();

    const timeRange = dom.timeFilter.value;
    const minMag = dom.magFilter.value;

    endTime = new Date();
    startTime = new Date();

    if (timeRange === 'day') startTime.setDate(startTime.getDate() - 1);
    if (timeRange === 'week') startTime.setDate(startTime.getDate() - 7);
    if (timeRange === 'month') startTime.setDate(startTime.getDate() - 30);

    currentTime = new Date(endTime);

    const url = `${CONFIG.apiBase}?format=geojson&starttime=${startTime.toISOString()}&minmagnitude=${minMag}&orderby=time-asc`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        earthquakeData = data.features;

        updateStats();
        updateDashboard();
        updatePlaybackDisplay();
        renderQuakes(false);

    } catch (error) {
        console.error('Error fetching earthquake data:', error);
        dom.quakeList.innerHTML = '<div class="error-msg">Failed to load data. Please try again.</div>';
    } finally {
        setLoading(false);
    }
}

// Check for Updates (Auto-Refresh)
async function checkForUpdates() {
    if (isPlaying) return;

    console.log('Checking for updates...');
    const minMag = dom.magFilter.value;
    const updateStartTime = new Date();
    updateStartTime.setHours(updateStartTime.getHours() - 1);

    const url = `${CONFIG.apiBase}?format=geojson&starttime=${updateStartTime.toISOString()}&minmagnitude=${minMag}&orderby=time-asc`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        const newFeatures = data.features;

        if (newFeatures.length === 0) return;

        let hasNew = false;
        const currentIds = new Set(earthquakeData.map(q => q.id));

        newFeatures.forEach(quake => {
            if (!currentIds.has(quake.id)) {
                earthquakeData.push(quake);
                hasNew = true;

                initAudio();
                playQuakeSound(quake.properties.mag);

                console.log('New Earthquake:', quake.properties.place);
            }
        });

        if (hasNew) {
            earthquakeData.sort((a, b) => a.properties.time - b.properties.time);
            endTime = new Date();
            currentTime = new Date(endTime);
            updateStats();
            updateDashboard();
            renderQuakes(false);
        }

    } catch (error) {
        console.warn('Auto-refresh failed:', error);
    }
}

// Render Quakes on Map and Sidebar
function renderQuakes(isPlayback = false) {
    const visibleQuakes = isPlayback
        ? earthquakeData.filter(q => new Date(q.properties.time) <= currentTime)
        : earthquakeData;

    markersLayer.clearLayers();
    dom.quakeList.innerHTML = '';

    if (visibleQuakes.length === 0) {
        if (!isPlayback) dom.quakeList.innerHTML = '<div class="empty-msg">No earthquakes found.</div>';
        return;
    }

    const listQuakes = [...visibleQuakes].reverse();
    const listLimit = 50;

    visibleQuakes.forEach((quake) => {
        const props = quake.properties;
        const coords = quake.geometry.coordinates;
        const latLng = [coords[1], coords[0]];

        const markerClass = getMagClass(props.mag);
        const markerColor = getMagColor(props.mag);

        const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="quake-dot ${markerClass}" style="background-color: ${markerColor};"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        const marker = L.marker(latLng, { icon: icon });

        let popupContent = `<div class="custom-popup">
            <span class="place">${props.place}</span>
            <span class="detail">Time: ${new Date(props.time).toLocaleString()}</span>
            <span class="detail">Depth: ${coords[2]} km</span>`;

        if (props.felt !== null && props.felt !== undefined) {
            popupContent += `<span class="detail">Felt: ${props.felt}</span>`;
        }
        if (props.mmi !== null && props.mmi !== undefined) {
            popupContent += `<span class="detail">MMI: ${props.mmi.toFixed(1)}</span>`;
        }
        if (props.alert !== null && props.alert !== undefined) {
            popupContent += `<span class="detail">Alert: ${props.alert.toUpperCase()}</span>`;
        }
        if (props.tsunami === 1) {
            popupContent += `<span class="detail" style="color: #ef4444; font-weight: bold;">Tsunami Warning</span>`;
        }

        popupContent += `<span class="mag" style="background-color: ${markerColor}">${props.mag.toFixed(1)}</span>
            <a href="${props.url}" target="_blank" style="display:block; margin-top:5px; color: #38bdf8; font-size: 0.8rem;">View on USGS</a>
        </div>`;

        marker.bindPopup(popupContent);
        marker.on('click', () => {
            map.flyTo(latLng, 8);
        });

        markersLayer.addLayer(marker);
    });

    // Render List
    listQuakes.slice(0, listLimit).forEach((quake) => {
        const props = quake.properties;
        const coords = quake.geometry.coordinates;
        const latLng = [coords[1], coords[0]];
        const markerColor = getMagColor(props.mag);

        const el = document.createElement('div');
        el.className = 'quake-item';
        el.innerHTML = `
            <div class="mag-badge" style="background-color: ${markerColor}">${props.mag.toFixed(1)}</div>
            <div class="quake-info">
                <div class="quake-place" title="${props.place}">${props.place}</div>
                <div class="quake-time">${formatTimeAgo(props.time)}</div>
            </div>
        `;
        el.addEventListener('click', () => {
            map.flyTo(latLng, 8);
        });
        dom.quakeList.appendChild(el);
    });
}

// Update Basic Statistics
function updateStats() {
    dom.totalCount.textContent = earthquakeData.length;

    const max = Math.max(...earthquakeData.map(q => q.properties.mag));
    dom.maxMag.textContent = isFinite(max) ? max.toFixed(1) : '0.0';

    // Average depth
    if (earthquakeData.length > 0) {
        const totalDepth = earthquakeData.reduce((sum, q) => sum + q.geometry.coordinates[2], 0);
        const avgDepth = totalDepth / earthquakeData.length;
        dom.avgDepth.textContent = avgDepth.toFixed(1) + ' km';
    } else {
        dom.avgDepth.textContent = '--';
    }
}

// Update Dashboard Charts and Regions
function updateDashboard() {
    updateMagnitudeChart();
    updateTopRegions();
}

function updateMagnitudeChart() {
    // Count by magnitude ranges
    const ranges = [
        { min: 2.5, max: 4.0, color: '#10b981', count: 0 },
        { min: 4.0, max: 5.0, color: '#eab308', count: 0 },
        { min: 5.0, max: 6.0, color: '#f97316', count: 0 },
        { min: 6.0, max: 10.0, color: '#ef4444', count: 0 }
    ];

    earthquakeData.forEach(q => {
        const mag = q.properties.mag;
        for (const range of ranges) {
            if (mag >= range.min && mag < range.max) {
                range.count++;
                break;
            }
        }
    });

    const maxCount = Math.max(...ranges.map(r => r.count), 1);

    dom.magChart.innerHTML = ranges.map(r => {
        const height = (r.count / maxCount) * 100;
        return `<div class="bar" style="height: ${Math.max(height, 5)}%; background-color: ${r.color};" data-count="${r.count}"></div>`;
    }).join('');
}

function updateTopRegions() {
    // Extract region from place string
    const regionCounts = {};

    earthquakeData.forEach(q => {
        const place = q.properties.place || 'Unknown';
        // Get region after "of " or use whole place
        const match = place.match(/of\s+(.+)$/i);
        const region = match ? match[1].trim() : place;

        regionCounts[region] = (regionCounts[region] || 0) + 1;
    });

    // Sort and get top 5
    const sortedRegions = Object.entries(regionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (sortedRegions.length === 0) {
        dom.topRegions.innerHTML = '<div class="empty-msg">No data</div>';
        return;
    }

    dom.topRegions.innerHTML = sortedRegions.map(([region, count], i) => `
        <div class="region-item">
            <div class="region-rank">${i + 1}</div>
            <div class="region-name" title="${region}">${region}</div>
            <div class="region-count">${count}</div>
        </div>
    `).join('');
}

// Helpers
function setLoading(isLoading) {
    if (isLoading) {
        dom.quakeList.innerHTML = '<div class="loading-spinner">Loading data...</div>';
    }
}

function getMagColor(mag) {
    if (mag >= 7.0) return '#ef4444'; // Red
    if (mag >= 6.0) return '#f97316'; // Orange
    if (mag >= 5.0) return '#eab308'; // Yellow
    return '#10b981'; // Green
}

function formatTimeAgo(timestamp) {
    const seconds = Math.floor((new Date() - timestamp) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";

    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";

    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";

    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";

    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";

    return Math.floor(seconds) + " seconds ago";
}

// Start
init();
