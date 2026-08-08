import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  subtitle: string;
  /** Ranura para el tag de estado on-chain y cualquier acción de cabecera. */
  children?: ReactNode;
  className?: string;
}

/**
 * Cabecera de pantalla: título 17px + subtítulo 11.5px.
 *
 * El título es un `<h1>` real y no un `<span>` como en la maqueta. El tamaño
 * lo fija una clase, no el nivel del encabezado: la jerarquía del documento y
 * la escala tipográfica son dos cosas distintas y confundirlas deja al lector
 * de pantalla sin punto de entrada a la página.
 */
export function PageHeader({ title, subtitle, children, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-center gap-3.5', className)}>
      <div className="mr-auto flex min-w-0 flex-col gap-px">
        <h1 className="text-[17px] font-medium tracking-[-0.01em]">{title}</h1>
        <p className="text-muted-foreground text-[11.5px]">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
