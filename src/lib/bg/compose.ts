/**
 * Main-thread export helpers: turn the transparent cutout into a file,
 * optionally over a background colour or image.
 */

export type BackgroundFill =
  | { type: 'transparent' }
  | { type: 'color'; color: string }
  | { type: 'image'; image: CanvasImageSource; fit?: 'cover' | 'contain' };

export type ExportFormat = 'image/png' | 'image/webp' | 'image/jpeg';

export interface ExportOptions {
  background?: BackgroundFill;
  format?: ExportFormat;
  /** Encoder quality 0..1 (WebP / JPEG). */
  quality?: number;
  /** Trim transparent padding around the subject. */
  cropToSubject?: boolean;
  /** Cap the longest side; ignored when the image is already smaller. */
  maxDimension?: number;
  /** Center the image in a square frame. Padding uses the background color, or stays clear. */
  square?: boolean;
  /** Middle of the downloaded filename, e.g. `photo-white.jpg`. */
  filenameTag?: string;
}

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: OffscreenCanvas | HTMLCanvasElement) {
  const ctx = canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

function drawCover(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  fit: 'cover' | 'contain',
) {
  const iw = 'videoWidth' in image ? image.videoWidth : (image as { width: number }).width;
  const ih = 'videoHeight' in image ? image.videoHeight : (image as { height: number }).height;
  const scale = fit === 'cover' ? Math.max(width / iw, height / ih) : Math.min(width / iw, height / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

/** Draw the cutout (with background) onto a canvas of the same size. */
export function renderCutout(
  cutout: ImageBitmap,
  background: BackgroundFill = { type: 'transparent' },
): OffscreenCanvas | HTMLCanvasElement {
  const { width, height } = cutout;
  const canvas = makeCanvas(width, height);
  const ctx = context2d(canvas);
  if (background.type === 'color') {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, width, height);
  } else if (background.type === 'image') {
    drawCover(ctx, background.image, width, height, background.fit ?? 'cover');
  }
  ctx.drawImage(cutout, 0, 0);
  return canvas;
}

function cropTransparent(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): OffscreenCanvas | HTMLCanvasElement {
  const ctx = context2d(canvas);
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return canvas;
  const pad = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.02);
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const right = Math.min(width, maxX + 1 + pad);
  const bottom = Math.min(height, maxY + 1 + pad);
  const w = Math.max(1, right - left);
  const h = Math.max(1, bottom - top);
  if (w === width && h === height) return canvas;
  const out = makeCanvas(w, h);
  context2d(out).drawImage(canvas, left, top, w, h, 0, 0, w, h);
  return out;
}

function padToSquare(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  fill: string | null,
): OffscreenCanvas | HTMLCanvasElement {
  const { width, height } = canvas;
  const size = Math.max(width, height);
  if (width === height) return canvas;
  const out = makeCanvas(size, size);
  const ctx = context2d(out);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.drawImage(canvas, Math.round((size - width) / 2), Math.round((size - height) / 2));
  return out;
}

function fitLongest(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  maxDimension: number,
): OffscreenCanvas | HTMLCanvasElement {
  const longest = Math.max(canvas.width, canvas.height);
  if (longest <= maxDimension) return canvas;
  const scale = maxDimension / longest;
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const out = makeCanvas(w, h);
  const ctx = context2d(out);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, w, h);
  return out;
}

async function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: ExportFormat,
  quality?: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      type,
      quality,
    );
  });
}

export async function exportCutout(cutout: ImageBitmap, options: ExportOptions = {}): Promise<Blob> {
  const format = options.format ?? 'image/png';
  let background = options.background ?? { type: 'transparent' as const };
  if (format === 'image/jpeg' && background.type === 'transparent') {
    background = { type: 'color', color: '#ffffff' };
  }
  let canvas = renderCutout(cutout, background);
  if (options.cropToSubject) canvas = cropTransparent(canvas);
  if (options.maxDimension) canvas = fitLongest(canvas, options.maxDimension);
  if (options.square) {
    canvas = padToSquare(canvas, background.type === 'color' ? background.color : null);
  }
  const quality =
    format === 'image/png' ? undefined : (options.quality ?? (format === 'image/jpeg' ? 0.92 : 0.92));
  return canvasToBlob(canvas, format, quality);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function extensionFor(format: ExportFormat): string {
  if (format === 'image/webp') return 'webp';
  if (format === 'image/jpeg') return 'jpg';
  return 'png';
}

export function suggestFilename(original: string, format: ExportFormat, tag = 'no-bg'): string {
  const base = original.replace(/\.[^.]+$/, '') || 'image';
  const safe = tag.replace(/[^\w-]+/g, '') || 'no-bg';
  return `${base}-${safe}.${extensionFor(format)}`;
}

function uniqueName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot >= 0 ? name.slice(0, dot) : name;
  const ext = dot >= 0 ? name.slice(dot) : '';
  let i = 2;
  let next = `${stem}-${i}${ext}`;
  while (used.has(next)) {
    i += 1;
    next = `${stem}-${i}${ext}`;
  }
  used.add(next);
  return next;
}

export async function zipCutouts(
  items: { bitmap: ImageBitmap; name: string }[],
  options: ExportOptions = {},
): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const used = new Set<string>();
  const format = options.format ?? 'image/png';
  for (const item of items) {
    const blob = await exportCutout(item.bitmap, options);
    zip.file(uniqueName(used, suggestFilename(item.name, format, options.filenameTag)), blob);
  }
  return zip.generateAsync({ type: 'blob' });
}
