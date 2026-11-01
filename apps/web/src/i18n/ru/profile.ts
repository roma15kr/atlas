import type { profile as source } from '../uk/profile';
import type { Dictionary } from '../types';

export const profile = {
  language: {
    title: 'Язык интерфейса',
    hint: 'Применяется сразу и на всех ваших устройствах, вместе с уведомлениями.',
    failed: 'Язык не изменён, попробуйте ещё раз',
  },
} satisfies Dictionary<typeof source>;
