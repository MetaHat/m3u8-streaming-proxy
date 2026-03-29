const fetch = require('node-fetch');

async function fetchWithCustomReferer(url, refererUrl) {
  if (!url) throw new Error("URL is required");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        "Referer": refererUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Origin": new URL(refererUrl).origin,
        "Accept": "*/*",
      },
      redirect: 'follow',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[Fetch Error] ${url}:`, error.message);
    throw error;
  }
}

module.exports = { fetchWithCustomReferer };