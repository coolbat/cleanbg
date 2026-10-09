/**
 * Stream ONNX / wasm files from the R2 models bucket at `/models/*`.
 * Keeps inference same-origin so we do not depend on the rate-limited r2.dev URL.
 */

export interface R2ObjectBody {
  body: ReadableStream | null;
  size: number;
  httpEtag?: string;
  httpMetadata?: { contentType?: string };
}

export interface R2BucketLike {
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<R2ObjectBody | null>;
  head(key: string): Promise<{ size: number; httpEtag?: string } | null>;
}

function contentTypeFor(key: string): string {
  if (key.endsWith('.json')) return 'application/json';
  if (key.endsWith('.wasm')) return 'application/wasm';
  if (key.endsWith('.mjs') || key.endsWith('.js')) return 'text/javascript';
  if (key.endsWith('.onnx')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function parseRange(
  header: string | null,
  size: number,
): { offset: number; length: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null;
  const hasStart = match[1] !== '';
  const hasEnd = match[2] !== '';
  if (!hasStart && !hasEnd) return null;
  const start = hasStart ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = hasEnd ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  const last = Math.min(end, size - 1);
  return { offset: start, length: last - start + 1 };
}

function baseHeaders(key: string, etag?: string): Headers {
  const headers = new Headers();
  headers.set('Content-Type', contentTypeFor(key));
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Range, If-None-Match');
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, ETag, Accept-Ranges');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('Accept-Ranges', 'bytes');
  if (etag) headers.set('ETag', etag);
  return headers;
}

export async function serveModel(req: Request, bucket: R2BucketLike): Promise<Response> {
  const url = new URL(req.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/models\//, '')).replace(/^\/+/, '');
  if (!key || key.includes('..')) return new Response('Not found', { status: 404 });

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: baseHeaders(key) });
  }

  const range = parseRange(req.headers.get('Range'), Number.MAX_SAFE_INTEGER);
  const object = range
    ? await bucket.get(key, { range })
    : req.method === 'HEAD'
      ? await bucket.head(key)
      : await bucket.get(key);

  if (!object) return new Response('Not found', { status: 404 });

  const etag = 'httpEtag' in object ? object.httpEtag : undefined;
  const inm = req.headers.get('If-None-Match');
  if (inm && etag && inm === etag) {
    return new Response(null, { status: 304, headers: baseHeaders(key, etag) });
  }

  const headers = baseHeaders(key, etag);
  headers.set('Content-Length', String(object.size));

  if (req.method === 'HEAD' || !('body' in object) || !object.body) {
    return new Response(null, { status: 200, headers });
  }

  if (range) {
    const start = range.offset;
    const end = range.offset + range.length - 1;
    headers.set('Content-Range', `bytes ${start}-${end}/*`);
    headers.set('Content-Length', String(range.length));
    return new Response(object.body as ReadableStream, { status: 206, headers });
  }

  return new Response(object.body as ReadableStream, { status: 200, headers });
}
