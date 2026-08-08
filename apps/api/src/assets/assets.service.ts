import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AssetResponse, CreateAssetInput } from '@app/contracts';
import { buildTree, hashDebtor, randomDebtorSalt, toDueDate, type Hex } from '@app/merkle';
import { In, type Repository } from 'typeorm';
import { CHAIN_PORT, type ChainPort } from '../chain/chain.port';
import { Evidence } from '../evidence/evidence.entity';
import { Asset } from './asset.entity';
import { Receivable } from './receivable.entity';

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    @InjectRepository(Receivable) private readonly receivables: Repository<Receivable>,
    @InjectRepository(Evidence) private readonly evidence: Repository<Evidence>,
    @Inject(CHAIN_PORT) private readonly chain: ChainPort,
  ) {}

  async create(createdById: string, input: CreateAssetInput): Promise<AssetResponse> {
    if ((process.env.CHAIN_ADAPTER ?? 'in-memory') !== 'in-memory') {
      throw new BadRequestException(
        'Server-side asset creation is limited to CHAIN_ADAPTER=in-memory; a real controller must submit the transaction from its own wallet.',
      );
    }
    const creationKey = `0x${createHash('sha256')
      .update(`${createdById}:${JSON.stringify(input)}`)
      .digest('hex')}`;
    let asset = await this.assets.findOne({
      where: { creationKey, createdById },
      relations: { receivables: true },
      order: { receivables: { position: 'ASC' } },
    });
    if (asset?.registrationConfirmed) return this.toResponse(asset);

    const evidenceIds = [...new Set(input.receivables.map((item) => item.evidenceId))];
    const evidence = await this.evidence.findBy({ id: In(evidenceIds), createdById });
    const evidenceById = new Map(evidence.map((item) => [item.id, item]));
    const missing = evidenceIds.filter((id) => !evidenceById.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Evidence not found: ${missing.join(', ')}.`);
    }

    const debtorSalt = asset?.debtorSalt ?? randomDebtorSalt();
    const persistedReceivables = input.receivables.map((item, position) => {
      const source = evidenceById.get(item.evidenceId)!;
      return this.receivables.create({
        evidenceId: item.evidenceId,
        evidence: source,
        position,
        debtorTaxId: item.debtorTaxId,
        debtorLabel: item.debtorLabel,
        amountMinor: item.amountMinor,
        dueDate: item.dueDate,
        currency: item.currency,
        docHash: source.sha256,
      });
    });

    let tree;
    try {
      tree = buildTree(
        persistedReceivables.map((item) => ({
          debtorHash: hashDebtor(item.debtorTaxId, debtorSalt as Hex),
          amountMinor: BigInt(item.amountMinor),
          dueDate: toDueDate(item.dueDate),
          currency: item.currency as 840 | 604,
          docHash: item.docHash as Hex,
        })),
      );
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    const id =
      asset?.id ??
      `0x${createHash('sha256')
        .update(`${input.ownerIdHash}:${input.controller}:${tree.root}`)
        .digest('hex')}`;
    asset ??= this.assets.create({
      id,
      createdById,
      creationKey,
      ownerIdHash: input.ownerIdHash,
      controller: input.controller,
      debtorSalt,
      merkleRoot: tree.root,
      registrationTxHash: null,
      registrationConfirmed: false,
      registrationBlockNumber: null,
      receivables: persistedReceivables,
    });
    for (const receivable of persistedReceivables) receivable.asset = asset;
    if (!asset.createdAt) await this.assets.save(asset);

    const registered = await this.chain.getAsset(id as Hex);
    const tx = registered
      ? null
      : await this.chain.registerAsset({
          assetId: id as Hex,
          merkleRoot: tree.root,
          ownerIdHash: input.ownerIdHash as Hex,
          controller: input.controller as Hex,
        });
    if (tx) {
      asset.registrationTxHash = tx.hash;
      asset.registrationBlockNumber = tx.blockNumber === null ? null : String(tx.blockNumber);
    }
    asset.registrationConfirmed = registered !== null || tx !== null;

    return this.toResponse(await this.assets.save(asset));
  }

  async get(createdById: string, id: string): Promise<AssetResponse> {
    const asset = await this.assets.findOne({
      where: { id, createdById },
      relations: { receivables: true },
      order: { receivables: { position: 'ASC' } },
    });
    if (!asset) throw new NotFoundException(`Asset ${id} was not found.`);
    return this.toResponse(asset);
  }

  private toResponse(asset: Asset): AssetResponse {
    return {
      id: asset.id,
      ownerIdHash: asset.ownerIdHash,
      controller: asset.controller,
      merkleRoot: asset.merkleRoot,
      registrationTxHash: asset.registrationTxHash,
      registrationConfirmed: asset.registrationConfirmed,
      registrationBlockNumber:
        asset.registrationBlockNumber === null ? null : Number(asset.registrationBlockNumber),
      receivables: asset.receivables.map((item) => ({
        id: item.id,
        evidenceId: item.evidenceId,
        position: item.position,
        debtorTaxId: item.debtorTaxId,
        debtorLabel: item.debtorLabel,
        amountMinor: item.amountMinor,
        dueDate: item.dueDate,
        currency: item.currency as 840 | 604,
        docHash: item.docHash,
      })),
      createdAt: asset.createdAt?.toISOString() ?? new Date(0).toISOString(),
    };
  }
}
