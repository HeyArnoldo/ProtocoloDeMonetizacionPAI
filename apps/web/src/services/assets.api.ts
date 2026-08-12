import type { AssetResponse, CreateAssetInput } from '@app/contracts';
import { api } from '@/lib/api';
import { parseIntent, type TransactionIntent } from '@/services/transaction-intent';

interface AssetsHttpClient {
  post<T>(url: string, body: unknown): Promise<{ data: T }>;
  get<T>(url: string): Promise<{ data: T }>;
}

const BYTES32 = /^0x[0-9a-f]{64}$/;

/**
 * Guarda mínima sobre la respuesta: sin `id` no hay expediente con el que
 * seguir, y propagarlo a medias haría fallar el paso de la firma con un error
 * que ya no señala al origen.
 */
function parseAsset(value: unknown): AssetResponse {
  const asset = value as AssetResponse | null;
  if (!asset || typeof asset.id !== 'string' || !BYTES32.test(asset.id)) {
    throw new Error('La API devolvió un expediente inválido.');
  }
  return asset;
}

export function createAssetsClient(http: AssetsHttpClient = api) {
  return {
    async create(input: CreateAssetInput): Promise<AssetResponse> {
      return parseAsset((await http.post<unknown>('/assets', input)).data);
    },
    async fetch(assetId: string): Promise<AssetResponse> {
      return parseAsset((await http.get<unknown>(`/assets/${assetId}`)).data);
    },
    /**
     * El intent se pide sobre el expediente y no sobre `/chain/intents/register`:
     * el `merkleRoot` y el `assetId` salen de lo persistido, así que el
     * navegador no puede hacer firmar un root distinto del guardado.
     */
    async registrationIntent(assetId: string): Promise<TransactionIntent> {
      const { data } = await http.post<unknown>(`/assets/${assetId}/registration-intent`, {});
      return parseIntent(data);
    },
    async confirmRegistration(assetId: string): Promise<AssetResponse> {
      const { data } = await http.post<unknown>(`/assets/${assetId}/confirm-registration`, {});
      return parseAsset(data);
    },
  };
}

export const assetsClient = createAssetsClient();
