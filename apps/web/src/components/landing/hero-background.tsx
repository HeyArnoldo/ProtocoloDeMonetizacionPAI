import { useEffect, useState } from 'react';
import { ImpactImage } from './impact-image';

const PHOTOS = ['/landing/b1.png', '/landing/b2.png', '/landing/b3.png', '/landing/b4.png'];
const INTERVAL_MS = 4000;
/** El crossfade tiene que ser bien más corto que el intervalo, o se pisa con el siguiente cambio. */
const FADE_MS = 1200;

/**
 * Fondo del Hero: rota entre 4 fotos reales con crossfade, no una sola fija.
 *
 * Las 4 capas están montadas siempre — nunca se desmonta una imagen para
 * montar la siguiente — así el crossfade es solo opacidad, sin parpadeo de
 * carga ni un frame en blanco entre una foto y la otra.
 *
 * `prefers-reduced-motion`: se queda en la primera foto, quieta, sin rotar.
 */
export function HeroBackground() {
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % PHOTOS.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  return (
    <div className="absolute inset-0 -z-10 size-full">
      {PHOTOS.map((src, i) => (
        <ImpactImage
          key={src}
          src={src}
          alt=""
          className="absolute inset-0 size-full transition-opacity ease-in-out"
          style={{
            transitionDuration: `${FADE_MS}ms`,
            opacity: i === index ? 0.4 : 0,
          }}
        />
      ))}
    </div>
  );
}
