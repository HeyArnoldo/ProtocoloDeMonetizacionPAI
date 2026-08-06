import { useMutation, useQuery } from '@tanstack/react-query';
import type { DisclosurePreviewRequest } from '@app/contracts';
import { fetchSamplePortfolio, previewDisclosure } from '@/services/disclosure.api';

/**
 * La cartera de ejemplo se pide una sola vez por sesión: trae el salt del
 * expediente y ese salt tiene que ser estable, o el root cambiaría en cada
 * recarga y la demo perdería sentido.
 */
export function useSamplePortfolio() {
  return useQuery({
    queryKey: ['disclosure', 'sample'],
    queryFn: fetchSamplePortfolio,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useDisclosurePreview() {
  return useMutation({
    mutationFn: (request: DisclosurePreviewRequest) => previewDisclosure(request),
  });
}
