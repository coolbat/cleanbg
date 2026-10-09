/** Image types the tool accepts. Safe to import from SSR components. */

export const NATIVE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
] as const;

export const HEIC_MIME_TYPES = [
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
] as const;

export const IMAGE_ACCEPT_ATTRIBUTE = [
  ...NATIVE_IMAGE_MIME_TYPES,
  ...HEIC_MIME_TYPES,
  '.heic',
  '.heif',
  '.heics',
].join(',');

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|hei[cf]s?)$/i;

export function isProbablyImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return IMAGE_EXT.test(file.name);
}

export function isHeicFile(file: Blob): boolean {
  if (HEIC_MIME_TYPES.includes(file.type as (typeof HEIC_MIME_TYPES)[number])) return true;
  return file instanceof File && /\.hei[cf]s?$/i.test(file.name);
}
