/** Public configuration accepts only an HTTPS backend origin, never secrets. */
export function createApiClient(rawOrigin, fetcher = fetch) {
  let origin = '';
  if (rawOrigin) {
    const url = new URL(rawOrigin);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('Backend configuration must be an HTTPS origin without credentials, path, query, or fragment.');
    }
    origin = url.origin;
  }
  return {
    configured: Boolean(origin),
    authUrl(action) {
      if (!origin || !['login', 'logout'].includes(action)) throw new Error('Authentication backend is not configured.');
      return `${origin}/auth/${action}`;
    },
    async request(path, options = {}) {
      if (!origin) throw new Error('A protected backend must be configured before loading content.');
      if (!path.startsWith('/api/') || path.startsWith('//') || path.includes('\\') || /[\r\n]/.test(path)) throw new Error('Invalid API path.');
      // Disallow path normalization from escaping the fixed API namespace.
      const url = new URL(path, origin);
      if (url.origin !== origin || !url.pathname.startsWith('/api/')) throw new Error('Invalid API path.');
      const response = await fetcher(url.href, { ...options, credentials: 'include', cache: 'no-store', redirect: 'error' });
      let result;
      try { result = await response.json(); } catch { throw new Error('The backend returned an invalid response.'); }
      if (!response.ok) {
        const messages={401:'Sign in to access your project.',403:'You do not have permission for this operation.',409:'The source changed. Refresh and review before saving.',429:'Provider rate limit reached. Wait before refreshing.'};
        const error=new Error(result.code==='write_uncertain'?'Write completion is uncertain. Inspect the source before another edit.':messages[response.status]||'The protected source is unavailable. Please try again.');
        error.status=response.status;error.code=result.code;throw error;
      }
      if (path === '/api/session' && result.user && (typeof result.user.displayName !== 'string' || typeof result.csrfToken !== 'string')) throw new Error('The session response is invalid.');
      if (path.startsWith('/api/records') && !Array.isArray(result.records) && options.method !== 'POST') throw new Error('The records response is invalid.');
      return result;
    }
  };
}
