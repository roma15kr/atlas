import 'i18next';
import type { uk } from './uk';

// Ukrainian is the source of truth for keys: `t()` accepts only keys that exist there.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: typeof uk;
  }
}
