import { publicVerificationSchema, type PublicVerificationResponse } from '@app/contracts';
import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Hex } from 'viem';
import { CHAIN_PORT, type ChainPort } from '../chain/chain.port';
import { CHAIN_RUNTIME_CONFIG, type ChainRuntimeConfig } from '../chain/chain.config';

@Injectable()
export class VerificationService {
  constructor(
    @Inject(CHAIN_PORT) private readonly chain: ChainPort,
    @Inject(CHAIN_RUNTIME_CONFIG) private readonly runtime: ChainRuntimeConfig,
  ) {}

  async get(assetId: string): Promise<PublicVerificationResponse> {
    const snapshot = await this.chain.getAssetSnapshot(assetId as Hex);
    if (!snapshot) throw new NotFoundException(`Asset ${assetId} was not found on-chain.`);
    if (snapshot.network === 'in-memory') {
      return publicVerificationSchema.parse({
        supported: false,
        network: 'in-memory',
        chainId: null,
        safeBlock: null,
        explorer: null,
      });
    }
    if (
      snapshot.chainId === null ||
      snapshot.blockNumber === null ||
      !snapshot.certificate.supported
    ) {
      throw new ServiceUnavailableException('Public chain verification is unavailable.');
    }
    const { asset, certificate } = snapshot;
    const baseUrl = this.runtime.explorerUrl?.replace(/\/$/, '');
    return publicVerificationSchema.parse({
      supported: true,
      network: 'arbitrum',
      chainId: snapshot.chainId,
      safeBlock: snapshot.blockNumber.toString(),
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
      certificate: { ...certificate, issuanceCount: certificate.issuanceCount.toString() },
      explorer:
        baseUrl && this.runtime.deployment
          ? {
              baseUrl,
              registryUrl: `${baseUrl}/address/${this.runtime.deployment.addresses.assetRegistry}`,
              controllerUrl: `${baseUrl}/address/${asset.controller}`,
            }
          : null,
    });
  }
}
