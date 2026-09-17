import handler from '@tanstack/react-start/server-entry';

import { SECURITY_HEADERS } from './lib/security-headers';

import { paraglideMiddleware } from './paraglide/server.js';

function withSecurityHeaders(response: Response): Response {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Custom server entry — wraps every request in Paraglide's middleware so
// getLocale() resolves per-request (AsyncLocalStorage) during SSR, and adds
// the cross-origin-isolation headers to HTML responses.
export default {
  async fetch(req: Request): Promise<Response> {
    const response = await paraglideMiddleware(req, () => handler.fetch(req));
    return withSecurityHeaders(response);
  },
};
