/** Makes `useIsPhone()` and other `(max-width: …)` queries match, as on a 390px-wide phone; returns a restore function. */
export function phoneViewport(width = 390): () => void {
  const previous = window.matchMedia;
  window.matchMedia = ((query: string) => {
    const limit = /max-width:\s*(\d+)px/.exec(query);
    return { matches: limit ? width <= Number(limit[1]) : false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined,
      addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false };
  }) as typeof window.matchMedia;
  return () => { window.matchMedia = previous; };
}
