import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchEvidence, uploadEvidence } from '@/services/evidence.api';

export const evidenceQueryKey = ['evidence'] as const;

export function useEvidence(enabled = true) {
  return useQuery({ queryKey: evidenceQueryKey, queryFn: fetchEvidence, enabled });
}

export function useUploadEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadEvidence,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: evidenceQueryKey }),
  });
}
