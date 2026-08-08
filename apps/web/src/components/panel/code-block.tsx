import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CodeLine {
  /** Columna izquierda. Sin etiqueta, el valor ocupa el ancho completo. */
  label?: string;
  value: ReactNode;
  /** Comentarios y notas al pie del bloque. */
  muted?: boolean;
}

export interface CodeBlockProps {
  lines: CodeLine[];
  className?: string;
}

/**
 * Bloque monoespaciado sobre el fondo, radio 4px.
 *
 * La maqueta alinea las dos columnas rellenando con `&nbsp;`. Aquí la
 * alineación es una rejilla: los espacios duros se copian al portapapeles y
 * ensucian cualquier valor que alguien pegue en una consola.
 */
export function CodeBlock({ lines, className }: CodeBlockProps) {
  return (
    <div
      className={cn(
        'bg-background mono grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-sm p-2.5 text-[11.5px] leading-[1.7]',
        className,
      )}
    >
      {lines.map((line, index) => (
        // El índice es la clave correcta: las líneas son posicionales y no
        // tienen identidad propia; dos líneas pueden repetir texto.
        <div
          key={index}
          className={cn(
            'col-span-2 grid grid-cols-subgrid',
            line.muted && 'text-muted-foreground',
            !line.muted && 'text-ink-400',
          )}
        >
          <span>{line.label ?? ''}</span>
          <span className="break-all">{line.value}</span>
        </div>
      ))}
    </div>
  );
}
