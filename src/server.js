const express = require('express');
const path = require('path');
require('dotenv').config();
const fetch = require('node-fetch');
const { fetchWithCustomReferer } = require('./fetchWithCustomReferer');
const { rewritePlaylistUrls } = require('./rewritePlaylistUrls');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize cache with a TTL of 10 minutes (600 seconds)
const cache = new NodeCache({ stdTTL: 600 });

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, '../public')));

// Origin lock middleware
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://your-website.com", // Replace with your allowed origin
    "http://localhost:3000"     // Allow local development
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    next();
  } else {
    res.status(403).json({ error: "Origin not allowed" });
  }
});

// Proxy endpoint with caching
app.get('/api/v1/streamingProxy', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: "URL parameter is required" });
  }

  // Check cache for the URL
  const cachedResponse = cache.get(url);
  if (cachedResponse) {
    console.log(`Serving from cache: ${url}`);
    return res.status(200).send(cachedResponse);
  }

  try {
    const response = await fetchWithCustomReferer(url);
    const isM3U8 = url.endsWith(".m3u8");

    if (!response.ok) {
      return res.status(response.status).json({ error: response.statusText });
    }

    if (isM3U8) {
      const playlistText = await response.text();
      const modifiedPlaylist = rewritePlaylistUrls(playlistText, url);

      // Cache the response
      cache.set(url, modifiedPlaylist);

      res.set({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*"
      });
      return res.send(modifiedPlaylist);
    } else {
      const arrayBuffer = await response.arrayBuffer();

      // Cache the response
      cache.set(url, Buffer.from(arrayBuffer));

      res.set({
        "Content-Type": "video/mp2t",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*"
      });
      return res.send(Buffer.from(arrayBuffer));
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
