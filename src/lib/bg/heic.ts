/**
 * Decode HEIC/HEIF when the browser cannot (Chrome/Firefox).
 *
 * Safari/iOS can already decode HEIC via createImageBitmap; callers should
 * try that first so this LGPL path is never loaded on those devices.
 *
 * heic-to (LGPL-3.0) wraps libheif and runs entirely in-process. Source:
 * https://github.com/hoppergee/heic-to — license copy at /licenses.
 */

export async function decodeHeic(blob: Blob): Promise<ImageBitmap> {
  const { heicTo, isHeic } = await import('heic-to');
  const file =
    blob instanceof File
      ? blob
      : new File([blob], 'image.heic', { type: blob.type || 'image/heic' });
  if (!(await isHeic(file))) {
    throw new Error('not-heic');
  }
  return heicTo({ blob, type: 'bitmap' });
}
