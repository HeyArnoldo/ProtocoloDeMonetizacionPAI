import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { chainStatusQuery, formatBlock } from '@/services/chain.api';

/**
 * Insignia global: ¿está la API leyendo Arbitrum en este momento?
 *
 * Comparte `queryKey` con `NetworkStatus`, así que TanStack Query reutiliza la
 * misma respuesta: dos superficies, un solo poll.
 */
export function ChainBadge() {
  const { data, isError } = useQuery(chainStatusQuery);

  if (isError) return <Chip label="cadena sin consultar" />;
  if (!data) return <Chip label="consultando cadena…" />;
  if (data.status === 'offline') return <Chip label="sin cadena · in-memory" />;
  if (data.status === 'unreachable') {
    return <Chip label={`arbitrum ${data.chainId} · RPC caído`} tone="destructive" />;
  }

  return (
    <Chip
      label={`arbitrum ${data.chainId} · #${formatBlock(data.safeBlock)}`}
      tone="live"
      title={`Bloque seguro ${data.safeBlock} · cabeza ${data.headBlock}`}
    />
  );
}

function Chip({
  label,
  title,
  tone = 'muted',
}: {
  label: string;
  title?: string;
  tone?: 'muted' | 'live' | 'destructive';
}) {
  const dot =
    tone === 'live'
      ? 'bg-primary animate-blink'
      : tone === 'destructive'
        ? 'bg-destructive'
        : 'bg-ink-700';

  return (
    <Badge
      variant="outline"
      title={title}
      className="mono hidden items-center gap-1.5 text-[10px] font-normal lg:inline-flex"
    >
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </Badge>
  );
}
