function rewritePlaylistUrls(playlistText, baseUrl) {
  const base = new URL(baseUrl);
  
  const rewriteUrl = (targetUrl) => {
    try {
      const resolvedUrl = new URL(targetUrl, base).href;
      return `/api/v1/streamingProxy?url=${encodeURIComponent(resolvedUrl)}`;
    } catch (e) {
      console.warn('Failed to resolve URL:', targetUrl);
      return targetUrl; 
    }
  };

  return playlistText
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "") return line;

      if (trimmed.startsWith("#")) {
        return trimmed.replace(/URI="([^"]+)"/g, (match, p1) => {
          return `URI="${rewriteUrl(p1)}"`;
        });
      }
      return rewriteUrl(trimmed);
    })
    .join("\n");
}

module.exports = { rewritePlaylistUrls };