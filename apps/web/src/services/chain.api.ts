import { chainStatusSchema, type ChainStatusResponse } from '@app/contracts';
import { api } from '@/lib/api';

interface HttpClient {
  get(path: string): Promise<{ data: unknown }>;
}

export function createChainStatusClient(http: HttpClient) {
  return {
    async fetch(): Promise<ChainStatusResponse> {
      const response = await http.get('/chain/status');
      const parsed = chainStatusSchema.safeParse(response.data);
      if (!parsed.success) throw new Error('La API devolvió un estado de cadena inválido.');
      return parsed.data;
    },
  };
}

export const chainStatusClient = createChainStatusClient(api);

/**
 * Cada cuánto se vuelve a preguntar. La API cachea 5s contra el RPC público,
 * así que bajar de eso solo gasta requests sin traer un bloque nuevo.
 */
export const CHAIN_STATUS_POLL_MS = 8_000;

export const chainStatusQuery = {
  queryKey: ['chain', 'status'] as const,
  queryFn: () => chainStatusClient.fetch(),
  refetchInterval: CHAIN_STATUS_POLL_MS,
};

/** Separador de miles en los números de bloque: 297262745 → 297 262 745. */
export function formatBlock(block: string): string {
  return block.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
