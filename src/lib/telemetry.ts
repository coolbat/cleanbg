/**
 * Privacy-preserving engine diagnostics. Never include filenames, pixels,
 * dimensions, or free-form exception text that might contain a path.
 */
export type TelemetryEvent = 'engine-failed' | 'error' | 'worker-crashed';

export function reportEngineEvent(
  event: TelemetryEvent,
  extra: { key?: string; reason?: string; code?: string; persistent?: boolean },
): void {
  if (typeof navigator === 'undefined') return;
  const body = JSON.stringify({
    e: event,
    k: extra.key,
    r: extra.reason,
    c: extra.code,
    p: extra.persistent === true ? true : undefined,
    v: 1,
  });
  try {
    if (navigator.sendBeacon?.('/e', new Blob([body], { type: 'text/plain' }))) {
      return;
    }
  } catch {
    // Fall through to fetch.
  }
  void fetch('/e', {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'content-type': 'text/plain' },
  }).catch(() => {});
}
