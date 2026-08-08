import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CardKicker, PanelCard } from './panel-card';

export interface CalloutCardProps {
  kicker: string;
  children: ReactNode;
  className?: string;
}

/**
 * Tarjeta con marca de acento a la izquierda.
 *
 * La barra se pinta como sombra interior (`inset 3px 0 0`) y no como borde
 * para que no altere la caja: el contenido conserva exactamente el mismo
 * padding que en el resto de tarjetas y la rejilla no se desalinea.
 */
export function CalloutCard({ kicker, children, className }: CalloutCardProps) {
  return (
    <PanelCard
      className={cn('gap-2', className)}
      style={{ boxShadow: 'inset 3px 0 0 var(--primary)' }}
    >
      <CardKicker>{kicker}</CardKicker>
      {children}
    </PanelCard>
  );
}
