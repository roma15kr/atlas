import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** How close to the end (px) still counts as "reading the latest messages". */
export const AT_END = 80;

/**
 * Scrolling back through a long conversation, newest at the bottom:
 * - a sentinel at the top loads the previous page when it comes near (and `loadOlder()` works for a button);
 * - the messages on screen stay in place while older ones are inserted above;
 * - a new last message follows the view only when the user was at the end (or wrote it); otherwise `newBelow`.
 */
export function useScrollBack({ firstId, lastId, lastIsMine, hasMore, loadOlder }: {
  firstId?: string; lastId?: string; lastIsMine?: boolean; hasMore: boolean; loadOlder?: () => Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const fromEnd = useRef<number | null>(null);
  const loading = useRef(false);
  const [busy, setBusy] = useState(false);
  const [newBelow, setNewBelow] = useState(false);

  const scrollToEnd = useCallback(() => {
    const box = container.current;
    if (box) box.scrollTop = box.scrollHeight;
    atEnd.current = true;
    setNewBelow(false);
  }, []);

  const older = useCallback(async () => {
    const box = container.current;
    if (!loadOlder || !hasMore || loading.current) return;
    loading.current = true; setBusy(true);
    fromEnd.current = box ? box.scrollHeight - box.scrollTop : null;
    try { await loadOlder(); } finally { loading.current = false; setBusy(false); }
  }, [hasMore, loadOlder]);

  // Older messages went in above: put the view back where it was, measured from the end.
  useLayoutEffect(() => {
    const box = container.current;
    if (!box || fromEnd.current === null) return;
    box.scrollTop = box.scrollHeight - fromEnd.current;
    fromEnd.current = null;
  }, [firstId]);

  // A new last message: follow it if the user was at the end or wrote it, else offer a jump.
  useLayoutEffect(() => {
    if (!lastId) return;
    if (atEnd.current || lastIsMine) scrollToEnd();
    else setNewBelow(true);
  }, [lastId, lastIsMine, scrollToEnd]);

  const onScroll = useCallback(() => {
    const box = container.current;
    if (!box) return;
    atEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < AT_END;
    if (atEnd.current) setNewBelow(false);
  }, []);

  useEffect(() => {
    const box = container.current; const top = sentinel.current;
    if (!box || !top || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void older(); }, { root: box, rootMargin: '200px 0px 0px 0px' });
    observer.observe(top);
    return () => observer.disconnect();
  }, [older]);

  return { container, sentinel, onScroll, older, busy, newBelow, scrollToEnd };
}
