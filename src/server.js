const express = require('express');
const path = require('path');
require('dotenv').config();
const { fetchWithCustomReferer } = require('./fetchWithCustomReferer');
const { rewritePlaylistUrls } = require('./rewritePlaylistUrls');
const NodeCache = require('node-cache');
const morgan = require('morgan');
const helmet = require('helmet');
const { cleanEnv, str, num } = require('envalid');

const env = cleanEnv(process.env, {
  PORT: num({ default: 3000 }),
  ALLOWED_ORIGINS: str({ default: "*" }),
  REFERER_URL: str({ default: "https://megacloud.club/" })
});

const app = express();
const PORT = env.PORT;

app.set('trust proxy', 1);

const cache = new NodeCache({ stdTTL: 10 }); 

app.use(morgan('dev'));

app.use(helmet({ 
  contentSecurityPolicy: false, 
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/v1/streamingProxy', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "URL is required" });

    const cachedResponse = cache.get(targetUrl);
    if (cachedResponse) {
      res.set({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "public, max-age=10"
      });
      return res.send(cachedResponse);
    }

    const response = await fetchWithCustomReferer(targetUrl, env.REFERER_URL);

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Upstream error: ${response.status} ${response.statusText}`,
        url: targetUrl 
      });
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const isM3U8 = contentType.includes('mpegurl') || 
                   contentType.includes('m3u8') || 
                   targetUrl.includes('.m3u8');

    if (isM3U8) {
      const playlistText = await response.text();
      const modifiedPlaylist = rewritePlaylistUrls(playlistText, targetUrl);
      
      cache.set(targetUrl, modifiedPlaylist, 10);

      res.set({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "public, max-age=10"
      });
      return res.send(modifiedPlaylist);
      
    } else {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.set({
        "Content-Type": contentType || "video/mp2t",
        "Cache-Control": "public, max-age=31536000",
        "Content-Length": buffer.length
      });
      return res.send(buffer);
    }
  } catch (error) {
    console.error('Proxy Exception:', error.message);
    res.status(500).json({ error: "Proxy Failed", details: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));