import { useQuery } from '@tanstack/react-query';
import { fetchChainStatus } from '@/services/chain-status.api';

export function useChainStatus() {
  return useQuery({
    queryKey: ['chain-status'],
    queryFn: fetchChainStatus,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
