import type { profile as source } from '../uk/profile';
import type { Dictionary } from '../types';

export const profile = {
  language: {
    title: 'Interface language',
    hint: 'Applies at once and on all your devices, notifications included.',
    failed: 'The language was not changed, please try again',
  },
} satisfies Dictionary<typeof source>;
