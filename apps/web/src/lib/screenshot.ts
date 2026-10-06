import { domToCanvas } from 'modern-screenshot';

export const SCREENSHOT_MAX_BYTES = 3 * 1024 * 1024;

/** Runs on every copied node: password fields are blank in the picture; the real page is untouched. */
export function blankSecrets(node: Node): void {
  if (node instanceof HTMLInputElement && node.type === 'password') {
    node.value = '';
    node.setAttribute('value', '');
  }
}

/** Leaves out anything marked `data-screenshot="exclude"`. */
export function includeInScreenshot(node: Node): boolean {
  return !(node instanceof HTMLElement && node.dataset.screenshot === 'exclude');
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/**
 * A JPEG of what the person currently sees: the page is drawn from the DOM (no permission prompt),
 * cropped to the visible area and kept under 3 MB. Returns null when the browser can't do it.
 */
export async function captureScreen(root: HTMLElement = document.body): Promise<Blob | null> {
  try {
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    const page = await domToCanvas(root, {
      scale,
      backgroundColor: '#f4f6f7',
      onCloneEachNode: blankSecrets,
      filter: includeInScreenshot,
      timeout: 8000,
    });
    const view = document.createElement('canvas');
    view.width = Math.round(window.innerWidth * scale);
    view.height = Math.round(window.innerHeight * scale);
    const context = view.getContext('2d');
    if (!context) return null;
    context.drawImage(page, Math.round(window.scrollX * scale), Math.round(window.scrollY * scale), view.width, view.height, 0, 0, view.width, view.height);
    for (const quality of [0.82, 0.6, 0.4]) {
      const blob = await toJpeg(view, quality);
      if (blob && blob.size <= SCREENSHOT_MAX_BYTES) return blob;
    }
    return null;
  } catch {
    return null;
  }
}
