/** Chrome's install prompt arrives once, early; it is kept here until the profile offers «Установить приложение». */
interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export type InstallState = 'installed' | 'available' | 'ios' | 'unavailable';

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/** Called once at start-up, before the browser fires its events. */
export function watchInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => { deferred = event as InstallPromptEvent; changed(); });
  window.addEventListener('appinstalled', () => { deferred = null; installedNow = true; changed(); });
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function installState(): InstallState {
  if (installedNow || standalone()) return 'installed';
  if (deferred) return 'available';
  return isIos() ? 'ios' : 'unavailable';
}

/** Shows Chrome's install dialog; resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  changed();
  return outcome === 'accepted';
}

/** For tests: forget a kept prompt. */
export function resetInstallPrompt(): void { deferred = null; installedNow = false; }
