import type {
  AssetResponse,
  ChainAssetSnapshotResponse,
  DisclosurePreviewResponse,
  PersistedDisclosurePreviewRequest,
} from '@app/contracts';
import { api } from '@/lib/api';

export async function fetchAsset(assetId: string): Promise<AssetResponse> {
  const { data } = await api.get<AssetResponse>(`/assets/${assetId}`);
  return data;
}

export async function fetchCertificationSnapshot(
  assetId: string,
): Promise<ChainAssetSnapshotResponse> {
  const { data } = await api.get<ChainAssetSnapshotResponse>(
    `/assets/${assetId}/certification-chain`,
  );
  return data;
}

export async function previewDisclosure(
  assetId: string,
  request: PersistedDisclosurePreviewRequest,
): Promise<DisclosurePreviewResponse> {
  const { data } = await api.post<DisclosurePreviewResponse>(
    `/disclosure/${assetId}/preview`,
    request,
  );
  return data;
}
