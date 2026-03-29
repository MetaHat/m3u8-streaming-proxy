const fetch = require('node-fetch');

async function fetchWithCustomReferer(url, refererUrl) {
  if (!url) throw new Error("URL is required");
  
  // Set up an abort controller for timeout management
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds max

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        "Referer": refererUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        "Origin": new URL(refererUrl).origin,
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
      },
      redirect: 'follow',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after 15 seconds: ${url}`);
    }
    console.error(`[FetchWithCustomReferer] Error fetching ${url}:`, error.message);
    throw error;
  }
}

module.exports = { fetchWithCustomReferer };