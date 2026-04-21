/**
 * Normalize a server-built absolute URL for clipboard copy.
 *
 * In local development the server's NEXTAUTH_URL usually hardcodes
 * port 3000, but the browser may be running on a different port
 * (3001, 4000, etc.). This helper rewrites the origin of a localhost
 * URL to match the current window so copied links actually work.
 */
export function normalizeCopyUrl(url) {
  if (typeof window === "undefined" || !url) return url;
  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
  try {
    const parsed = new URL(url);
    if (LOCAL_HOSTS.has(parsed.hostname) && LOCAL_HOSTS.has(window.location.hostname)) {
      parsed.protocol = window.location.protocol;
      parsed.host = window.location.host;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
