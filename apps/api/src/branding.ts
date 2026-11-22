/** The company's appearance: title, accent and sidebar colours, and a logo with the icons made from it. */
import { query } from "./db";

export const BRANDING_FILES = ["logo", "icon192", "icon512", "maskable512", "apple180", "badge96"] as const;
export type BrandingFile = typeof BRANDING_FILES[number];
/** The square size (px) each uploaded PNG must have. */
export const BRANDING_FILE_SIZES: Record<BrandingFile, number> = { logo: 512, icon192: 192, icon512: 512, maskable512: 512, apple180: 180, badge96: 96 };

export interface Branding {
  appName: string;
  accentColor: string;
  sidebarColor: string;
  logoVersion: string | null;
  /** URLs of the logo and icons, or null without a logo. */
  files: Record<BrandingFile, string> | null;
  updatedAt: string | null;
}

export const DEFAULT_BRANDING: Branding = { appName: "Atlas", accentColor: "#176f68", sidebarColor: "#1d2a28", logoVersion: null, files: null, updatedAt: null };
/** The lowest contrast allowed between white text and the accent colour. */
export const MIN_ACCENT_CONTRAST = 4.5;

const filesOf = (version: string): Record<BrandingFile, string> =>
  Object.fromEntries(BRANDING_FILES.map((name) => [name, `/api/v1/branding/files/${version}/${name}.png`])) as Record<BrandingFile, string>;

interface BrandingRow { app_name: string; accent_color: string; sidebar_color: string; logo_version: string | null; updated_at: Date }

/** The company's appearance, or the standard look when nothing is saved (or there is no company). */
export async function brandingOf(companyId: string | null): Promise<Branding> {
  if (!companyId) return DEFAULT_BRANDING;
  const row = (await query<BrandingRow>(
    "SELECT app_name, accent_color, sidebar_color, logo_version, updated_at FROM company_branding WHERE company_id = $1", [companyId])).rows[0];
  if (!row) return DEFAULT_BRANDING;
  return {
    appName: row.app_name, accentColor: row.accent_color, sidebarColor: row.sidebar_color, logoVersion: row.logo_version,
    files: row.logo_version ? filesOf(row.logo_version) : null, updatedAt: new Date(row.updated_at).toISOString()
  };
}

/** The installation's only company; null when there are several, so public pages fall back to the standard look. */
export async function soleCompanyId(): Promise<string | null> {
  const result = await query<{ id: string }>("SELECT id FROM companies LIMIT 2");
  return result.rows.length === 1 ? result.rows[0]!.id : null;
}

const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((index) => channel(parseInt(hex.slice(index, index + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

/** WCAG contrast ratio between two `#rrggbb` colours, from 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Width and height of a PNG from its IHDR chunk, or null when the bytes are not a PNG. */
export function pngSize(body: Buffer): { width: number; height: number } | null {
  if (body.length < 24 || !body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  if (body.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

/** The web app manifest for the installed app, named and iconed after the company. */
export function manifestFor(branding: Branding): Record<string, unknown> {
  const icons = branding.files
    ? [
      { src: branding.files.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: branding.files.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: branding.files.maskable512, sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
    : [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ];
  return {
    name: branding.appName, short_name: branding.appName.slice(0, 12), lang: "uk",
    start_url: "/?source=pwa", scope: "/", display: "standalone",
    background_color: "#f5f6f7", theme_color: branding.accentColor, icons
  };
}
