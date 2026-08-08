import { assetRegistryAbi, type Deployment } from '@app/evm';
import { Injectable } from '@nestjs/common';
import { createPublicClient, http } from 'viem';
import {
  ASSET_STATUS_ORDINAL,
  type AssetStatus,
  type AssetId,
  type AttestInput,
  type BorrowingBaseInput,
  type BorrowingBaseResult,
  type ChainPort,
  type OnChainAsset,
  type RegisterAssetInput,
  type RevokeAttestationInput,
  type TxRef,
} from '../chain.port';

interface Reader {
  readContract(parameters: object): Promise<unknown>;
}

/** Public-RPC adapter. It never owns an account and therefore cannot submit transactions. */
@Injectable()
export class ArbitrumChainAdapter implements ChainPort {
  private readonly reader: Reader;

  constructor(
    rpcUrl: string,
    private readonly deployment: Deployment,
    reader?: Reader,
  ) {
    this.reader = reader ?? (createPublicClient({ transport: http(rpcUrl) }) as unknown as Reader);
  }

  registerAsset(_input: RegisterAssetInput): Promise<TxRef> {
    return this.unsignedOnly();
  }

  attest(_input: AttestInput): Promise<TxRef> {
    return this.unsignedOnly();
  }

  revokeAttestation(_input: RevokeAttestationInput): Promise<TxRef> {
    return this.unsignedOnly();
  }

  async getAsset(assetId: AssetId): Promise<OnChainAsset | null> {
    const asset = (await this.reader.readContract({
      address: this.deployment.addresses.assetRegistry,
      abi: assetRegistryAbi,
      functionName: 'getAsset',
      args: [assetId],
    })) as {
      merkleRoot: AssetId;
      ownerIdHash: AssetId;
      controller: AssetId;
      registeredAt: bigint;
      status: number;
      exists: boolean;
    };
    if (!asset.exists) return null;
    const status = Object.entries(ASSET_STATUS_ORDINAL).find(
      ([, ordinal]) => ordinal === Number(asset.status),
    )?.[0] as AssetStatus | undefined;
    if (!status) throw new Error(`Unknown on-chain asset status: ${asset.status}`);
    throw new Error(
      `Asset ${assetId} exists, but attestation aggregation is not implemented; refusing incomplete data.`,
    );
  }

  computeBorrowingBase(_input: BorrowingBaseInput): Promise<BorrowingBaseResult> {
    throw new Error('Real borrowing-base reads require risk parameters; use the intent endpoint.');
  }

  private unsignedOnly(): Promise<TxRef> {
    return Promise.reject(
      new Error('The API never signs or submits transactions; request an unsigned intent.'),
    );
  }
}
