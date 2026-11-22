import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEMO_MODE } from './AppContext';
import {
  applyBranding, asBranding, cacheBranding, cachedBranding, createDemoBranding, DEFAULT_BRANDING, isDemoBranding, remoteBranding,
  type Branding, type BrandingBackend, type BrandingFile, type BrandingPatch,
} from '../lib/branding';

interface BrandingValue {
  branding: Branding;
  update(patch: BrandingPatch): Promise<void>;
  uploadLogo(files: Record<BrandingFile, Blob>): Promise<void>;
  removeLogo(): Promise<void>;
  reset(): Promise<void>;
}

const BrandingContext = createContext<BrandingValue | null>(null);

const backend = (): BrandingBackend => isDemoBranding(false) ? createDemoBranding() : remoteBranding;

/**
 * The company's appearance for every screen, the login page included. It paints the last known branding at once,
 * then loads the current one, and follows `branding:changed` from the server while the app is open.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(() => cachedBranding() ?? DEFAULT_BRANDING);
  const accept = useCallback((value: unknown) => {
    const next = asBranding(value);
    if (!next) return;
    setBranding(next); cacheBranding(next);
  }, []);

  useEffect(() => { applyBranding(branding); }, [branding]);

  useEffect(() => {
    let active = true;
    backend().load()
      .then((loaded) => asBranding(loaded) ?? Promise.reject(new Error('invalid branding')))
      .catch(() => DEMO_MODE ? createDemoBranding().load() : cachedBranding() ?? DEFAULT_BRANDING)
      .then((loaded) => { if (active) accept(loaded); });
    const onSocket = (event: Event) => {
      const { event: name, payload } = (event as CustomEvent<{ event: string; payload: unknown }>).detail;
      if (name === 'branding:changed') accept(payload);
    };
    window.addEventListener('atlas:socket', onSocket);
    return () => { active = false; window.removeEventListener('atlas:socket', onSocket); };
  }, [accept]);

  const value = useMemo<BrandingValue>(() => ({
    branding,
    update: async (patch) => accept(await backend().update(patch)),
    uploadLogo: async (files) => accept(await backend().uploadLogo(files)),
    removeLogo: async () => accept(await backend().removeLogo()),
    reset: async () => accept(await backend().reset()),
  }), [branding, accept]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

/** The current branding; outside the provider (isolated component tests) the standard look. */
export function useBranding(): BrandingValue {
  return useContext(BrandingContext) ?? {
    branding: DEFAULT_BRANDING,
    update: async () => undefined, uploadLogo: async () => undefined, removeLogo: async () => undefined, reset: async () => undefined,
  };
}
