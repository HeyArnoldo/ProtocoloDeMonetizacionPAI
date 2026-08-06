import { Injectable } from '@nestjs/common';
import type {
  AssetId,
  AttestInput,
  BorrowingBaseInput,
  BorrowingBaseResult,
  ChainPort,
  OnChainAsset,
  RegisterAssetInput,
  RevokeAttestationInput,
  TxRef,
} from '../chain.port';

/**
 * Adapter real contra Arbitrum. **Territorio Web3 — pendiente de implementar.**
 *
 * Esqueleto a propósito: la interfaz ya está fijada y testeada contra
 * `InMemoryChainAdapter`, así que esto se puede llenar sin tocar nada del
 * dominio. Cada método documenta a qué llamada de contrato corresponde.
 *
 * Notas de implementación:
 * - Usar **Viem** (`packages/evm` expone los ABIs generados desde `chain/`).
 * - Las transacciones que mueven valor **no se firman acá**: las manda el
 *   usuario desde su smart account. Este adapter solo firma atestaciones
 *   EIP-712 con `ATTESTOR_PRIVATE_KEY` y lee estado/eventos.
 * - `registerAsset` y `attest` deberían encolarse (BullMQ) en vez de bloquear
 *   la request esperando confirmación.
 */
@Injectable()
export class ArbitrumChainAdapter implements ChainPort {
  private notImplemented(method: string, contractCall: string): never {
    throw new Error(
      `ArbitrumChainAdapter.${method} todavía no está implementado (debe llamar a ${contractCall}). ` +
        'Usa CHAIN_ADAPTER=in-memory mientras tanto.',
    );
  }

  /** → `AssetRegistry.registerAsset(assetId, merkleRoot, ownerIdHash)` */
  registerAsset(_input: RegisterAssetInput): Promise<TxRef> {
    return this.notImplemented('registerAsset', 'AssetRegistry.registerAsset');
  }

  /** → `CertificationAttestor.attest(assetId, kind, certificateHash)` */
  attest(_input: AttestInput): Promise<TxRef> {
    return this.notImplemented('attest', 'CertificationAttestor.attest');
  }

  /** → `CertificationAttestor.revoke(assetId, kind)` */
  revokeAttestation(_input: RevokeAttestationInput): Promise<TxRef> {
    return this.notImplemented('revokeAttestation', 'CertificationAttestor.revoke');
  }

  /** → `AssetRegistry.assets(assetId)` + eventos indexados en Postgres */
  getAsset(_assetId: AssetId): Promise<OnChainAsset | null> {
    return this.notImplemented('getAsset', 'AssetRegistry.assets');
  }

  /**
   * → `BorrowingBaseEngine.compute(root, leaves, proof, proofFlags)` (Stylus, `view`)
   *
   * Es una llamada de solo lectura: el prestamista puede hacer exactamente la
   * misma y obtener el mismo número. Ese es todo el argumento del proyecto.
   */
  computeBorrowingBase(_input: BorrowingBaseInput): Promise<BorrowingBaseResult> {
    return this.notImplemented('computeBorrowingBase', 'BorrowingBaseEngine.compute');
  }
}
