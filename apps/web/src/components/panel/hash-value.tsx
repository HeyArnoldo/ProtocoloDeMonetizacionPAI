import { cn } from '@/lib/utils';

export interface HashValueProps {
  /** Valor completo. Siempre viaja íntegro en `title` para poder copiarlo. */
  value: string;
  /** Caracteres visibles al inicio, contando el prefijo `0x`. */
  leading?: number;
  /** Caracteres visibles al final. */
  trailing?: number;
  /**
   * Enlace al explorador de bloques.
   *
   * Todavía sin uso: no hay contratos desplegados ni red configurada, así que
   * ninguna pantalla puede construir una URL de Arbiscan que resuelva. La
   * prop existe para que la fase de integración con la cadena solo tenga que
   * pasarla.
   */
  href?: string;
  className?: string;
}

/** Elipsis tipográfica: la maqueta alterna `…` y `...`; aquí siempre `…`. */
const ELLIPSIS = '…';

function truncateHex(value: string, leading = 10, trailing = 8): string {
  if (value.length <= leading + trailing + ELLIPSIS.length) return value;
  return `${value.slice(0, leading)}${ELLIPSIS}${value.slice(-trailing)}`;
}

/**
 * Hash o dirección truncados.
 *
 * El valor completo va en `title` porque el truncado es una decisión de
 * presentación: quien audita necesita el hash entero sin salir de la pantalla.
 */
export function HashValue({ value, leading, trailing, href, className }: HashValueProps) {
  const text = truncateHex(value, leading, trailing);
  const classes = cn('mono text-[11.5px] break-all', className);

  if (href) {
    return (
      <a
        className={cn(classes, 'text-brand-300 underline-offset-4 hover:underline')}
        href={href}
        title={value}
        rel="noreferrer noopener"
        target="_blank"
      >
        {text}
      </a>
    );
  }

  return (
    <span className={classes} title={value}>
      {text}
    </span>
  );
}
