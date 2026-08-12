import { Injectable } from '@nestjs/common';
import {
  AssetNotFoundError,
  AssetStatus,
  InvalidChainTransitionError,
  type Attestation,
  type AttestInput,
  type AssetId,
  type BorrowingBaseInput,
  type BorrowingBaseResult,
  type ChainPort,
  type ChainStatus,
  type ChainAssetSnapshot,
  type OnChainAsset,
  type RegisterAssetInput,
  type RevokeAttestationInput,
  type TxHash,
  type TxRef,
} from '../chain.port';

/**
 * Adapter en memoria: permite construir y demostrar todo el flujo Web2 sin
 * cadena, sin testnet y sin esperar a que existan los contratos.
 *
 * **La regla dura:** este adapter NO simula lógica de negocio. Guarda estados
 * y aplica la máquina de transiciones, que es exactamente lo que hace el
 * contrato con sus `require()`. Lo que no hace es inventar cálculos: el día
 * que el motor Stylus devuelva un número y el fake devuelva otro, nadie
 * sabría cuál está mal. Por eso `computeBorrowingBase` falla explícitamente
 * en vez de aproximar.
 */
@Injectable()
export class InMemoryChainAdapter implements ChainPort {
  private readonly assets = new Map<AssetId, OnChainAsset>();
  private txCounter = 0;

  async getStatus(): Promise<ChainStatus> {
    return {
      network: 'in-memory',
      reachable: false,
      configured: false,
      deployed: false,
      expectedChainId: null,
      observedChainId: null,
      blockNumber: null,
      contractCount: 0,
      expectedContractCount: 6,
      contracts: [
        'assetRegistry',
        'certificationAttestor',
        'paiCertificate',
        'borrowingBaseEngine',
        'collateralVault',
        'mockUsdc',
      ].map((name) => ({ name, configured: false, deployed: false })) as ChainStatus['contracts'],
      reason: 'DEMO_MODE',
    };
  }

  async registerAsset(input: RegisterAssetInput): Promise<TxRef> {
    if (this.assets.has(input.assetId)) {
      throw new InvalidChainTransitionError(
        `El expediente ${input.assetId} ya está registrado on-chain.`,
      );
    }

    this.assets.set(input.assetId, {
      assetId: input.assetId,
      merkleRoot: input.merkleRoot,
      ownerIdHash: input.ownerIdHash,
      controller: input.controller,
      registeredAt: new Date(),
      status: AssetStatus.Registered,
      attestations: [],
    });

    return this.nextTx();
  }

  async attest(input: AttestInput): Promise<TxRef> {
    const asset = this.require(input.assetId);

    const alreadyActive = asset.attestations.some(
      (a) => a.kind === input.kind && a.certifier === input.certifier && a.revokedAt === null,
    );
    if (alreadyActive) {
      throw new InvalidChainTransitionError(
        `${input.certifier} ya tiene una atestación ${input.kind} vigente sobre ${input.assetId}.`,
      );
    }

    asset.attestations.push({
      kind: input.kind,
      certifier: input.certifier,
      certificateHash: input.certificateHash,
      attestedAt: new Date(),
      revokedAt: null,
    });
    asset.status = AssetStatus.Attested;

    return this.nextTx();
  }

  async revokeAttestation(input: RevokeAttestationInput): Promise<TxRef> {
    const asset = this.require(input.assetId);

    const attestation = asset.attestations.find(
      (a) => a.kind === input.kind && a.certifier === input.certifier && a.revokedAt === null,
    );
    if (!attestation) {
      throw new InvalidChainTransitionError(
        `No hay atestación ${input.kind} vigente de ${input.certifier} sobre ${input.assetId}.`,
      );
    }

    // No se borra: la revocación también es evidencia, y el historial es
    // justamente lo que hace auditable el expediente.
    attestation.revokedAt = new Date();

    const stillAttested = asset.attestations.some((a) => a.revokedAt === null);
    asset.status = stillAttested ? AssetStatus.Attested : AssetStatus.Registered;

    return this.nextTx();
  }

  async getAsset(assetId: AssetId): Promise<OnChainAsset | null> {
    const asset = this.assets.get(assetId);
    return asset ? this.snapshot(asset) : null;
  }

  async getAssetSnapshot(assetId: AssetId): Promise<ChainAssetSnapshot | null> {
    const asset = await this.getAsset(assetId);
    return asset
      ? {
          network: 'in-memory',
          chainId: null,
          blockNumber: null,
          asset,
          certificate: { supported: false },
          loan: { supported: false },
        }
      : null;
  }

  async computeBorrowingBase(_input: BorrowingBaseInput): Promise<BorrowingBaseResult> {
    throw new Error(
      'El BorrowingBaseEngine todavía no existe. Este adapter no aproxima cálculos de riesgo ' +
        'a propósito: un número plausible pero distinto al del motor Stylus es peor que un error. ' +
        'Usa CHAIN_ADAPTER=arbitrum cuando el motor esté desplegado.',
    );
  }

  private require(assetId: AssetId): OnChainAsset {
    const asset = this.assets.get(assetId);
    if (!asset) {
      throw new AssetNotFoundError(`El expediente ${assetId} no existe on-chain.`);
    }
    return asset;
  }

  /**
   * Copia defensiva: la cadena no entrega punteros a su estado, y el fake
   * tampoco debe. Sin esto un caller podría mutar el "on-chain" desde fuera y
   * el bug aparecería recién con el adapter real.
   */
  private snapshot(asset: OnChainAsset): OnChainAsset {
    return {
      ...asset,
      attestations: asset.attestations.map((a: Attestation) => ({ ...a })),
    };
  }

  /**
   * Hash sintético, deliberadamente reconocible.
   *
   * Empieza con `0xfa4e` para que nadie lo confunda con una transacción real
   * si termina renderizado en la UI o copiado a Arbiscan.
   */
  private nextTx(): TxRef {
    this.txCounter += 1;
    const hash = `0xfa4e${this.txCounter.toString(16).padStart(60, '0')}` as TxHash;
    return { hash, blockNumber: this.txCounter };
  }
}
