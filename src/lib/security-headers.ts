/**
 * Response headers applied to every HTML document (dev server, Nitro/Workers
 * server entry, and the static `_headers` file for Cloudflare assets).
 *
 * Cross-origin isolation (COOP + COEP) unlocks SharedArrayBuffer, which the
 * ONNX runtime needs for multi-threaded WASM inference. `credentialless`
 * rather than `require-corp` so third-party scripts without CORP headers
 * (analytics, future ads) keep working. Safari does not implement
 * credentialless; there the page simply is not isolated and the WASM path
 * runs single-threaded, which the engine selection already accounts for.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
