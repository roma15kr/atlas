import i18n from '../i18n';
/** Profile photos are uploaded as a 512×512 JPEG: re-encoding through a canvas drops camera metadata such as GPS. */
export const AVATAR_SIZE = 512;
export const AVATAR_SOURCE_MAX_BYTES = 15 * 1024 * 1024;

export class ImagePreparationError extends Error {}

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* fall back to <img>, e.g. for some HEIC-less browsers */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return Object.assign(image, { width: image.naturalWidth, height: image.naturalHeight });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Center-crops the picture to a square and re-encodes it; refuses non-images and huge files before decoding. */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new ImagePreparationError(i18n.t('ui:photo.chooseImage'));
  if (file.size > AVATAR_SOURCE_MAX_BYTES) throw new ImagePreparationError(i18n.t('ui:photo.tooBig'));
  let image: Awaited<ReturnType<typeof decode>>;
  try { image = await decode(file); } catch { throw new ImagePreparationError(i18n.t('ui:photo.openFailed')); }
  const side = Math.min(image.width, image.height);
  if (!side) throw new ImagePreparationError(i18n.t('ui:photo.openFailed'));
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new ImagePreparationError(i18n.t('ui:photo.browser'));
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  if ('close' in image && typeof image.close === 'function') image.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new ImagePreparationError(i18n.t('ui:photo.browser'));
  return blob;
}

export const LOGO_SOURCE_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

type BrandIcon = 'logo' | 'icon192' | 'icon512' | 'maskable512' | 'apple180' | 'badge96';

/** How each icon is drawn: its square size, background (null = transparent) and the share of the side the logo may fill. */
const BRAND_ICONS: Record<BrandIcon, { size: number; background: 'none' | 'white' | 'accent'; fill: number }> = {
  logo: { size: 512, background: 'none', fill: 1 },
  icon192: { size: 192, background: 'white', fill: 0.8 },
  icon512: { size: 512, background: 'white', fill: 0.8 },
  maskable512: { size: 512, background: 'accent', fill: 0.6 }, // Android crops maskable icons to a circle: stay inside the safe zone
  apple180: { size: 180, background: 'white', fill: 0.8 },     // iOS shows transparency as black
  badge96: { size: 96, background: 'none', fill: 1 },
};

/** Checks a logo file before decoding: PNG, JPEG or WebP (never SVG) up to 5 MB. */
export function logoProblem(file: File): string | null {
  if (!LOGO_TYPES.includes(file.type) || file.size > LOGO_SOURCE_MAX_BYTES) return i18n.t('branding:logo.rules');
  return null;
}

/**
 * Makes the logo and app icons from one uploaded image: the whole image is fitted, never cropped, centred in each
 * square. Re-encoding through a canvas also drops metadata.
 */
export async function prepareBrandIcons(file: File, accentColor: string): Promise<Record<BrandIcon, Blob>> {
  const problem = logoProblem(file);
  if (problem) throw new ImagePreparationError(problem);
  let image: Awaited<ReturnType<typeof decode>>;
  try { image = await decode(file); } catch { throw new ImagePreparationError(i18n.t('ui:photo.openFailed')); }
  if (!image.width || !image.height) throw new ImagePreparationError(i18n.t('ui:photo.openFailed'));
  const result = {} as Record<BrandIcon, Blob>;
  for (const [name, spec] of Object.entries(BRAND_ICONS) as Array<[BrandIcon, typeof BRAND_ICONS[BrandIcon]]>) {
    const canvas = document.createElement('canvas');
    canvas.width = spec.size; canvas.height = spec.size;
    const context = canvas.getContext('2d');
    if (!context) throw new ImagePreparationError(i18n.t('ui:photo.browser'));
    if (spec.background !== 'none') { context.fillStyle = spec.background === 'white' ? '#ffffff' : accentColor; context.fillRect(0, 0, spec.size, spec.size); }
    const box = spec.size * spec.fill;
    const scale = Math.min(box / image.width, box / image.height);
    const [width, height] = [image.width * scale, image.height * scale];
    context.drawImage(image, (spec.size - width) / 2, (spec.size - height) / 2, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new ImagePreparationError(i18n.t('ui:photo.browser'));
    result[name] = blob;
  }
  if ('close' in image && typeof image.close === 'function') image.close();
  return result;
}
