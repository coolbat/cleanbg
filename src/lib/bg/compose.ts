/**
 * Main-thread export helpers: turn the transparent cutout into a file,
 * optionally over a background colour or image.
 */

export type BackgroundFill =
  | { type: 'transparent' }
  | { type: 'color'; color: string }
  | { type: 'image'; image: CanvasImageSource; fit?: 'cover' | 'contain' };

export type ExportFormat = 'image/png' | 'image/webp';

export interface ExportOptions {
  background?: BackgroundFill;
  format?: ExportFormat;
  /** WebP quality 0..1 (ignored for PNG). */
  quality?: number;
}

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
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
  const ctx = canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('2D canvas context unavailable');
  if (background.type === 'color') {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, width, height);
  } else if (background.type === 'image') {
    drawCover(ctx, background.image, width, height, background.fit ?? 'cover');
  }
  ctx.drawImage(cutout, 0, 0);
  return canvas;
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
  const canvas = renderCutout(cutout, options.background);
  return canvasToBlob(canvas, format, format === 'image/webp' ? options.quality ?? 0.92 : undefined);
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
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function suggestFilename(original: string, format: ExportFormat): string {
  const base = original.replace(/\.[^.]+$/, '') || 'image';
  return `${base}-no-bg.${format === 'image/webp' ? 'webp' : 'png'}`;
}
