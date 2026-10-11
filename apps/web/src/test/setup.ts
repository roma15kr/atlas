import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }),
});

import { afterEach } from 'vitest';
import { sessionStore } from '../lib/api';

// The session lives in module memory; start every test signed out.
afterEach(() => sessionStore.set(null));

// ProseMirror (the rich-text editor) measures ranges and points, which jsdom does not lay out.
const emptyRect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
Range.prototype.getBoundingClientRect = () => emptyRect as DOMRect;
Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
if (!document.elementFromPoint) document.elementFromPoint = () => null;

// The editor is a lazy chunk in the app; load it once here so tests don't race its first download.
await import('../components/richtext/RichTextEditorImpl');
