/**
 * Worker-side pixel helpers built on OffscreenCanvas.
 * No DOM access here — everything runs inside the inference worker.
 */
import { boxBlur, refineMatte } from './matte';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MaskInspection {
  /** All values finite. */
  valid: boolean;
  /** Mask is not (almost) constant — there is an actual subject. */
  hasForegroundSignal: boolean;
  /** Fraction of pixels considered foreground (> 0.5). */
  coverage: number;
}

export interface InferenceMask {
  alpha: Float32Array;
  width: number;
  height: number;
  inspection: MaskInspection;
}

export interface MaskRefinement {
  mask: InferenceMask;
  /** Region of the *source* image the refined mask covers. */
  crop: Rect;
}

function canvas2d(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/** Resize (stretch) a bitmap to `size`×`size` RGBA pixels for the model. */
export function bitmapToSquareRgba(
  bitmap: ImageBitmap,
  size: number,
  crop?: Rect,
): Uint8ClampedArray {
  const { ctx } = canvas2d(size, size);
  if (crop) {
    ctx.drawImage(
      bitmap,
      crop.left,
      crop.top,
      crop.right - crop.left,
      crop.bottom - crop.top,
      0,
      0,
      size,
      size,
    );
  } else {
    ctx.drawImage(bitmap, 0, 0, size, size);
  }
  return ctx.getImageData(0, 0, size, size).data;
}

export function inspectMask(alpha: Float32Array): MaskInspection {
  let foreground = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < alpha.length; i++) {
    const v = alpha[i];
    if (!Number.isFinite(v)) {
      return { valid: false, hasForegroundSignal: false, coverage: 0 };
    }
    if (v > 0.5) foreground++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const coverage = alpha.length ? foreground / alpha.length : 0;
  // A real subject occupies neither <0.2% nor >99.8% of the frame, and the
  // mask has actual contrast. Anything else is a degenerate output.
  const hasForegroundSignal =
    coverage > 0.002 && coverage < 0.998 && max - min > 0.5;
  return { valid: true, hasForegroundSignal, coverage };
}

/**
 * Bounding box of the subject in *source* coordinates, padded, or `null`
 * when a second pass would not help (subject already fills the frame or is
 * too small to matter).
 */
export function findRefinementCrop(
  mask: InferenceMask,
  sourceWidth: number,
  sourceHeight: number,
): Rect | null {
  const { alpha, width, height } = mask;
  // Row/column mass histograms of confident foreground. Trimming a tiny
  // fraction of mass from each side ignores stray specks the model picked
  // up in the background, which would otherwise inflate the box.
  const cols = new Float64Array(width);
  const rows = new Float64Array(height);
  let total = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const v = alpha[row + x];
      if (v > 0.5) {
        cols[x] += v;
        rows[y] += v;
        total += v;
      }
    }
  }
  if (total === 0) return null;
  const trim = total * 0.003;
  const bound = (hist: Float64Array) => {
    let acc = 0;
    let lo = 0;
    while (lo < hist.length - 1 && acc + hist[lo] < trim) acc += hist[lo++];
    acc = 0;
    let hi = hist.length - 1;
    while (hi > lo && acc + hist[hi] < trim) acc += hist[hi--];
    return [lo, hi] as const;
  };
  const [minX, maxX] = bound(cols);
  const [minY, maxY] = bound(rows);

  const sx = sourceWidth / width;
  const sy = sourceHeight / height;
  const bboxW = (maxX - minX + 1) * sx;
  const bboxH = (maxY - minY + 1) * sy;
  // Pad by 8% of the larger side so soft edges survive, then clamp.
  const pad = Math.max(bboxW, bboxH) * 0.08;
  const crop: Rect = {
    left: Math.max(0, Math.floor(minX * sx - pad)),
    top: Math.max(0, Math.floor(minY * sy - pad)),
    right: Math.min(sourceWidth, Math.ceil((maxX + 1) * sx + pad)),
    bottom: Math.min(sourceHeight, Math.ceil((maxY + 1) * sy + pad)),
  };
  const cropArea = (crop.right - crop.left) * (crop.bottom - crop.top);
  const frameArea = sourceWidth * sourceHeight;
  // Subject fills most of the frame: the crop barely zooms in, skip.
  if (cropArea > frameArea * 0.85) return null;
  if (crop.right - crop.left < 64 || crop.bottom - crop.top < 64) return null;
  return crop;
}

function maskToCanvas(mask: InferenceMask): OffscreenCanvas {
  const { alpha, width, height } = mask;
  const { canvas, ctx } = canvas2d(width, height);
  const image = ctx.createImageData(width, height);
  const px = image.data;
  for (let i = 0, j = 3; i < alpha.length; i++, j += 4) {
    // Only the alpha channel matters for destination-in compositing; keep
    // RGB opaque white so premultiplication does not darken edges.
    px[j - 3] = 255;
    px[j - 2] = 255;
    px[j - 1] = 255;
    px[j] = Math.round(Math.min(1, Math.max(0, alpha[i])) * 255);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Above this many pixels the full-res matte refinement is skipped (memory). */
const MATTE_REFINE_MAX_PIXELS = 16_000_000;

/** Upscale a model-resolution mask to `w`×`h` (bilinear) as a float buffer. */
function upscaleMask(mask: InferenceMask, w: number, h: number): Float32Array {
  const { ctx } = canvas2d(w, h);
  ctx.drawImage(maskToCanvas(mask), 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0, j = 3; i < out.length; i++, j += 4) out[i] = px[j] / 255;
  return out;
}

/**
 * Full-resolution alpha from the base mask, with the subject-crop pass
 * pasted over its region when available.
 */
export function buildFullAlpha(
  width: number,
  height: number,
  base: InferenceMask,
  refinement?: MaskRefinement,
): Float32Array {
  const alpha = upscaleMask(base, width, height);
  if (refinement) {
    const { crop, mask } = refinement;
    const w = crop.right - crop.left;
    const h = crop.bottom - crop.top;
    const tile = upscaleMask(mask, w, h);
    // Replace (not blend): the crop is padded into background where both
    // masks are ~0, so the seam is invisible.
    for (let y = 0; y < h; y++) {
      const dst = (crop.top + y) * width + crop.left;
      alpha.set(tile.subarray(y * w, y * w + w), dst);
    }
  }
  return alpha;
}

/**
 * Pixels near the current foreground/background boundary, dilated so
 * strands the low-res pass missed entirely are still inside the band.
 */
export function edgeBand(alpha: Float32Array, width: number, height: number, radius: number): Uint8Array {
  const soft = new Float32Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) soft[i] = alpha[i] > 0.02 && alpha[i] < 0.98 ? 1 : 0;
  boxBlur(soft, soft, width, height, radius);
  const band = new Uint8Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) band[i] = soft[i] > 0 ? 1 : 0;
  return band;
}

