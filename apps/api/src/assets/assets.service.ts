import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  chainAssetSnapshotSchema,
  type AssetResponse,
  type ChainAssetSnapshotResponse,
  type CreateAssetInput,
} from '@app/contracts';
import { buildTree, hashDebtor, randomDebtorSalt, toDueDate, type Hex } from '@app/merkle';
import { In, type Repository } from 'typeorm';
import { CHAIN_PORT, type ChainPort } from '../chain/chain.port';
import { ChainIntentService, type SerializedIntent } from '../chain/chain-intent.service';
import { ownerIdHash } from '../chain/owner-id';
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
    private readonly intents: ChainIntentService,
  ) {}

  async create(createdById: string, input: CreateAssetInput): Promise<AssetResponse> {
    const ownerHash = ownerIdHash(createdById);
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
        .update(`${ownerHash}:${input.controller}:${tree.root}`)
        .digest('hex')}`;
    asset ??= this.assets.create({
      id,
      createdById,
      creationKey,
      ownerIdHash: ownerHash,
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

    if ((process.env.CHAIN_ADAPTER ?? 'in-memory') !== 'in-memory') {
      return this.toResponse(asset);
    }

    const registered = await this.chain.getAsset(id as Hex);
    const tx = registered
      ? null
      : await this.chain.registerAsset({
          assetId: id as Hex,
          merkleRoot: tree.root,
          ownerIdHash: ownerHash,
          controller: input.controller as Hex,
        });
    if (tx) {
      asset.registrationTxHash = tx.hash;
      asset.registrationBlockNumber = tx.blockNumber === null ? null : String(tx.blockNumber);
    }
    asset.registrationConfirmed = registered !== null || tx !== null;

    return this.toResponse(await this.assets.save(asset));
  }

  async registrationIntent(createdById: string, id: string): Promise<SerializedIntent> {
    const asset = await this.findOwned(createdById, id);
    return this.intents.build('register', createdById, {
      assetId: asset.id,
      merkleRoot: asset.merkleRoot,
    });
  }

  async confirmRegistration(createdById: string, id: string): Promise<AssetResponse> {
    const asset = await this.findOwned(createdById, id);
    if (asset.registrationConfirmed) return this.toResponse(asset);
    const registered = await this.chain.getAsset(id as Hex);
    if (!registered) throw new NotFoundException(`Asset ${id} is not registered on-chain.`);
    const expected = {
      assetId: asset.id,
      merkleRoot: asset.merkleRoot,
      ownerIdHash: ownerIdHash(createdById),
      controller: asset.controller,
    };
    for (const field of Object.keys(expected) as Array<keyof typeof expected>) {
      if (registered[field].toLowerCase() !== expected[field].toLowerCase()) {
        throw new ConflictException(`On-chain ${field} does not match the asset draft.`);
      }
    }
    await this.assets.update(
      { id, createdById, registrationConfirmed: false },
      { registrationConfirmed: true },
    );
    asset.registrationConfirmed = true;
    return this.toResponse(asset);
  }

  async get(createdById: string, id: string): Promise<AssetResponse> {
    return this.toResponse(await this.findOwned(createdById, id));
  }

  async chainSnapshot(createdById: string, id: string): Promise<ChainAssetSnapshotResponse> {
    await this.findOwned(createdById, id);
    return this.readChainSnapshot(id);
  }

  certificationSnapshot(id: string): Promise<ChainAssetSnapshotResponse> {
    return this.readChainSnapshot(id);
  }

  private async readChainSnapshot(id: string): Promise<ChainAssetSnapshotResponse> {
    const snapshot = await this.chain.getAssetSnapshot(id as Hex);
    if (!snapshot) throw new NotFoundException(`Asset ${id} is not registered on-chain.`);
    const { asset } = snapshot;
    return chainAssetSnapshotSchema.parse({
      blockNumber: snapshot.blockNumber?.toString() ?? null,
      registry: {
        assetId: asset.assetId,
        merkleRoot: asset.merkleRoot,
        ownerIdHash: asset.ownerIdHash,
        controller: asset.controller,
        registeredAt: asset.registeredAt.toISOString(),
        status: asset.status,
      },
      attestations: asset.attestations.map(({ kind, certifier, certificateHash, attestedAt }) => ({
        kind,
        certifier,
        certificateHash,
        attestedAt: attestedAt.toISOString(),
      })),
      certificate: snapshot.certificate.supported
        ? {
            ...snapshot.certificate,
            issuanceCount: snapshot.certificate.issuanceCount.toString(),
          }
        : snapshot.certificate,
      loan:
        snapshot.loan.supported && snapshot.loan.value
          ? {
              supported: true,
              value: {
                ...snapshot.loan.value,
                principal: snapshot.loan.value.principal.toString(),
                dueAt: snapshot.loan.value.dueAt.toISOString(),
              },
            }
          : snapshot.loan,
    });
  }

  private async findOwned(createdById: string, id: string): Promise<Asset> {
    const asset = await this.assets.findOne({
      where: { id, createdById },
      relations: { receivables: true },
      order: { receivables: { position: 'ASC' } },
    });
    if (!asset) throw new NotFoundException(`Asset ${id} was not found.`);
    return asset;
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
