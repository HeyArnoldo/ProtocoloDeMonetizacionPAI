import type { ComponentProps, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Superficie base del panel: el `.card .elev-sm` de Nocturne.
 *
 * Se apoya en el primitivo `Card` de shadcn en lugar de un `div` suelto para
 * conservar `data-slot="card"`, que es el contrato estable sobre el que los
 * tests de sistema visual comprueban los tokens. Solo se ajustan las medidas:
 * radio de 8px (`--radius-md` de Nocturne) y el padding de 16px del handoff,
 * frente a los 24px y `rounded-xl` que trae shadcn por defecto.
 */
export function PanelCard({ className, ...props }: ComponentProps<'div'>) {
  return <Card className={cn('gap-2.5 rounded-md p-4', className)} {...props} />;
}

/**
 * Etiqueta de 10px en mayúsculas que encabeza cada tarjeta (`.card-kicker`).
 *
 * Es deliberadamente un `<p>` y no un `<h6>`: en la maqueta estos rótulos son
 * encabezados de nivel 6 usados como decoración, lo que invierte la jerarquía
 * del documento frente al título de la pantalla.
 */
export function CardKicker({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn('text-primary text-[10px] uppercase tracking-[0.1em]', className)}>
      {children}
    </p>
  );
}

/** Párrafo de cuerpo de tarjeta (`.card-body`): 13px, contraste rebajado. */
export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn('text-[13px] leading-relaxed opacity-80', className)}>{children}</p>;
}
