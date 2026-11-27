/**
 * The company's appearance on the web: the title, accent and sidebar colours (as CSS tokens), and the logo with the
 * icons made from it. The API keeps the same contrast rule (`apps/api/src/branding.ts`); a test compares them.
 */
import { apiRequest, sessionStore } from './api';

export const BRANDING_FILES = ['logo', 'icon192', 'icon512', 'maskable512', 'apple180', 'badge96'] as const;
export type BrandingFile = typeof BRANDING_FILES[number];
export const BRANDING_FILE_SIZES: Record<BrandingFile, number> = { logo: 512, icon192: 192, icon512: 512, maskable512: 512, apple180: 180, badge96: 96 };

export interface Branding {
  appName: string;
  accentColor: string;
  sidebarColor: string;
  logoVersion: string | null;
  files: Record<BrandingFile, string> | null;
  updatedAt?: string | null;
}
export type BrandingPatch = Partial<Pick<Branding, 'appName' | 'accentColor' | 'sidebarColor'>>;

export const DEFAULT_BRANDING: Branding = { appName: 'Quorfield', accentColor: '#176f68', sidebarColor: '#1d2a28', logoVersion: null, files: null, updatedAt: null };
export const MIN_ACCENT_CONTRAST = 4.5;
export const APP_NAME_MAX = 30;

/** Ready-made accent and sidebar pairs; every accent passes the contrast rule. */
export const BRANDING_PRESETS = [
  { key: 'atlas', accentColor: '#176f68', sidebarColor: '#1d2a28' },
  { key: 'indigo', accentColor: '#3949ab', sidebarColor: '#1f2540' },
  { key: 'ocean', accentColor: '#0b6aa8', sidebarColor: '#14283a' },
  { key: 'forest', accentColor: '#2e7d32', sidebarColor: '#1b2a1c' },
  { key: 'burgundy', accentColor: '#9c2f4a', sidebarColor: '#2a1a20' },
  { key: 'amber', accentColor: '#a55a12', sidebarColor: '#2b2118' },
  { key: 'graphite', accentColor: '#37474f', sidebarColor: '#f1f3f2' },
  { key: 'plum', accentColor: '#6a3d9a', sidebarColor: '#221a2e' },
] as const;
export type PresetKey = typeof BRANDING_PRESETS[number]['key'];

export const isHexColor = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value.trim());

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
const toHex = (values: number[]) => `#${values.map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')).join('')}`;
const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => { const [r, g, b] = rgb(hex).map(channel) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/** WCAG contrast ratio between two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Mixes `color` toward `target` by `amount` (0–1). */
export const mix = (color: string, target: string, amount: number): string => {
  const [a, b] = [rgb(color), rgb(target)];
  return toHex(a.map((value, index) => value + (b[index]! - value) * amount));
};
const alpha = (hex: string, value: number) => { const [r, g, b] = rgb(hex); return `rgba(${r}, ${g}, ${b}, ${value})`; };

export const accentReadable = (accent: string): boolean => isHexColor(accent) && contrastRatio('#ffffff', accent) >= MIN_ACCENT_CONTRAST;

/** Whether the sidebar is light enough to need dark text. */
export const lightSidebar = (sidebar: string): boolean => contrastRatio('#202827', sidebar) > contrastRatio('#ffffff', sidebar);

/** The CSS tokens for a company's colours: the accent with derived shades, and a sidebar whose text stays readable. */
export function brandingTokens(branding: Pick<Branding, 'accentColor' | 'sidebarColor'>): Record<string, string> {
  const accent = branding.accentColor.toLowerCase();
  const sidebar = branding.sidebarColor.toLowerCase();
  const light = lightSidebar(sidebar);
  const ink = light ? '#202827' : '#ffffff';
  return {
    '--primary': accent,
    '--primary-dark': mix(accent, '#000000', 0.18),
    '--primary-soft': mix(accent, '#ffffff', 0.9),
    '--primary-tint': mix(accent, '#ffffff', 0.94),
    '--primary-ring': alpha(accent, 0.16),
    '--sidebar': sidebar,
    '--sidebar-text': ink,
    '--sidebar-muted': mix(sidebar, ink, 0.62),
    '--sidebar-subtle': mix(sidebar, ink, 0.45),
    '--sidebar-faint': mix(sidebar, ink, 0.52),
    '--sidebar-hover': alpha(ink === '#ffffff' ? '#ffffff' : '#000000', 0.055),
    '--sidebar-active': mix(sidebar, light ? '#000000' : accent, light ? 0.08 : 0.32),
    '--sidebar-line': alpha(ink === '#ffffff' ? '#ffffff' : '#000000', 0.08),
    '--brand-mark-bg': light ? accent : mix(accent, '#ffffff', 0.9),
    '--brand-mark-text': light ? '#ffffff' : mix(accent, '#000000', 0.25),
  };
}

const setLink = (rel: string, href: string) => {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) { link = document.createElement('link'); link.rel = rel; document.head.appendChild(link); }
  if (link.getAttribute('href') !== href) link.href = href;
};

