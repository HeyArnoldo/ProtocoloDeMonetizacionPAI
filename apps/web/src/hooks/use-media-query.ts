import { useEffect, useState } from 'react';

/**
 * Suscripción a una media query del sistema.
 *
 * Existe porque hay decisiones de presentación que no se pueden expresar en
 * CSS: truncar un hash a menos caracteres cambia el **texto** que se renderiza,
 * no su estilo. Duplicar el nodo (uno corto y otro largo, alternados con
 * `hidden`) rompería los localizadores que buscan un único elemento por su
 * `title`, así que la decisión se toma en JavaScript y se renderiza una sola
 * vez.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);

    // Se sincroniza al montar además de suscribirse: entre el primer render y
    // el efecto la ventana puede haber cambiado de tamaño.
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/** Punto de corte `sm` de Tailwind. Por debajo, la pantalla es un teléfono. */
export const COMPACT_VIEWPORT_QUERY = '(max-width: 639.98px)';

/** `true` en pantallas de teléfono, donde el espacio horizontal es el recurso escaso. */
export function useCompactViewport(): boolean {
  return useMediaQuery(COMPACT_VIEWPORT_QUERY);
}
