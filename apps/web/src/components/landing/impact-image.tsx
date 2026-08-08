import type { CSSProperties } from 'react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface ImpactImageProps {
  /** Ruta bajo `public/landing/` — ver `public/landing/README.md`. */
  src: string;
  alt: string;
  className?: string;
  /** Para transiciones controladas desde el llamador (crossfade del Hero, por ejemplo). */
  style?: CSSProperties;
}

/**
 * Imagen con degradé de marca de respaldo.
 *
 * `public/landing/` empieza vacía a propósito (ver su README): nadie tiene
 * las fotos todavía el día del hackathon. En vez de un ícono de imagen rota
 * —o peor, un `<div>` en blanco que se ve a error de CSS—, si el archivo no
 * carga esto cae a un degradé de marca. Mismo patrón que describe
 * DESIGN_SYSTEM.md §3.2 para el carrusel de DondeSomos, en Nocturne.
 */
export function ImpactImage({ src, alt, className, style }: ImpactImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        style={style}
        className={cn('from-brand-800 via-background to-brand-900 bg-gradient-to-br', className)}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      style={style}
      className={cn('object-cover', className)}
    />
  );
}