/** Puts a branding on the page: colour tokens, the theme colour, and the tab and home-screen icons. */
export function applyBranding(branding: Branding): void {
  const root = document.documentElement;
  // The standard colours come straight from styles.css, so the standard look stays exactly as designed.
  const standard = branding.accentColor === DEFAULT_BRANDING.accentColor && branding.sidebarColor === DEFAULT_BRANDING.sidebarColor;
  for (const [name, value] of Object.entries(brandingTokens(branding))) {
    if (standard) root.style.removeProperty(name); else root.style.setProperty(name, value);
  }
  document.head.querySelector('meta[name="theme-color"]')?.setAttribute('content', branding.accentColor);
  setLink('icon', branding.files?.icon192 ?? '/icons/icon-192.png');
  setLink('apple-touch-icon', branding.files?.apple180 ?? '/icons/apple-touch-icon.png');
}

/** The browser tab's title: the page name, then the company's app name. */
export const tabTitle = (page: string | undefined, appName: string): string => page && page !== appName ? `${page} · ${appName}` : appName;

/** A well-formed branding, or null for anything else (an error page, an unexpected payload). */
export function asBranding(value: unknown): Branding | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<Branding>;
  if (typeof candidate.appName !== 'string' || !candidate.appName.trim() || !isHexColor(candidate.accentColor ?? '') || !isHexColor(candidate.sidebarColor ?? '')) return null;
  const files = candidate.files && typeof candidate.files === 'object' && BRANDING_FILES.every((name) => typeof candidate.files?.[name] === 'string') ? candidate.files : null;
  return { appName: candidate.appName, accentColor: candidate.accentColor!.toLowerCase(), sidebarColor: candidate.sidebarColor!.toLowerCase(), logoVersion: files ? candidate.logoVersion ?? null : null, files, updatedAt: candidate.updatedAt ?? null };
}

const isStandard = (branding: Branding) => branding.appName === DEFAULT_BRANDING.appName && !branding.files
  && branding.accentColor === DEFAULT_BRANDING.accentColor && branding.sidebarColor === DEFAULT_BRANDING.sidebarColor;

const CACHE_KEY = 'atlas.branding';
/** The last branding this browser saw, so the next load paints it without a flash. */
export function cachedBranding(): Branding | null {
  try { return asBranding(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')); } catch { return null; }
}
export function cacheBranding(branding: Branding): void {
  try {
    if (isStandard(branding)) localStorage.removeItem(CACHE_KEY); else localStorage.setItem(CACHE_KEY, JSON.stringify(branding));
  } catch { /* storage unavailable: the next load just paints the standard look first */ }
}

export interface BrandingBackend {
  load(): Promise<Branding>;
  update(patch: BrandingPatch): Promise<Branding>;
  uploadLogo(files: Record<BrandingFile, Blob>): Promise<Branding>;
  removeLogo(): Promise<Branding>;
  reset(): Promise<Branding>;
}

export const remoteBranding: BrandingBackend = {
  load: () => apiRequest<Branding>('/branding'),
  update: (patch) => apiRequest<Branding>('/branding', { method: 'PATCH', body: patch }),
  uploadLogo: (files) => {
    const form = new FormData();
    for (const name of BRANDING_FILES) form.append(name, files[name], `${name}.png`);
    return apiRequest<Branding>('/branding/logo', { method: 'PUT', body: form });
  },
  removeLogo: () => apiRequest<Branding>('/branding/logo', { method: 'DELETE' }),
  reset: () => apiRequest<Branding>('/branding', { method: 'DELETE' }),
};

const DEMO_KEY = 'atlas.demoBranding';
/** Demo mode keeps the branding in this browser; the logo files are data URLs. */
export function createDemoBranding(): BrandingBackend {
  const read = (): Branding => { try { return { ...DEFAULT_BRANDING, ...(JSON.parse(localStorage.getItem(DEMO_KEY) ?? '{}') as Partial<Branding>) }; } catch { return DEFAULT_BRANDING; } };
  const write = (next: Branding) => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(next)); } catch { /* demo only */ } return next; };
  const asDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
  return {
    load: async () => asBranding(read()) ?? DEFAULT_BRANDING,
    update: async (patch) => {
      if (patch.accentColor && !accentReadable(patch.accentColor)) throw new Error('BRANDING_LOW_CONTRAST');
      return write({ ...read(), ...patch, appName: patch.appName?.trim() ?? read().appName });
    },
    uploadLogo: async (files) => {
      const entries = await Promise.all(BRANDING_FILES.map(async (name) => [name, await asDataUrl(files[name])] as const));
      return write({ ...read(), logoVersion: crypto.randomUUID(), files: Object.fromEntries(entries) as Record<BrandingFile, string> });
    },
    removeLogo: async () => write({ ...read(), logoVersion: null, files: null }),
    reset: async () => { try { localStorage.removeItem(DEMO_KEY); } catch { /* demo only */ } return DEFAULT_BRANDING; },
  };
}

/** Demo sessions (and a demo build without an API before sign-in) use the browser-only branding. */
export const isDemoBranding = (demoBuild: boolean): boolean => {
  const token = sessionStore.get()?.accessToken;
  return token ? token.startsWith('demo-') : demoBuild;
};
