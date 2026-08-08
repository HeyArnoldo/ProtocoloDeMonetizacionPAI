import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { CURRENCY_CODES } from '@app/contracts';
import {
  AssetStatus,
  AttestationKind,
  type ChainPort,
  type RegisterAssetInput,
  type TxRef,
} from '../chain/chain.port';
import { Asset } from './asset.entity';
import { Receivable } from './receivable.entity';
import { AssetsService } from './assets.service';
import { Evidence } from '../evidence/evidence.entity';
import type { ChainIntentService } from '../chain/chain-intent.service';
import { ownerIdHash } from '../chain/owner-id';

const OWNER = ownerIdHash('user-1');
const CONTROLLER = `0x${'22'.repeat(20)}` as const;
const ASSET_ID = `0x${'55'.repeat(32)}` as const;
const ROOT = `0x${'44'.repeat(32)}` as const;

describe('AssetsService', () => {
  const assetRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    findOne: jest.fn(),
    update: jest.fn(),
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
    getAssetSnapshot: jest.fn(),
    computeBorrowingBase: jest.fn(),
  };
  const intents = {
    build: jest.fn(() => ({ chainId: 421614, to: CONTROLLER, data: '0x12', value: '0' })),
  } as unknown as jest.Mocked<ChainIntentService>;
  const service = () =>
    new AssetsService(assetRepository, receivableRepository, evidenceRepository, chain, intents);
  const draft = (): Asset =>
    ({
      id: ASSET_ID,
      createdById: 'user-1',
      creationKey: `0x${'33'.repeat(32)}`,
      ownerIdHash: OWNER,
      controller: CONTROLLER,
      debtorSalt: `0x${'66'.repeat(32)}`,
      merkleRoot: ROOT,
      registrationConfirmed: false,
      registrationTxHash: null,
      registrationBlockNumber: null,
      receivables: [],
      createdAt: new Date(0),
    }) as Asset;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CHAIN_ADAPTER = 'in-memory';
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
      intents,
    );

    const asset = await service.create('user-1', {
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
      intents,
    );

    await expect(
      service.create('user-1', {
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
      intents,
    );
    const input = {
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
      new AssetsService(
        assetRepository,
        receivableRepository,
        evidenceRepository,
        chain,
        intents,
      ).get('other-user', `0x${'55'.repeat(32)}`),
    ).rejects.toThrow('was not found');
    expect(assetRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: `0x${'55'.repeat(32)}`, createdById: 'other-user' },
      }),
    );
  });

  it('persists a real-chain draft without asking the backend to sign', async () => {
    process.env.CHAIN_ADAPTER = 'arbitrum';

    const result = await service().create('user-1', {
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

    expect(result.ownerIdHash).toBe(OWNER);
    expect(result.registrationConfirmed).toBe(false);
    expect(chain.registerAsset).not.toHaveBeenCalled();
    expect(assetRepository.save).toHaveBeenCalledTimes(1);
  });

  it('builds registration calldata only from the owner-scoped persisted draft', async () => {
    assetRepository.findOne.mockResolvedValue(draft());

    await service().registrationIntent('user-1', ASSET_ID);

    expect(intents.build).toHaveBeenCalledWith('register', 'user-1', {
      assetId: ASSET_ID,
      merkleRoot: ROOT,
    });
  });

  it('rejects missing and mismatched on-chain registrations', async () => {
    assetRepository.findOne.mockResolvedValue(draft());
    chain.getAsset.mockResolvedValueOnce(null).mockResolvedValueOnce({
      assetId: ASSET_ID,
      merkleRoot: ROOT,
      ownerIdHash: OWNER,
      controller: `0x${'99'.repeat(20)}`,
      registeredAt: new Date(),
      status: AssetStatus.Registered,
      attestations: [],
    });

    await expect(service().confirmRegistration('user-1', ASSET_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service().confirmRegistration('user-1', ASSET_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(assetRepository.update).not.toHaveBeenCalled();
  });

  it('confirms atomically and is idempotent', async () => {
    const asset = draft();
    assetRepository.findOne.mockResolvedValue(asset);
    chain.getAsset.mockResolvedValue({
      assetId: ASSET_ID,
      merkleRoot: asset.merkleRoot as never,
      ownerIdHash: OWNER,
      controller: CONTROLLER,
      registeredAt: new Date(),
      status: AssetStatus.Registered,
      attestations: [],
    });

    await expect(service().confirmRegistration('user-1', ASSET_ID)).resolves.toMatchObject({
      registrationConfirmed: true,
    });
    await service().confirmRegistration('user-1', ASSET_ID);

    expect(assetRepository.update).toHaveBeenCalledTimes(1);
    expect(chain.getAsset).toHaveBeenCalledTimes(1);
  });

  it('does not inspect chain state for another owner draft', async () => {
    assetRepository.findOne.mockResolvedValue(null);

    await expect(service().confirmRegistration('other-user', ASSET_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(chain.getAsset).not.toHaveBeenCalled();
  });

  it('loads the owned draft before reading a chain snapshot', async () => {
    assetRepository.findOne.mockResolvedValue(null);

    await expect(service().chainSnapshot('other-user', ASSET_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(chain.getAssetSnapshot).not.toHaveBeenCalled();
  });

  it('returns 404 when the owned draft is missing on-chain', async () => {
    assetRepository.findOne.mockResolvedValue(draft());
    chain.getAssetSnapshot.mockResolvedValue(null);

    await expect(service().chainSnapshot('user-1', ASSET_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('serializes a complete snapshot without persisted private fields', async () => {
    assetRepository.findOne.mockResolvedValue(draft());
    chain.getAssetSnapshot.mockResolvedValue({
      blockNumber: 999n,
      asset: {
        assetId: ASSET_ID,
        merkleRoot: ROOT,
        ownerIdHash: OWNER,
        controller: CONTROLLER,
        registeredAt: new Date('2026-08-08T00:00:00.000Z'),
        status: AssetStatus.Funded,
        attestations: [
          {
            kind: AttestationKind.RevenueVerified,
            certifier: `0x${'77'.repeat(20)}`,
            certificateHash: `0x${'88'.repeat(32)}`,
            attestedAt: new Date('2026-08-08T00:01:00.000Z'),
            revokedAt: null,
          },
        ],
      },
      certificate: { supported: true, valid: true, owner: CONTROLLER, issuanceCount: 2n },
      loan: {
        supported: true,
        value: {
          borrower: CONTROLLER,
          lender: `0x${'99'.repeat(20)}`,
          principal: 800000n,
          dueAt: new Date('2026-12-01T00:00:00.000Z'),
          state: 'Funded',
        },
      },
    });

    const result = await service().chainSnapshot('user-1', ASSET_ID);

    expect(result.blockNumber).toBe('999');
    expect(result.certificate).toMatchObject({ issuanceCount: '2' });
    expect(result.loan).toMatchObject({ value: { principal: '800000' } });
    expect(JSON.stringify(result)).not.toMatch(/receivables|debtorSalt|creationKey|createdById/);

    assetRepository.findOne.mockClear();
    expect(await service().certificationSnapshot(ASSET_ID)).toEqual(result);
    expect(assetRepository.findOne).not.toHaveBeenCalled();
  });
});
