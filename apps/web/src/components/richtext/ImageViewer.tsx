import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { loadImage } from '../../lib/images';

const SWIPE = 50;

/**
 * Highslide-style enlarged view of the images of one formatted text: fits the screen over a dark backdrop, grows
 * from the thumbnail (unless the user prefers reduced motion), and pages with ‹ ›, the arrow keys or a swipe.
 */
export function ImageViewer({ images, index: initial, origin, onClose }: {
  images: Array<{ src: string; alt: string }>; index: number; origin?: HTMLElement; onClose: () => void;
}) {
  const [index, setIndex] = useState(initial);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const grown = useRef(false);
  const touchX = useRef<number | null>(null);
  const image = images[index]!;
  const many = images.length > 1;
  const step = (delta: number) => setIndex((current) => (current + delta + images.length) % images.length);

  useEffect(() => {
    let active = true;
    setUrl(null); setFailed(false);
    loadImage(image.src).then((objectUrl) => { if (active) setUrl(objectUrl); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [image.src]);

  useEffect(() => {
    close.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, []);

  useEffect(() => {
    // Caught before anything else (a task dialog underneath also closes on Escape), and kept from it.
    const keys = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && !(many && (event.key === 'ArrowRight' || event.key === 'ArrowLeft'))) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') onClose();
      else step(event.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', keys, true);
    return () => window.removeEventListener('keydown', keys, true);
  // step only depends on the number of images
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, many, images.length]);

  // The first image grows from its thumbnail (FLIP); later ones just appear.
  useLayoutEffect(() => {
    const element = picture.current;
    if (!element || !url || grown.current || !origin) return;
    grown.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const from = origin.getBoundingClientRect();
    const to = element.getBoundingClientRect();
    if (!to.width || !to.height) return;
    element.style.transformOrigin = 'top left';
    element.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
    requestAnimationFrame(() => { element.style.transition = 'transform 180ms ease-out'; element.style.transform = ''; });
  }, [url, origin]);

  const swipeStart = (event: TouchEvent) => { touchX.current = event.touches[0]?.clientX ?? null; };
  const swipeEnd = (event: TouchEvent) => {
    const start = touchX.current; touchX.current = null;
    const end = event.changedTouches[0]?.clientX;
    if (!many || start === null || end === undefined || Math.abs(end - start) < SWIPE) return;
    step(end < start ? 1 : -1);
  };

  return createPortal(<div className="image-viewer" role="dialog" aria-modal="true" aria-label="Просмотр изображения"
    onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }} onMouseDown={(event) => event.stopPropagation()}
    onTouchStart={swipeStart} onTouchEnd={swipeEnd}>
    <div className="image-viewer__bar">
      {many && <span className="image-viewer__count">{index + 1} из {images.length}</span>}
      {url && <a className="image-viewer__action" href={url} download="atlas-image" aria-label="Скачать"><Download size={18} aria-hidden /><span>Скачать</span></a>}
      <button ref={close} type="button" className="image-viewer__action" aria-label="Закрыть" onClick={onClose}><X size={20} aria-hidden /></button>
    </div>
    {many && <button type="button" className="image-viewer__nav image-viewer__nav--prev" aria-label="Предыдущее изображение" onClick={() => step(-1)}><ChevronLeft size={26} aria-hidden /></button>}
    {failed ? <p className="image-viewer__missing">Изображение недоступно</p>
      : url ? <img ref={picture} className="image-viewer__image" src={url} alt={image.alt} onClick={(event) => event.stopPropagation()} />
      : <span className="image-viewer__loading" aria-busy="true" aria-label="Изображение загружается" />}
    {many && <button type="button" className="image-viewer__nav image-viewer__nav--next" aria-label="Следующее изображение" onClick={() => step(1)}><ChevronRight size={26} aria-hidden /></button>}
  </div>, document.body);
}
