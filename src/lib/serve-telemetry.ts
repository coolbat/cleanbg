const MAX_BYTES = 512;
const ALLOWED_EVENTS = new Set(['engine-failed', 'error', 'worker-crashed']);

export type TelemetryRecord = {
  e: string;
  k: string;
  r: string;
  c: string;
  p: boolean;
};

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]/g, ' ').slice(0, max);
}

function allowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return (
      host === 'cleanbg.app' ||
      host === 'www.cleanbg.app' ||
      host === 'localhost' ||
      host === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

/** Parse a telemetry POST body. Returns null when the payload is unusable. */
export function parseTelemetryBody(raw: string): TelemetryRecord | null {
  if (raw.length > MAX_BYTES) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const rec = payload as Record<string, unknown>;
  const event = clip(rec.e, 32);
  if (!ALLOWED_EVENTS.has(event)) return null;
  return {
    e: event,
    k: clip(rec.k, 64),
    r: clip(rec.r, 160),
    c: clip(rec.c, 64),
    p: rec.p === true,
  };
}

const empty = new Response(null, { status: 204 });

export async function serveTelemetry(req: Request): Promise<Response> {
  if (!allowedOrigin(req)) return empty;
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) return empty;
  let raw: string;
  try {
    raw = (await req.text()).slice(0, MAX_BYTES);
  } catch {
    return empty;
  }
  const parsed = parseTelemetryBody(raw);
  if (!parsed) return empty;
  console.log(
    JSON.stringify({
      t: 'cleanbg',
      e: parsed.e,
      k: parsed.k,
      r: parsed.r,
      c: parsed.c,
      p: parsed.p,
    }),
  );
  return empty;
}
