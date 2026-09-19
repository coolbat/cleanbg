/**
 * Full-resolution matte post-processing.
 *
 * The model predicts alpha at 512/1024 px; naively upscaling that mask blurs
 * hair and drops thin strands, and keeping the source RGB under a soft alpha
 * leaves background colour bleeding into the edge pixels. This module fixes
 * both at the output resolution:
 *
 *   1. guided filter   — snaps the upscaled alpha to the real image edges
 *                        (recovers fine hair the bilinear upscale smeared)
 *   2. alpha curve     — kills low-confidence haze, saturates solid subject
 *   3. decontamination — estimates the local background colour and removes
 *                        it from semi-transparent pixels so a transparent
 *                        PNG no longer carries a ghost of the old background
 *
 * Everything is O(N) via separable box filters, so a 2 MP image takes a few
 * hundred milliseconds in a worker.
 */

/** Separable box blur (mean filter) with edge clamping. `dst` may alias `src`. */
export function boxBlur(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number, tmp?: Float32Array): void {
  const scratch = tmp ?? new Float32Array(src.length);
  const r = Math.max(0, Math.floor(radius));
  // horizontal
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      const count = Math.min(width - 1, x + r) - Math.max(0, x - r) + 1;
      scratch[row + x] = sum / count;
      const out = x - r;
      const inn = x + r + 1;
      sum -= src[row + Math.max(0, out)];
      sum += src[row + Math.min(width - 1, inn)];
    }
  }
  // vertical
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += scratch[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      const count = Math.min(height - 1, y + r) - Math.max(0, y - r) + 1;
      dst[y * width + x] = sum / count;
      const out = y - r;
      const inn = y + r + 1;
      sum -= scratch[Math.max(0, out) * width + x];
      sum += scratch[Math.min(height - 1, inn) * width + x];
    }
  }
}

/**
 * He et al. guided filter with a grayscale guide. `guide` and `p` in [0,1].
 * Returns the filtered alpha.
 */
export function guidedFilter(guide: Float32Array, p: Float32Array, width: number, height: number, radius: number, eps: number): Float32Array {
  const n = width * height;
  const tmp = new Float32Array(n);
  const meanI = new Float32Array(n);
  const meanP = new Float32Array(n);
  const corrI = new Float32Array(n);
  const corrIp = new Float32Array(n);
  boxBlur(guide, meanI, width, height, radius, tmp);
  boxBlur(p, meanP, width, height, radius, tmp);
  for (let i = 0; i < n; i++) {
    corrI[i] = guide[i] * guide[i];
    corrIp[i] = guide[i] * p[i];
  }
  boxBlur(corrI, corrI, width, height, radius, tmp);
  boxBlur(corrIp, corrIp, width, height, radius, tmp);
  // a and b reuse corrI / corrIp storage
  const a = corrI;
  const b = corrIp;
  for (let i = 0; i < n; i++) {
    const varI = corrI[i] - meanI[i] * meanI[i];
    const covIp = corrIp[i] - meanI[i] * meanP[i];
    const ai = covIp / (varI + eps);
    a[i] = ai;
    b[i] = meanP[i] - ai * meanI[i];
  }
  boxBlur(a, a, width, height, radius, tmp);
  boxBlur(b, b, width, height, radius, tmp);
  const q = meanP; // reuse
  for (let i = 0; i < n; i++) {
    const v = a[i] * guide[i] + b[i];
    q[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return q;
}

export interface MatteOptions {
  /** Guided-filter radius in px. Default scales with image size. */
  radius?: number;
  /** Alpha below this is background. */
  low?: number;
  /** Alpha above this is solid foreground. */
  high?: number;
}

/**
 * Refine `alpha` (0..1, full resolution) against `rgba` and write the final
 * decontaminated colour + alpha back into `rgba` in place.
 */
export function refineMatte(rgba: Uint8ClampedArray, alpha: Float32Array, width: number, height: number, options: MatteOptions = {}): void {
  const n = width * height;
  // Small radius: a wide window averages thin strands away against the
  // background; 3–6 px keeps them while still snapping edges to the image.
  const radius = options.radius ?? Math.round(Math.min(6, Math.max(3, Math.min(width, height) / 400)));
  const low = options.low ?? 0.03;
  const high = options.high ?? 0.9;

  // 1) guided filter on a luminance guide
  const guide = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    guide[i] = (0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) / 255;
  }
  const filtered = guidedFilter(guide, alpha, width, height, radius, 1e-4);

  // 2) alpha curve: linear remap between low/high, clamp outside
  const span = high - low;
  for (let i = 0; i < n; i++) {
    const v = filtered[i];
    alpha[i] = v <= low ? 0 : v >= high ? 1 : (v - low) / span;
  }

  // 3) colour decontamination
  //    B ≈ background colour blurred over a wide radius, weighted by (1-α)
  //    for confidently-background pixels only.
  const wr = new Float32Array(n);
  const wg = new Float32Array(n);
  const wb = new Float32Array(n);
  const w = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = alpha[i];
    if (a < 0.5) {
      const wt = (1 - a) * (1 - a);
      wr[i] = rgba[j] * wt;
      wg[i] = rgba[j + 1] * wt;
      wb[i] = rgba[j + 2] * wt;
      w[i] = wt;
    }
  }
  const tmp = new Float32Array(n);
  const br = radius * 4;
  boxBlur(wr, wr, width, height, br, tmp);
  boxBlur(wg, wg, width, height, br, tmp);
  boxBlur(wb, wb, width, height, br, tmp);
  boxBlur(w, w, width, height, br, tmp);

  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = alpha[i];
    if (a <= 0) {
      // Fully transparent: also clear the colour so the PNG carries no
      // hidden copy of the original background (and compresses better).
      rgba[j] = 0;
      rgba[j + 1] = 0;
      rgba[j + 2] = 0;
      rgba[j + 3] = 0;
      continue;
    }
    if (a < 1 && w[i] > 1e-3) {
      const Br = wr[i] / w[i];
      const Bg = wg[i] / w[i];
      const Bb = wb[i] / w[i];
      // C = αF + (1-α)B  →  F = C + (C-B)(1-α)/α ; damp the division for
      // very small α where the estimate gets noisy.
      const k = (1 - a) / Math.max(a, 0.3);
      rgba[j] = clamp255(rgba[j] + (rgba[j] - Br) * k);
      rgba[j + 1] = clamp255(rgba[j + 1] + (rgba[j + 1] - Bg) * k);
      rgba[j + 2] = clamp255(rgba[j + 2] + (rgba[j + 2] - Bb) * k);
    }
    rgba[j + 3] = Math.round(a * 255);
  }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
