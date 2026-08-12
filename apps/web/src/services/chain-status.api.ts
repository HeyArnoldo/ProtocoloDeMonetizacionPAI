import { chainStatusSchema, type ChainStatusResponse } from '@app/contracts';
import { api } from '@/lib/api';

interface ChainStatusHttpClient {
  get(path: string): Promise<{ data: unknown }>;
}

export function createChainStatusClient(http: ChainStatusHttpClient) {
  return {
    async fetch(): Promise<ChainStatusResponse> {
      return chainStatusSchema.parse((await http.get('/chain/status')).data);
    },
  };
}

export const fetchChainStatus = () => createChainStatusClient(api).fetch();