/**
 * Square tiles (source coordinates) covering the edge band at a zoom that
 * gives the model real extra resolution, best-covered first.
 */
export function planEdgeTiles(
  band: Uint8Array,
  width: number,
  height: number,
  inputSize: number,
  maxTiles: number,
): Rect[] {
  const longest = Math.max(width, height);
  // Already near native resolution: tiles would not add detail.
  if (longest <= inputSize * 1.25) return [];
  // 2x zoom relative to the base pass, clamped to the short side.
  const size = Math.min(Math.min(width, height), Math.round(longest / 2));
  if (size < 256) return [];
  const stride = Math.max(1, Math.round(size * 0.75));

  const candidates: { rect: Rect; score: number }[] = [];
  for (let top = 0; top < height; top += stride) {
    for (let left = 0; left < width; left += stride) {
      const rect: Rect = {
        left: Math.min(left, width - size),
        top: Math.min(top, height - size),
        right: 0,
        bottom: 0,
      };
      rect.right = rect.left + size;
      rect.bottom = rect.top + size;
      let count = 0;
      // Sample every 4th pixel for speed.
      for (let y = rect.top; y < rect.bottom; y += 4) {
        const row = y * width;
        for (let x = rect.left; x < rect.right; x += 4) count += band[row + x];
      }
      if (count * 16 > size * size * 0.004) candidates.push({ rect, score: count });
      if (rect.left + size >= width) break;
    }
    if (top + size >= height) break;
  }
  // De-duplicate tiles clamped onto the same position.
  const seen = new Set<string>();
  return candidates
    .sort((a, b) => b.score - a.score)
    .filter(({ rect }) => {
      const key = `${rect.left}:${rect.top}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxTiles)
    .map((c) => c.rect);
}

/** Accumulators for merging tile passes into the full-res alpha. */
export interface TileMerge {
  sum: Float32Array;
  weight: Float32Array;
}

export function createTileMerge(length: number): TileMerge {
  return { sum: new Float32Array(length), weight: new Float32Array(length) };
}

/**
 * Add one tile's alpha with a feathered window (full weight inside, linear
 * falloff over the outer 12.5% — except along image borders).
 */
export function accumulateTile(
  merge: TileMerge,
  band: Uint8Array,
  width: number,
  height: number,
  rect: Rect,
  mask: InferenceMask,
): void {
  const w = rect.right - rect.left;
  const h = rect.bottom - rect.top;
  const tile = upscaleMask(mask, w, h);
  const margin = Math.max(1, Math.round(w * 0.125));
  const ramp = (d: number, atImageEdge: boolean) =>
    atImageEdge ? 1 : Math.min(1, (d + 1) / margin);
  for (let y = 0; y < h; y++) {
    const gy = rect.top + y;
    const wy = Math.min(
      ramp(y, rect.top === 0),
      ramp(h - 1 - y, rect.bottom === height),
    );
    const row = gy * width;
    for (let x = 0; x < w; x++) {
      const gi = row + rect.left + x;
      if (!band[gi]) continue;
      const wx = Math.min(
        ramp(x, rect.left === 0),
        ramp(w - 1 - x, rect.right === width),
      );
      const wt = wx * wy;
      merge.sum[gi] += tile[y * w + x] * wt;
      merge.weight[gi] += wt;
    }
  }
}

/** Blend accumulated tile alpha into `alpha` where tiles had coverage. */
export function applyTileMerge(alpha: Float32Array, merge: TileMerge): void {
  for (let i = 0; i < alpha.length; i++) {
    const wt = merge.weight[i];
    if (wt <= 0) continue;
    const tiles = merge.sum[i] / wt;
    // Full trust once a pixel is inside a tile's solid core; fade in over
    // the feathered rim so seams against untiled band pixels stay soft.
    const t = Math.min(1, wt);
    alpha[i] = tiles * t + alpha[i] * (1 - t);
  }
}

/**
 * Apply a full-resolution alpha to the source: snap it to the image with a
 * guided filter, remove background colour bleed, and return a transparent
 * RGBA bitmap at the source resolution.
 */
export function compositeCutout(source: ImageBitmap, alpha: Float32Array): ImageBitmap {
  const { width, height } = source;
  const { canvas: out, ctx } = canvas2d(width, height);
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, width, height);
  if (width * height <= MATTE_REFINE_MAX_PIXELS) {
    refineMatte(image.data, alpha, width, height);
  } else {
    const px = image.data;
    for (let i = 0, j = 3; i < alpha.length; i++, j += 4) {
      px[j] = Math.round(Math.min(1, Math.max(0, alpha[i])) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return out.transferToImageBitmap();
}
