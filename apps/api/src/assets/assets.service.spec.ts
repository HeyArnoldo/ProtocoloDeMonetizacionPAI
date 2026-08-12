import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Repository } from 'typeorm';
import { CURRENCY_CODES, UserRole } from '@app/contracts';
import {
  AssetStatus,
  AttestationKind,
  type ChainPort,
  type RegisterAssetInput,
  type TxRef,
} from '../chain/chain.port';
import { Asset } from './asset.entity';
import { Receivable } from './receivable.entity';
import { AssetsService, type AssetRequester } from './assets.service';
import { Evidence } from '../evidence/evidence.entity';
import type { ChainIntentService } from '../chain/chain-intent.service';
import { ownerIdHash } from '../chain/owner-id';

const OWNER = ownerIdHash('user-1');
const CONTROLLER = `0x${'22'.repeat(20)}` as const;
const ASSET_ID = `0x${'55'.repeat(32)}` as const;
const ROOT = `0x${'44'.repeat(32)}` as const;

const pyme = (id: string): AssetRequester => ({ id, role: UserRole.PYME });
const admin = (id: string): AssetRequester => ({ id, role: UserRole.ADMIN });

describe('AssetsService', () => {
  // El listado se arma con un query builder porque tiene que salir en UNA sola
  // sentencia SQL (conteo y suma incluidos). El doble encadena y cuenta cuántas
  // veces se ejecuta, que es justamente lo que hay que poder afirmar.
  const getRawMany = jest.fn(async () => [] as unknown[]);
  const queryBuilder = {
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany,
  };
  const assetRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  } as unknown as jest.Mocked<Repository<Asset>>;
  const receivableRepository = {
    create: jest.fn((value) => value),
  } as unknown as jest.Mocked<Repository<Receivable>>;
  const evidenceRepository = {
    findBy: jest.fn(),
  } as unknown as jest.Mocked<Repository<Evidence>>;
  const chain: jest.Mocked<ChainPort> = {
    getNetworkStatus: jest.fn(),
    getCode: jest.fn(),
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

  describe('read authorization', () => {
    it('lets an ADMIN open an asset it did not create', async () => {
      const foreign = { ...draft(), createdById: 'pyme-9' } as Asset;
      assetRepository.findOne.mockResolvedValue(foreign);

      await expect(service().get(admin('admin-1'), ASSET_ID)).resolves.toMatchObject({
        id: ASSET_ID,
      });
      // El ADMIN busca por identificador y nada más: si el `where` siguiera
      // llevando `createdById`, la consulta no encontraría nada.
      expect(assetRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ASSET_ID } }),
      );
    });

    it("refuses another PYME's asset with a 404, never a 403", async () => {
      assetRepository.findOne.mockResolvedValue(null);

      const rejection = service().get(pyme('pyme-otra'), ASSET_ID);

      await expect(rejection).rejects.toBeInstanceOf(NotFoundException);
      // Un 403 confirmaría que el expediente existe. El aislamiento entre PYMEs
      // depende de que las dos respuestas sean indistinguibles.
      await expect(rejection).rejects.not.toBeInstanceOf(ForbiddenException);
      expect(assetRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ASSET_ID, createdById: 'pyme-otra' } }),
      );
    });

    it('lets a PYME open its own asset', async () => {
      assetRepository.findOne.mockResolvedValue(draft());

      await expect(service().get(pyme('user-1'), ASSET_ID)).resolves.toMatchObject({
        id: ASSET_ID,
      });
      expect(assetRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ASSET_ID, createdById: 'user-1' } }),
      );
    });
  });

  describe('list', () => {
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: ASSET_ID,
      createdById: 'user-1',
      createdAt: new Date('2026-08-10T12:00:00.000Z'),
      merkleRoot: ROOT,
      controller: CONTROLLER,
      registrationConfirmed: true,
      registrationTxHash: `0x${'33'.repeat(32)}`,
      registrationBlockNumber: '7',
      receivableCount: '2',
      totalAmountMinor: '1300000',
      ...overrides,
    });

    it('scopes a non-admin listing to its own assets in a single query', async () => {
      getRawMany.mockResolvedValue([row()]);

      const result = await service().list(pyme('user-1'));

      expect(queryBuilder.where).toHaveBeenCalledWith('asset.createdById = :createdById', {
        createdById: 'user-1',
      });
      expect(getRawMany).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: ASSET_ID,
        createdAt: '2026-08-10T12:00:00.000Z',
        receivableCount: 2,
        totalAmountMinor: '1300000',
        registrationBlockNumber: 7,
        ownedByRequester: true,
      });
    });

    it('lists every asset for an ADMIN and marks the ones it did not create', async () => {
      getRawMany.mockResolvedValue([row(), row({ id: `0x${'66'.repeat(32)}`, createdById: 'x' })]);

      const result = await service().list(admin('admin-1'));

      expect(queryBuilder.where).not.toHaveBeenCalled();
      expect(getRawMany).toHaveBeenCalledTimes(1);
      expect(result.map((item) => item.ownedByRequester)).toEqual([false, false]);
    });

    it('derives the registration state without asking the chain', async () => {
      getRawMany.mockResolvedValue([
        row({ registrationConfirmed: true }),
        row({ id: `0x${'66'.repeat(32)}`, registrationConfirmed: false }),
        row({
          id: `0x${'77'.repeat(32)}`,
          registrationConfirmed: false,
          registrationTxHash: null,
          registrationBlockNumber: null,
        }),
      ]);

      const result = await service().list(admin('admin-1'));

      expect(result.map((item) => item.registrationState)).toEqual([
        'registered',
        'submitted',
        'draft',
      ]);
      // La razón de ser del estado derivado: una lista de veinte expedientes no
      // puede costar veinte llamadas RPC.
      expect(chain.getAsset).not.toHaveBeenCalled();
      expect(chain.getAssetSnapshot).not.toHaveBeenCalled();
    });

    it('reports an asset with no receivables as an empty, not a missing, total', async () => {
      getRawMany.mockResolvedValue([row({ receivableCount: '0', totalAmountMinor: '0' })]);

      const result = await service().list(pyme('user-1'));

      expect(result[0]).toMatchObject({ receivableCount: 0, totalAmountMinor: '0' });
    });

    it('never leaks the private columns of the draft', async () => {
      getRawMany.mockResolvedValue([row()]);

      const result = await service().list(admin('admin-1'));

      expect(JSON.stringify(result)).not.toMatch(/debtorSalt|creationKey|createdById|ownerIdHash/);
    });
  });

  it('scopes reads to the authenticated owner', async () => {
    await expect(
      new AssetsService(
        assetRepository,
        receivableRepository,
        evidenceRepository,
        chain,
        intents,
      ).get(pyme('other-user'), `0x${'55'.repeat(32)}`),
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

    await service().registrationIntent(pyme('user-1'), ASSET_ID);

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

    await expect(service().confirmRegistration(pyme('user-1'), ASSET_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service().confirmRegistration(pyme('user-1'), ASSET_ID)).rejects.toBeInstanceOf(
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

    await expect(service().confirmRegistration(pyme('user-1'), ASSET_ID)).resolves.toMatchObject({
      registrationConfirmed: true,
    });
    await service().confirmRegistration(pyme('user-1'), ASSET_ID);

    expect(assetRepository.update).toHaveBeenCalledTimes(1);
    expect(chain.getAsset).toHaveBeenCalledTimes(1);
  });

  it('does not inspect chain state for another owner draft', async () => {
    assetRepository.findOne.mockResolvedValue(null);

    await expect(
      service().confirmRegistration(pyme('other-user'), ASSET_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(chain.getAsset).not.toHaveBeenCalled();
  });

  it('loads the owned draft before reading a chain snapshot', async () => {
    assetRepository.findOne.mockResolvedValue(null);

    await expect(service().chainSnapshot(pyme('other-user'), ASSET_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(chain.getAssetSnapshot).not.toHaveBeenCalled();
  });

  it('returns 404 when the owned draft is missing on-chain', async () => {
    assetRepository.findOne.mockResolvedValue(draft());
    chain.getAssetSnapshot.mockResolvedValue(null);

    await expect(service().chainSnapshot(pyme('user-1'), ASSET_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('serializes a complete snapshot without persisted private fields', async () => {
    assetRepository.findOne.mockResolvedValue(draft());
    chain.getAssetSnapshot.mockResolvedValue({
      network: 'arbitrum',
      chainId: 421614,
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

    const result = await service().chainSnapshot(pyme('user-1'), ASSET_ID);

    expect(result.blockNumber).toBe('999');
    expect(result.certificate).toMatchObject({ issuanceCount: '2' });
    expect(result.loan).toMatchObject({ value: { principal: '800000' } });
    expect(JSON.stringify(result)).not.toMatch(/receivables|debtorSalt|creationKey|createdById/);

    assetRepository.findOne.mockClear();
    expect(await service().certificationSnapshot(ASSET_ID)).toEqual(result);
    expect(assetRepository.findOne).not.toHaveBeenCalled();
  });
});
