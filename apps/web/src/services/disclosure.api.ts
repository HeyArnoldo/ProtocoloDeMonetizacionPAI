import { assetListSchema } from '@app/contracts';
import type {
  AssetListResponse,
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

/**
 * Listado de expedientes visibles para quien pregunta.
 *
 * Se valida con el schema en vez de castear: es la **fuente de verdad** de qué
 * expedientes existen —`sessionStorage` solo recuerda el último abierto—, así
 * que una respuesta a medias tiene que fallar aquí y no pintar una lista corta
 * que se leería como «se me borraron expedientes».
 */
export async function fetchAssetList(): Promise<AssetListResponse> {
  const { data } = await api.get<unknown>('/assets');
  return assetListSchema.parse(data);
}

export async function fetchCertificationSnapshot(
  assetId: string,
): Promise<ChainAssetSnapshotResponse> {
  const { data } = await api.get<ChainAssetSnapshotResponse>(
    `/assets/${assetId}/certification-chain`,
  );
  return data;
}

export async function fetchChainSnapshot(assetId: string): Promise<ChainAssetSnapshotResponse> {
  const { data } = await api.get<ChainAssetSnapshotResponse>(`/assets/${assetId}/chain`);
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
