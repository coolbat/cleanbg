/**
 * Worker-side pixel helpers built on OffscreenCanvas.
 * No DOM access here — everything runs inside the inference worker.
 */

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
  if (cropArea > frameArea * 0.7) return null;
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
    // Squash near-zero alpha so faint specks the model hallucinated in the
    // background do not survive as ghost pixels in the PNG.
    const a = alpha[i];
    px[j] = a < 0.02 ? 0 : Math.round(Math.min(1, a) * 255);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Build the full-resolution alpha mask (base mask upscaled, refined region
 * pasted over it) and apply it to the source bitmap. Returns a transparent
 * RGBA bitmap at the source resolution.
 */
export function compositeCutout(
  source: ImageBitmap,
  base: InferenceMask,
  refinement?: MaskRefinement,
): ImageBitmap {
  const { width, height } = source;
  const { canvas: maskCanvas, ctx: maskCtx } = canvas2d(width, height);
  maskCtx.drawImage(maskToCanvas(base), 0, 0, width, height);

  if (refinement) {
    const { crop, mask } = refinement;
    const w = crop.right - crop.left;
    const h = crop.bottom - crop.top;
    // Replace (not blend) the subject region with the sharper mask. The
    // crop is padded into background where both masks are ~0, so the seam
    // is invisible.
    maskCtx.clearRect(crop.left, crop.top, w, h);
    maskCtx.drawImage(maskToCanvas(mask), crop.left, crop.top, w, h);
  }

  const { canvas: out, ctx } = canvas2d(width, height);
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(maskCanvas, 0, 0);
  return out.transferToImageBitmap();
}
