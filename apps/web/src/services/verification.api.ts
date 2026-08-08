import { publicVerificationSchema, type PublicVerificationResponse } from '@app/contracts';
import { api } from '@/lib/api';

interface HttpClient {
  get(path: string): Promise<{ data: unknown }>;
}

export function validateVerificationAssetId(value: string): string | null {
  return /^0x[0-9a-f]{64}$/.test(value)
    ? null
    : 'Ingresa un asset ID bytes32 hexadecimal en minúsculas.';
}

export function createPublicVerificationClient(http: HttpClient) {
  return {
    async fetch(assetId: string): Promise<PublicVerificationResponse> {
      const response = await http.get(`/verification/assets/${assetId}`);
      const parsed = publicVerificationSchema.safeParse(response.data);
      if (!parsed.success) throw new Error('La API devolvió una verificación inválida.');
      return parsed.data;
    },
  };
}

export const publicVerificationClient = createPublicVerificationClient(api);
