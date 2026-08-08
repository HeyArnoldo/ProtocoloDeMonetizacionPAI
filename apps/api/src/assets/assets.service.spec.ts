import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { CURRENCY_CODES } from '@app/contracts';
import type { ChainPort, RegisterAssetInput, TxRef } from '../chain/chain.port';
import { Asset } from './asset.entity';
import { Receivable } from './receivable.entity';
import { AssetsService } from './assets.service';
import { Evidence } from '../evidence/evidence.entity';

const OWNER = `0x${'11'.repeat(32)}` as const;
const CONTROLLER = `0x${'22'.repeat(20)}` as const;

describe('AssetsService', () => {
  const assetRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    findOne: jest.fn(),
  } as unknown as jest.Mocked<Repository<Asset>>;
  const receivableRepository = {
    create: jest.fn((value) => value),
  } as unknown as jest.Mocked<Repository<Receivable>>;
  const evidenceRepository = {
    findBy: jest.fn(),
  } as unknown as jest.Mocked<Repository<Evidence>>;
  const chain: jest.Mocked<ChainPort> = {
    registerAsset: jest.fn(
      async (_input: RegisterAssetInput): Promise<TxRef> => ({
        hash: `0x${'33'.repeat(32)}`,
        blockNumber: 7,
      }),
    ),
    attest: jest.fn(),
    revokeAttestation: jest.fn(),
    getAsset: jest.fn(),
    computeBorrowingBase: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    assetRepository.findOne.mockResolvedValue(null);
    chain.getAsset.mockResolvedValue(null);
    evidenceRepository.findBy.mockResolvedValue([
      {
        id: '7fb79494-272c-4be1-8204-885c0bba3528',
        sha256: `0x${'aa'.repeat(32)}`,
      } as Evidence,
    ]);
  });

  it('builds and persists the canonical Merkle root before registering through ChainPort', async () => {
    const service = new AssetsService(
      assetRepository,
      receivableRepository,
      evidenceRepository,
      chain,
    );

    const asset = await service.create('user-1', {
      ownerIdHash: OWNER,
      controller: CONTROLLER,
      receivables: [
        {
          evidenceId: '7fb79494-272c-4be1-8204-885c0bba3528',
          debtorTaxId: '20512345678',
          debtorLabel: 'Customer SAC',
          amountMinor: '800000',
          dueDate: '2026-10-15',
          currency: CURRENCY_CODES.USD,
        },
      ],
    });

    expect(asset.merkleRoot).toMatch(/^0x[0-9a-f]{64}$/);
    expect(evidenceRepository.findBy).toHaveBeenCalledWith({
      id: expect.anything(),
      createdById: 'user-1',
    });
    const persisted = assetRepository.save.mock.calls[0]![0];
    expect(persisted.debtorSalt).toMatch(/^0x[0-9a-f]{64}$/);
    expect(chain.registerAsset).toHaveBeenCalledWith({
      assetId: asset.id,
      merkleRoot: asset.merkleRoot,
      ownerIdHash: OWNER,
      controller: CONTROLLER,
    });
    expect(asset.receivables[0]).toEqual(
      expect.objectContaining({ amountMinor: '800000', docHash: `0x${'aa'.repeat(32)}` }),
    );
    expect(assetRepository.save).toHaveBeenCalledTimes(2);
  });

  it('rejects missing evidence before touching the chain', async () => {
    evidenceRepository.findBy.mockResolvedValue([]);
    const service = new AssetsService(
      assetRepository,
      receivableRepository,
      evidenceRepository,
      chain,
    );

    await expect(
      service.create('user-1', {
        ownerIdHash: OWNER,
        controller: CONTROLLER,
        receivables: [
          {
            evidenceId: '7fb79494-272c-4be1-8204-885c0bba3528',
            debtorTaxId: '20512345678',
            debtorLabel: 'Customer SAC',
            amountMinor: '800000',
            dueDate: '2026-10-15',
            currency: CURRENCY_CODES.USD,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(chain.registerAsset).not.toHaveBeenCalled();
  });

  it('recovers registration without inventing a transaction hash after the final save crashes', async () => {
    let persisted: Asset | null = null;
    assetRepository.save
      .mockImplementationOnce(async (asset) => {
        persisted = { ...asset, registrationTxHash: null } as Asset;
        return asset as Asset;
      })
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockImplementationOnce(async (asset) => asset as Asset);
    assetRepository.findOne.mockImplementation(async () => persisted);
    chain.getAsset
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ assetId: `0x${'55'.repeat(32)}` } as never);
    const service = new AssetsService(
      assetRepository,
      receivableRepository,
      evidenceRepository,
      chain,
    );
    const input = {
      ownerIdHash: OWNER,
      controller: CONTROLLER,
      receivables: [
        {
          evidenceId: '7fb79494-272c-4be1-8204-885c0bba3528',
          debtorTaxId: '20512345678',
          debtorLabel: 'Customer SAC',
          amountMinor: '800000',
          dueDate: '2026-10-15',
          currency: CURRENCY_CODES.USD,
        },
      ],
    };

    await expect(service.create('user-1', input)).rejects.toThrow('database unavailable');
    const recovered = await service.create('user-1', input);

    expect(recovered.id).toBe(persisted!.id);
    expect(recovered.registrationConfirmed).toBe(true);
    expect(recovered.registrationTxHash).toBeNull();
    expect(assetRepository.create).toHaveBeenCalledTimes(1);
    expect(chain.registerAsset).toHaveBeenCalledTimes(1);
  });

  it('scopes reads to the authenticated owner', async () => {
    await expect(
      new AssetsService(assetRepository, receivableRepository, evidenceRepository, chain).get(
        'other-user',
        `0x${'55'.repeat(32)}`,
      ),
    ).rejects.toThrow('was not found');
    expect(assetRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: `0x${'55'.repeat(32)}`, createdById: 'other-user' },
      }),
    );
  });
});
