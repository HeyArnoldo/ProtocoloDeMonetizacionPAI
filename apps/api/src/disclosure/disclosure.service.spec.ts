import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { CURRENCY_CODES } from '@app/contracts';
import { buildTree, hashDebtor, toDueDate, type Hex } from '@app/merkle';
import { Asset } from '../assets/asset.entity';
import { AssetStatus, type ChainPort, type OnChainAsset } from '../chain/chain.port';
import { DisclosureService } from './disclosure.service';

const ASSET_ID = `0x${'01'.repeat(32)}`;
const SALT = `0x${'0f'.repeat(32)}` as const;

describe('DisclosureService', () => {
  const repository = { findOne: jest.fn() } as unknown as jest.Mocked<Repository<Asset>>;
  const chain = {
    getAsset: jest.fn(),
  } as unknown as jest.Mocked<ChainPort>;

  beforeEach(() => {
    jest.clearAllMocks();
    const receivables = Array.from({ length: 4 }, (_, index) => ({
      position: index,
      debtorTaxId: `2051234560${index}`,
      debtorLabel: `Customer ${index}`,
      amountMinor: String(500_000 + index),
      dueDate: '2026-10-15',
      currency: index % 2 === 0 ? CURRENCY_CODES.USD : CURRENCY_CODES.PEN,
      docHash: `0x${(index + 1).toString(16).padStart(64, '0')}`,
    }));
    const merkleRoot = buildTree(
      receivables.map((item) => ({
        debtorHash: hashDebtor(item.debtorTaxId, SALT),
        amountMinor: BigInt(item.amountMinor),
        dueDate: toDueDate(item.dueDate),
        currency: item.currency,
        docHash: item.docHash as Hex,
      })),
    ).root;
    const asset = {
      id: ASSET_ID,
      debtorSalt: SALT,
      merkleRoot,
      receivables,
    } as Asset;
    repository.findOne.mockResolvedValue(asset);
    chain.getAsset.mockResolvedValue({
      assetId: ASSET_ID,
      merkleRoot,
      ownerIdHash: `0x${'02'.repeat(32)}`,
      controller: `0x${'03'.repeat(20)}`,
      registeredAt: new Date(0),
      status: AssetStatus.Registered,
      attestations: [],
    } as OnChainAsset);
  });

  it('builds a verified disclosure from the persisted asset, not request-supplied leaves', async () => {
    const service = new DisclosureService(repository, chain);

    const result = await service.preview('user-1', ASSET_ID, { disclosedIndices: [0, 1] });

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: ASSET_ID, createdById: 'user-1' },
      relations: { receivables: true },
      order: { receivables: { position: 'ASC' } },
    });
    expect(result.verified).toBe(true);
    expect(result.disclosedCount).toBe(2);
    expect(result.disclosedNominalByCurrency).toEqual([
      { currency: CURRENCY_CODES.USD, amountMinor: '500000' },
      { currency: CURRENCY_CODES.PEN, amountMinor: '500001' },
    ]);
    expect(JSON.stringify(result)).not.toContain('20512345600');
  });

  it('uses the on-chain Merkle root when Postgres disagrees', async () => {
    const persisted = await repository.findOne({ where: { id: ASSET_ID } });
    repository.findOne.mockResolvedValue({
      ...persisted,
      merkleRoot: `0x${'ff'.repeat(32)}`,
    } as Asset);
    const service = new DisclosureService(repository, chain);

    const result = await service.preview('user-1', ASSET_ID, { disclosedIndices: [1] });

    expect(chain.getAsset).toHaveBeenCalledWith(ASSET_ID);
    expect(result.root).toBe((await chain.getAsset.mock.results[0]!.value).merkleRoot);
    expect(result.verified).toBe(true);
  });

  it('fails explicitly when the persisted asset does not exist', async () => {
    repository.findOne.mockResolvedValue(null);
    const service = new DisclosureService(repository, chain);

    await expect(
      service.preview('other-user', ASSET_ID, { disclosedIndices: [0] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails explicitly when the chain has no registered asset', async () => {
    process.env.CHAIN_ADAPTER = 'arbitrum';
    chain.getAsset.mockResolvedValue(null);
    const service = new DisclosureService(repository, chain);

    await expect(
      service.preview('user-1', ASSET_ID, { disclosedIndices: [0] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    process.env.CHAIN_ADAPTER = 'in-memory';
  });

  it('uses the persisted root after an in-memory adapter restart', async () => {
    process.env.CHAIN_ADAPTER = 'in-memory';
    chain.getAsset.mockResolvedValue(null);
    const persisted = await repository.findOne({ where: { id: ASSET_ID } });
    repository.findOne.mockResolvedValue({
      ...persisted,
      registrationConfirmed: true,
    } as Asset);

    const result = await new DisclosureService(repository, chain).preview('user-1', ASSET_ID, {
      disclosedIndices: [0],
    });

    expect(result.root).toBe(persisted!.merkleRoot);
  });
});
