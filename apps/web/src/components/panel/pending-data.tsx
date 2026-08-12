import { cn } from '@/lib/utils';

export interface PendingDataProps {
  /** Qué dato falta, en los términos de la pantalla. */
  title: string;
  /** Por qué no está. Explica el estado real del sistema, no una excusa. */
  reason: string;
  /** Qué tiene que existir para que aparezca. */
  unblockedBy: string;
  className?: string;
}

/**
 * Hueco honesto en lugar de una cifra falsa.
 *
 * Regla del panel: **vacío con explicación es mejor que falso**. Las pantallas
 * de la maqueta muestran números del caso de referencia —nominal, hojas,
 * hashes, txs— que hoy no tienen ninguna fuente: no hay expediente registrado
 * ni RPC configurado. Portarlos como si fueran estado de la aplicación
 * convertiría una demo en una mentira, así que en su lugar va este bloque, que
 * dice qué falta, por qué, y qué lo desbloquea.
 *
 * Tampoco es un cargador: no hay nada cargando. Un spinner eterno afirma que
 * el dato viene en camino.
 */
export function PendingData({ title, reason, unblockedBy, className }: PendingDataProps) {
  return (
    <div
      role="note"
      aria-label={`Dato pendiente: ${title}`}
      className={cn(
        'border-ink-800 flex flex-col gap-1.5 rounded-md border border-dashed p-4',
        className,
      )}
    >
      <p className="text-muted-foreground text-[10px] uppercase tracking-[0.1em]">Dato pendiente</p>
      <p className="text-[13.5px]">{title}</p>
      <p className="text-muted-foreground text-[12.5px] leading-relaxed">{reason}</p>
      <p className="text-ink-400 mono text-[11px] leading-relaxed">
        Se desbloquea con {unblockedBy}
      </p>
    </div>
  );
}
