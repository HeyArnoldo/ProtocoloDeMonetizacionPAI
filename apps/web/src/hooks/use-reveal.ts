import { useEffect, useRef, useState } from 'react';

/** Ver `Reveal` — nunca deja un elemento invisible para siempre, pase lo que pase. */
const SAFETY_TIMEOUT_MS = 1800;

/**
 * Revela un elemento la primera vez que entra al viewport — o, como mucho,
 * `SAFETY_TIMEOUT_MS` después de montarse, lo que ocurra primero.
 *
 * La red de seguridad existe por una razón concreta: la primera versión de
 * este hook (sin ella) dejó secciones enteras en `opacity: 0` para siempre en
 * la captura de `panel-routes.spec.ts` — Chromium redimensiona el viewport
 * para una captura de página completa y el observer no siempre alcanza a
 * disparar antes. Con el timeout, en el peor caso el contenido aparece un
 * poco tarde; nunca se queda invisible.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      setVisible(true);
    };

    const safety = window.setTimeout(reveal, SAFETY_TIMEOUT_MS);

    if (typeof IntersectionObserver === 'undefined') {
      reveal();
      return () => window.clearTimeout(safety);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        // Para contenido que ya está en el viewport al montar (todo el
        // Hero, por ejemplo), el observer puede disparar en el mismo frame
        // en que se pintó por primera vez el estado oculto — sin un frame
        // pintado de por medio no hay transición que ver, el elemento
        // aparece directamente en su posición final. El doble
        // `requestAnimationFrame` garantiza que el navegador ya pintó el
        // estado inicial antes de pedirle que anime hacia el visible.
        requestAnimationFrame(() => requestAnimationFrame(reveal));
      },
      // threshold 0 + sin achicar el root: dispara apenas asoma el primer
      // píxel, para que la transición se vea mientras la sección entra —
      // con un margen negativo grande, terminaba de revelarse antes de que
      // el usuario llegara a mirarla.
      { threshold: 0, rootMargin: '0px' },
    );

    observer.observe(node);
    return () => {
      window.clearTimeout(safety);
      observer.disconnect();
    };
  }, []);

  return { ref, visible };
}
