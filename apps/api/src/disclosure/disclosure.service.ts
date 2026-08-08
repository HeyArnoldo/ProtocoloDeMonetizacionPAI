import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { DisclosurePreviewResponse, PersistedDisclosurePreviewRequest } from '@app/contracts';
import {
  buildTree,
  hashDebtor,
  hashLeaf,
  toDueDate,
  verifyMultiProof,
  type Hex,
  type ReceivableLeaf,
} from '@app/merkle';
import type { Repository } from 'typeorm';
import { Asset } from '../assets/asset.entity';
import { CHAIN_PORT, type ChainPort } from '../chain/chain.port';

@Injectable()
export class DisclosureService {
  constructor(
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    @Inject(CHAIN_PORT) private readonly chain: ChainPort,
  ) {}

  async preview(
    createdById: string,
    assetId: string,
    request: PersistedDisclosurePreviewRequest,
  ): Promise<DisclosurePreviewResponse> {
    const asset = await this.assets.findOne({
      where: { id: assetId, createdById },
      relations: { receivables: true },
      order: { receivables: { position: 'ASC' } },
    });
    if (!asset) throw new NotFoundException(`Asset ${assetId} was not found.`);

    const chainAsset = await this.chain.getAsset(assetId as Hex);
    if (
      !chainAsset &&
      ((process.env.CHAIN_ADAPTER ?? 'in-memory') !== 'in-memory' || !asset.registrationConfirmed)
    ) {
      throw new NotFoundException(`Asset ${assetId} is not registered on-chain.`);
    }
    const authoritativeRoot = chainAsset?.merkleRoot ?? (asset.merkleRoot as Hex);

    try {
      const leaves: ReceivableLeaf[] = asset.receivables.map((item) => ({
        debtorHash: hashDebtor(item.debtorTaxId, asset.debtorSalt as Hex),
        amountMinor: BigInt(item.amountMinor),
        dueDate: toDueDate(item.dueDate),
        currency: item.currency as ReceivableLeaf['currency'],
        docHash: item.docHash as Hex,
      }));
      const tree = buildTree(leaves);
      // Postgres conserva el expediente completo, pero la raíz registrada en
      // cadena es la autoridad cuando ambas fuentes discrepan.
      if (tree.root !== authoritativeRoot) {
        throw new Error('Persisted receivables no longer match the registered Merkle root.');
      }
      return this.buildPreview(tree, request.disclosedIndices, leaves.length);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private buildPreview(
    tree: ReturnType<typeof buildTree>,
    disclosedIndices: number[],
    totalLeaves: number,
  ): DisclosurePreviewResponse {
    const multiProof = tree.multiProof(disclosedIndices);
    const nominalByCurrency = new Map<ReceivableLeaf['currency'], bigint>();
    for (const leaf of multiProof.leaves) {
      nominalByCurrency.set(
        leaf.currency,
        (nominalByCurrency.get(leaf.currency) ?? 0n) + leaf.amountMinor,
      );
    }
    return {
      root: tree.root,
      totalLeaves,
      disclosedCount: multiProof.leaves.length,
      hiddenCount: totalLeaves - multiProof.leaves.length,
      disclosedNominalByCurrency: [...nominalByCurrency].map(([currency, amount]) => ({
        currency,
        amountMinor: amount.toString(),
      })),
      disclosedLeaves: multiProof.leaves.map((leaf) => ({
        debtorHash: leaf.debtorHash,
        amountMinor: leaf.amountMinor.toString(),
        dueDate: leaf.dueDate,
        currency: leaf.currency,
        docHash: leaf.docHash,
        leafHash: hashLeaf(leaf),
      })),
      proof: multiProof.proof,
      proofFlags: multiProof.proofFlags,
      verified: verifyMultiProof(tree.root, multiProof),
    };
  }
}
