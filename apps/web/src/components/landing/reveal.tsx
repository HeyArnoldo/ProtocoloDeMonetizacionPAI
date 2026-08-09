import type { ReactNode } from 'react';
import { useReveal } from '@/hooks/use-reveal';
import { cn } from '@/lib/utils';

export interface RevealProps {
  children: ReactNode;
  /** Escalona varias `Reveal` hermanas — ver DESIGN_SYSTEM.md §8 (stagger). */
  delayMs?: number;
  className?: string;
}

/**
 * Entrada al hacer scroll: opacidad + traslado vertical.
 *
 * Usa `useReveal` (IntersectionObserver + red de seguridad — ver ese
 * archivo) en vez de una animación que corre una sola vez al montar: el
 * pedido fue explícito — "que se vea también la animación" al bajar por la
 * página, no solo al cargarla. `motion-reduce:*` apaga la animación para
 * quien pidió menos movimiento, sin ocultar el contenido.
 */
export function Reveal({ children, delayMs = 0, className }: RevealProps) {
  const { ref, visible } = useReveal<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-[850ms] ease-out motion-reduce:transition-none',
        visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-12 scale-[0.97] opacity-0',
        className,
      )}
      style={{ transitionDelay: visible ? `${delayMs}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}
