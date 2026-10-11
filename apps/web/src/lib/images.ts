import { apiBlob, apiRequest, sessionStore } from './api';

/** Largest image that can be pasted into formatted text (the API limit). */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export const IMAGE_RULES_MESSAGE = 'Можно добавить только изображение PNG, JPEG, GIF или WebP до 5 МБ';

/** Whether a file may be uploaded; the server checks the bytes again. */
export const acceptableImage = (file: File) => IMAGE_TYPES.has(file.type) && file.size > 0 && file.size <= IMAGE_MAX_BYTES;

const isDemo = () => Boolean(sessionStore.get()?.accessToken.startsWith('demo-'));

/** Demo mode keeps uploaded images in the browser: Atlas image URL → object URL. */
const demoImages = new Map<string, string>();

/** Uploads an image and returns its Atlas URL (`/api/v1/images/<id>`). */
export async function uploadImage(file: File): Promise<string> {
  if (isDemo()) {
    const url = `/api/v1/images/${crypto.randomUUID()}`;
    demoImages.set(url, URL.createObjectURL(file));
    return url;
  }
  const form = new FormData();
  form.append('file', file);
  return (await apiRequest<{ id: string; url: string }>('/images', { method: 'POST', body: form })).url;
}

/** Object URLs of downloaded images, kept for the page's lifetime so each image is fetched once. */
const loaded = new Map<string, Promise<string>>();

/** An object URL for an Atlas image, fetched with the session token. */
export function loadImage(url: string): Promise<string> {
  const demo = demoImages.get(url);
  if (demo) return Promise.resolve(demo);
  let pending = loaded.get(url);
  if (!pending) {
    pending = apiBlob(url).then((blob) => URL.createObjectURL(blob));
    pending.catch(() => loaded.delete(url));
    loaded.set(url, pending);
  }
  return pending;
}
