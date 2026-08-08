import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  subtitle: string;
  /** Ranura para el tag de estado on-chain y cualquier acción de cabecera. */
  children?: ReactNode;
  className?: string;
  /**
   * Ajuste del subtítulo.
   *
   * El shell del panel lo oculta por debajo de `sm`: ahí el título ya ocupa la
   * línea entera y el contexto que aporta está en la navegación. La pantalla
   * pública lo conserva siempre, porque es lo único que explica qué se está
   * mirando a quien llega desde un enlace.
   */
  subtitleClassName?: string;
}

/**
 * Cabecera de pantalla: título 17px + subtítulo 11.5px.
 *
 * El título es un `<h1>` real y no un `<span>` como en la maqueta. El tamaño
 * lo fija una clase, no el nivel del encabezado: la jerarquía del documento y
 * la escala tipográfica son dos cosas distintas y confundirlas deja al lector
 * de pantalla sin punto de entrada a la página.
 */
export function PageHeader({
  title,
  subtitle,
  children,
  className,
  subtitleClassName,
}: PageHeaderProps) {
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-2', className)}>
      <div className="mr-auto flex min-w-0 flex-col gap-px">
        <h1 className="text-[15.5px] font-medium tracking-[-0.01em] sm:text-[17px]">{title}</h1>
        <p className={cn('text-muted-foreground text-[11.5px]', subtitleClassName)}>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
