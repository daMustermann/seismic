# Seismic - Global Earthquake Visualizer

![Version](https://img.shields.io/badge/version-1.0.0-blue)

A real-time, interactive earthquake visualization map powered by USGS data.

## Features

- **Live Data Feed** - Real-time earthquake data from USGS API with auto-refresh
- **Interactive Map** - Dark-themed Leaflet map with infinite scrolling
- **Marker Clustering** - Earthquakes cluster when zoomed out for better performance
- **Time Travel Playback** - Scrub through time to watch earthquakes occur chronologically
- **Sonification** - Optional audio feedback with magnitude-based sounds
- **Statistics Dashboard** - Magnitude distribution chart, top regions, and depth stats
- **Filtering** - Filter by time range (24h, 7d, 30d) and minimum magnitude

## Tech Stack

- Vanilla HTML/CSS/JavaScript
- Leaflet.js for mapping
- Leaflet.markercluster for clustering
- USGS Earthquake API

## Live Demo

Visit the live app: [https://daMustermann.github.io/seismic](https://daMustermann.github.io/seismic)

## Local Development

```bash
# Serve locally
npx http-server . -p 8080 -c-1
```

Then open http://localhost:8080

## License

MIT
