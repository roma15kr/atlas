import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }),
});

import { afterEach } from 'vitest';
import { sessionStore } from '../lib/api';

// The session lives in module memory; start every test signed out.
afterEach(() => sessionStore.set(null));
