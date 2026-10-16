import { useEffect, useState } from 'react';

/** Screens up to 640px wide get the phone layouts (the same breakpoint as the phone CSS rules). */
export const PHONE_QUERY = '(max-width: 640px)';

const matches = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;

/** True on a phone-sized screen; follows rotation and window resizing. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return phone;
}
