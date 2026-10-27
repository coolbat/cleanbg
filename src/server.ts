import handler from '@tanstack/react-start/server-entry';

import { SECURITY_HEADERS } from './lib/security-headers';
import { serveModel, type R2BucketLike } from './lib/serve-models';
import { serveTelemetry } from './lib/serve-telemetry.ts';
import { shortPathRedirect } from './lib/short-path-redirect.ts';

import { paraglideMiddleware } from './paraglide/server.js';

type WorkerEnv = { MODELS?: R2BucketLike };

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

function apexRedirect(req: Request): Response | null {
  const url = new URL(req.url);
  const isApex = url.hostname === 'cleanbg.app';
  const isWww = url.hostname === 'www.cleanbg.app';
  // Only production hosts redirect; localhost/wrangler dev hosts pass through.
  if (!isApex && !isWww) return null;
  if (isApex && url.protocol === 'https:') return null;
  url.protocol = 'https:';
  url.hostname = 'cleanbg.app';
  return Response.redirect(url.toString(), 301);
}

async function modelsBucket(env?: WorkerEnv): Promise<R2BucketLike | null> {
  if (env?.MODELS) return env.MODELS;
  try {
    const mod = await import('cloudflare:workers');
    return ((mod as { env?: WorkerEnv }).env)?.MODELS ?? null;
  } catch {
    return null;
  }
}

// Custom server entry — wraps every request in Paraglide's middleware so
// getLocale() resolves per-request (AsyncLocalStorage) during SSR, and adds
// the cross-origin-isolation headers to HTML responses.
export default {
  async fetch(req: Request, env?: WorkerEnv): Promise<Response> {
    const redirect = shortPathRedirect(req) ?? apexRedirect(req);
    if (redirect) return redirect;

    const url = new URL(req.url);
    if (url.pathname === '/e' && req.method === 'POST') {
      return serveTelemetry(req);
    }
    if (url.pathname === '/models' || url.pathname.startsWith('/models/')) {
      const bucket = await modelsBucket(env);
      if (!bucket) return new Response('Models unavailable', { status: 503 });
      return serveModel(req, bucket);
    }

    const response = await paraglideMiddleware(req, () => handler.fetch(req));
    return withSecurityHeaders(response);
  },
};
