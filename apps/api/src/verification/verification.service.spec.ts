import { verificationAssetIdSchema } from '@app/contracts';
import { NotFoundException } from '@nestjs/common';
import { AssetStatus, AttestationKind, type ChainPort } from '../chain/chain.port';
import type { ChainRuntimeConfig } from '../chain/chain.config';
import { VerificationService } from './verification.service';

const assetId = `0x${'11'.repeat(32)}` as const;
const controller = `0x${'22'.repeat(20)}` as const;
const chain = { getAssetSnapshot: jest.fn() } as unknown as jest.Mocked<ChainPort>;
const runtime = {
  explorerUrl: 'https://sepolia.arbiscan.io/',
  deployment: { addresses: { assetRegistry: `0x${'33'.repeat(20)}` } },
} as unknown as ChainRuntimeConfig;

describe('VerificationService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('serializes only public chain data and explorer metadata', async () => {
    chain.getAssetSnapshot.mockResolvedValue({
      network: 'arbitrum',
      chainId: 421614,
      blockNumber: 999n,
      asset: {
        assetId,
        merkleRoot: `0x${'44'.repeat(32)}`,
        ownerIdHash: `0x${'55'.repeat(32)}`,
        controller,
        registeredAt: new Date('2026-08-08T00:00:00.000Z'),
        status: AssetStatus.Attested,
        attestations: [
          {
            kind: AttestationKind.RevenueVerified,
            certifier: `0x${'66'.repeat(20)}`,
            certificateHash: `0x${'77'.repeat(32)}`,
            attestedAt: new Date('2026-08-08T00:01:00.000Z'),
            revokedAt: null,
          },
        ],
      },
      certificate: { supported: true, valid: true, owner: controller, issuanceCount: 2n },
      loan: { supported: true, value: null },
    });

    const result = await new VerificationService(chain, runtime).get(assetId);

    expect(result).toMatchObject({
      supported: true,
      chainId: 421614,
      safeBlock: '999',
      certificate: { valid: true, issuanceCount: '2' },
      explorer: { baseUrl: 'https://sepolia.arbiscan.io' },
    });
    expect(JSON.stringify(result)).not.toMatch(/loan|receivable|debtor|evidence|user|createdBy/);
  });

  it('returns 404 for an unknown chain asset', async () => {
    chain.getAssetSnapshot.mockResolvedValue(null);
    await expect(new VerificationService(chain, runtime).get(assetId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('marks in-memory verification unsupported instead of returning fake certificate data', async () => {
    chain.getAssetSnapshot.mockResolvedValue({
      network: 'in-memory',
      chainId: null,
      blockNumber: null,
      asset: {} as never,
      certificate: { supported: false },
      loan: { supported: false },
    });
    await expect(new VerificationService(chain, {}).get(assetId)).resolves.toEqual({
      supported: false,
      network: 'in-memory',
      chainId: null,
      safeBlock: null,
      explorer: null,
    });
  });

  it('rejects malformed public asset identifiers', () => {
    expect(verificationAssetIdSchema.safeParse('not-bytes32').success).toBe(false);
  });
});
