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
  if (!file.type.startsWith('image/')) throw new ImagePreparationError('Выберите изображение: JPEG, PNG или WebP');
  if (file.size > AVATAR_SOURCE_MAX_BYTES) throw new ImagePreparationError('Файл больше 15 МБ');
  let image: Awaited<ReturnType<typeof decode>>;
  try { image = await decode(file); } catch { throw new ImagePreparationError('Не удалось открыть изображение'); }
  const side = Math.min(image.width, image.height);
  if (!side) throw new ImagePreparationError('Не удалось открыть изображение');
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new ImagePreparationError('Браузер не может обработать изображение');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  if ('close' in image && typeof image.close === 'function') image.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new ImagePreparationError('Браузер не может обработать изображение');
  return blob;
}
