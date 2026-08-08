import { cn } from '@/lib/utils';

/**
 * La regla `.hr` de Nocturne: se desvanece a transparente en 48px por cada
 * extremo en lugar de cortarse en seco. Es una firma del sistema visual, así
 * que vive en un componente y no en una clase suelta repetida por cada
 * pantalla.
 *
 * `<hr>` es semánticamente correcto —separa temas dentro de la página— y ya
 * trae el rol `separator` sin necesidad de ARIA.
 */
export function SectionDivider({ className }: { className?: string }) {
  return (
    <hr
      className={cn('h-px border-0', className)}
      style={{
        background:
          'linear-gradient(to right, transparent, var(--nocturne-divider) 48px, var(--nocturne-divider) calc(100% - 48px), transparent)',
      }}
    />
  );
}
