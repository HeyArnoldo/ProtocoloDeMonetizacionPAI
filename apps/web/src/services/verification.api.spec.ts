import { describe, expect, it, vi } from 'vitest';
import { createPublicVerificationClient, validateVerificationAssetId } from './verification.api';

const assetId = `0x${'ab'.repeat(32)}`;
const unsupported = {
  supported: false,
  network: 'in-memory',
  chainId: null,
  safeBlock: null,
  explorer: null,
} as const;

describe('public verification client', () => {
  it('accepts only lowercase bytes32 asset identifiers', () => {
    expect(validateVerificationAssetId(assetId)).toBeNull();
    expect(validateVerificationAssetId(assetId.toUpperCase())).toMatch(/bytes32.*minúsculas/);
    expect(validateVerificationAssetId('not-a-hash')).toMatch(/bytes32.*minúsculas/);
  });

  it('reads and validates the anonymous verification response', async () => {
    const get = vi.fn().mockResolvedValue({ data: unsupported });
    const client = createPublicVerificationClient({ get });

    await expect(client.fetch(assetId)).resolves.toEqual(unsupported);
    expect(get).toHaveBeenCalledWith(`/verification/assets/${assetId}`);
  });

  it('rejects malformed API data', async () => {
    const client = createPublicVerificationClient({
      get: vi.fn().mockResolvedValue({ data: { supported: true, chainId: 'wrong' } }),
    });

    await expect(client.fetch(assetId)).rejects.toThrow('verificación inválida');
  });
});
