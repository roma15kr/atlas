import { useEffect, useState } from 'react';
import { loadImage } from '../../lib/images';

/** An Atlas image: fetched with the session token (a plain <img> can't send it) and shown from memory. */
export function AuthImage({ src, alt }: { src: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setUrl(null); setFailed(false);
    loadImage(src).then((objectUrl) => { if (active) setUrl(objectUrl); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [src]);
  if (failed) return <span className="rich-image rich-image--missing">[изображение недоступно]</span>;
  if (!url) return <span className="rich-image rich-image--loading" aria-busy="true" aria-label={alt || 'Изображение загружается'} />;
  return <img className="rich-image" src={url} alt={alt} />;
}
