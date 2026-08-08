import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CardKicker, PanelCard } from './panel-card';

export interface StatTileProps {
  kicker: string;
  value: ReactNode;
  note?: ReactNode;
  /**
   * Énfasis semántico, no color.
   *
   * La maqueta manda el color de cada cifra dentro de los datos (`fg`, `bg`).
   * Aquí la variante describe el papel del dato —`brand` es el número que el
   * prestamista recomputa— y el sistema decide el color. Así una cifra no
   * puede llegar con un color que no pertenezca a Nocturne.
   */
  emphasis?: 'default' | 'brand';
  /** Sin marco: para rejillas de cifras dentro de otra tarjeta. */
  bare?: boolean;
  className?: string;
  /**
   * Ajuste del cuerpo de la cifra. El handoff usa 25px para los KPIs de
   * portada y 22px dentro de un panel, y baja cuando el valor es una cadena
   * larga en vez de un número.
   */
  valueClassName?: string;
}

export function StatTile({
  kicker,
  value,
  note,
  emphasis = 'default',
  bare = false,
  className,
  valueClassName,
}: StatTileProps) {
  const body = (
    <>
      <CardKicker>{kicker}</CardKicker>
      <span
        className={cn(
          'mono text-[22px] leading-[1.1] tracking-[-0.02em] whitespace-nowrap',
          emphasis === 'brand' && 'text-brand-300',
          valueClassName,
        )}
      >
        {value}
      </span>
      {note ? <span className="text-muted-foreground text-[11.5px]">{note}</span> : null}
    </>
  );

  if (bare) {
    return <div className={cn('flex min-w-0 flex-col gap-1', className)}>{body}</div>;
  }

  return <PanelCard className={cn('gap-1.5', className)}>{body}</PanelCard>;
}
