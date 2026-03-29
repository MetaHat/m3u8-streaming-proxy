const express = require('express');
const path = require('path');
require('dotenv').config();
const { fetchWithCustomReferer } = require('./fetchWithCustomReferer');
const { rewritePlaylistUrls } = require('./rewritePlaylistUrls');
const NodeCache = require('node-cache');
const morgan = require('morgan');
const helmet = require('helmet');
const { cleanEnv, str, num } = require('envalid');

// Validate environment variables
const env = cleanEnv(process.env, {
  PORT: num({ default: 3000 }),
  ALLOWED_ORIGINS: str({ default: "*" }),
  REFERER_URL: str({ default: "https://megacloud.club/" })
});

const app = express();
const PORT = env.PORT;

const cache = new NodeCache({ stdTTL: 600 });

// Security and logging
app.use(morgan('dev'));
// Disable Cross-Origin-Resource-Policy to prevent blocking video segments
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

// Robust CORS Middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
  
  if (allowed.includes('*') || allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, X-Requested-With, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type'); // Useful for frontend debugging
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/v1/streamingProxy', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    const isM3U8 = url.includes(".m3u8");

    const cachedResponse = cache.get(url);
    if (cachedResponse) {
      if (isM3U8) {
        res.set({
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "public, max-age=60" // Shorter cache for live m3u8
        });
        return res.status(200).send(cachedResponse);
      } else {
        res.set({
          "Content-Type": "video/mp2t",
          "Cache-Control": "public, max-age=31536000"
        });
        return res.status(200).send(cachedResponse);
      }
    }

    const response = await fetchWithCustomReferer(url, env.REFERER_URL);

    if (!response.ok) {
      console.error(`Upstream Error: ${response.status} ${response.statusText} for URL: ${url}`);
      return res.status(response.status).json({
        error: "Upstream Target Error",
        details: `Target responded with ${response.status} ${response.statusText}`,
        url: url
      });
    }

    if (isM3U8) {
      const playlistText = await response.text();
      const modifiedPlaylist = rewritePlaylistUrls(playlistText, url);

      cache.set(url, modifiedPlaylist, 60); // Cache playlist for 60 seconds

      res.set({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "public, max-age=60"
      });
      return res.send(modifiedPlaylist);
    } else {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      cache.set(url, buffer, 31536000); // Cache TS segments for a year

      res.set({
        "Content-Type": "video/mp2t",
        "Cache-Control": "public, max-age=31536000"
      });
      return res.send(buffer);
    }
  } catch (error) {
    console.error('Proxy Exception:', error.message);
    // Specifically catching DNS or connection errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(502).json({ error: "Bad Gateway", details: "Could not resolve or connect to the target URL." });
    }
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});