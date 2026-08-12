import { useMutation, useQuery } from '@tanstack/react-query';
import type { PersistedDisclosurePreviewRequest } from '@app/contracts';
import {
  fetchAsset,
  fetchChainSnapshot,
  fetchCertificationSnapshot,
  previewDisclosure,
} from '@/services/disclosure.api';

export function useAssetPortfolio(assetId: string | null) {
  return useQuery({
    queryKey: ['assets', assetId],
    queryFn: () => fetchAsset(assetId!),
    enabled: assetId !== null,
  });
}

export function useChainSnapshot(assetId: string | null) {
  return useQuery({
    queryKey: ['asset-chain', assetId],
    queryFn: () => fetchChainSnapshot(assetId!),
    enabled: assetId !== null,
  });
}

export function useCertificationSnapshot(assetId: string | null) {
  return useQuery({
    queryKey: ['certification-chain', assetId],
    queryFn: () => fetchCertificationSnapshot(assetId!),
    enabled: assetId !== null,
  });
}

export function useDisclosurePreview() {
  return useMutation({
    mutationFn: ({
      assetId,
      request,
    }: {
      assetId: string;
      request: PersistedDisclosurePreviewRequest;
    }) => previewDisclosure(assetId, request),
  });
}
