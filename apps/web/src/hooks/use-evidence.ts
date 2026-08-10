import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchEvidence, uploadEvidence } from '@/services/evidence.api';

export const evidenceQueryKey = ['evidence'] as const;

export function useEvidence() {
  return useQuery({ queryKey: evidenceQueryKey, queryFn: fetchEvidence });
}

export function useUploadEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadEvidence,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: evidenceQueryKey }),
  });
}
