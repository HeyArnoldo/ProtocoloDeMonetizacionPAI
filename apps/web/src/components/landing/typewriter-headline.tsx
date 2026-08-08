import { useEffect, useRef, useState, type ReactNode } from 'react';

export type TypewriterToken = { text: string; className?: string } | { br: true };

export interface TypewriterHeadlineProps {
  tokens: TypewriterToken[];
  /** Cada cuánto se reescribe todo — el pedido explícito fue "cada 10 segundos". */
  loopMs?: number;
  /** Velocidad de tipeo, ms por carácter. */
  charMs?: number;
  className?: string;
}

const TOTAL_LENGTH = (tokens: TypewriterToken[]) =>
  tokens.reduce((sum, t) => sum + ('text' in t ? t.text.length : 0), 0);

/**
 * Título que se escribe solo al entrar y se reescribe cada `loopMs` — pedido
 * explícito: "que se vea viva la página desde el inicio".
 *
 * Con `prefers-reduced-motion` no tipea nada: muestra el texto final directo,
 * quieto. El cursor (`▌`) es puramente decorativo (`aria-hidden`) para que el
 * nombre accesible del `<h1>` sea siempre el texto final, nunca un estado a
 * mitad de tipeo — así los tests y los lectores de pantalla leen lo mismo
 * sin importar en qué momento del loop caigan.
 */
export function TypewriterHeadline({
  tokens,
  loopMs = 10_000,
  charMs = 28,
  className,
}: TypewriterHeadlineProps) {
  const total = useRef(TOTAL_LENGTH(tokens)).current;
  const [revealed, setRevealed] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(total);
      return;
    }

    let timeoutId = 0;
    let cancelled = false;

    function typeOnce(onDone: () => void) {
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i += 1;
        setRevealed(i);
        if (i < total) {
          timeoutId = window.setTimeout(tick, charMs);
        } else {
          onDone();
        }
      };
      tick();
    }

    function loop() {
      setRevealed(0);
      typeOnce(() => {
        timeoutId = window.setTimeout(loop, loopMs);
      });
    }

    loop();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [total, loopMs, charMs, reducedMotion]);

  const cursor = (
    <span
      key="cursor"
      aria-hidden="true"
      className="animate-blink text-brand-400 inline-block w-[0.5ch]"
    >
      ▌
    </span>
  );

  let consumed = 0;
  let cursorPlaced = false;
  const nodes: ReactNode[] = [];

  for (const [index, token] of tokens.entries()) {
    if ('br' in token) {
      // Los saltos de línea van siempre, tipeando o no: si solo aparecen
      // cuando la línea anterior ya se completó, el título arranca como una
      // sola línea y va creciendo a tres — la caja cambia de alto en cada
      // ciclo y todo lo de abajo salta. Con las tres líneas fijas desde el
      // primer render, el título solo se llena adentro; el layout de la
      // página nunca se mueve.
      nodes.push(<br key={index} />);
      continue;
    }
    const start = consumed;
    consumed += token.text.length;
    const slice = token.text.slice(0, Math.max(0, revealed - start));
    if (slice) {
      nodes.push(
        <span key={index} className={token.className}>
          {slice}
        </span>,
      );
    }
    // El cursor va justo donde va quedando el tipeo, no al final de todo el
    // bloque — si no, con las tres líneas ya reservadas parecería que
    // "salta" a la tercera línea (vacía) en vez de seguir la letra actual.
    if (!cursorPlaced && revealed <= consumed) {
      nodes.push(cursor);
      cursorPlaced = true;
    }
  }

  return <h1 className={className}>{nodes}</h1>;
}
