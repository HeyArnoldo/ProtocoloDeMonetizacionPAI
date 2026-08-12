import { useMutation, useQuery } from '@tanstack/react-query';
import type { PersistedDisclosurePreviewRequest } from '@app/contracts';
import {
  fetchAsset,
  fetchAssetList,
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

/**
 * Listado de expedientes visibles.
 *
 * **Por qué `['assets', 'list']` no colisiona con `['assets', assetId]`.** El
 * segundo tramo de la clave del expediente es siempre un bytes32 —`0x` y 64
 * dígitos hexadecimales, validado por `bytes32Schema` antes de llegar aquí—, y
 * `'list'` no puede serlo. Comparten prefijo a propósito: invalidar `['assets']`
 * refresca el listado y las fichas a la vez.
 */
export function useAssetList() {
  return useQuery({
    queryKey: ['assets', 'list'],
    queryFn: fetchAssetList,
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
