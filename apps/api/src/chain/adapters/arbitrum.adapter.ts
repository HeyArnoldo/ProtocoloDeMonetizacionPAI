import {
  assetRegistryAbi,
  certificationAttestorAbi,
  collateralVaultAbi,
  paiCertificateAbi,
  type Deployment,
} from '@app/evm';
import { Injectable } from '@nestjs/common';
import { createPublicClient, http, type Address, type Hex } from 'viem';
import {
  ASSET_STATUS_ORDINAL,
  AttestationKind,
  type AssetStatus,
  type AssetId,
  type Attestation,
  type AttestInput,
  type BorrowingBaseInput,
  type BorrowingBaseResult,
  type ChainAssetSnapshot,
  type ChainNetworkStatus,
  type ChainPort,
  type OnChainAsset,
  type RegisterAssetInput,
  type RevokeAttestationInput,
  type TxRef,
} from '../chain.port';

interface Reader {
  getChainId(): Promise<number>;
  getBlock(parameters: object): Promise<{ number: bigint }>;
  getCode(parameters: object): Promise<Hex | undefined>;
  readContract(parameters: object): Promise<unknown>;
  getContractEvents(parameters: object): Promise<AttestationLog[]>;
}
interface AttestationLog {
  eventName: 'Attested' | 'AttestationRevoked';
  args: {
    assetId?: Hex;
    kind?: number;
    certifier?: Address;
    certificateHash?: Hex;
    attestedAt?: bigint;
  };
  blockNumber: bigint | null;
  transactionIndex: number | null;
  logIndex: number | null;
  transactionHash: Hex | null;
  removed?: boolean;
}

const KINDS = [
  AttestationKind.RevenueVerified,
  AttestationKind.RightsAssignable,
  AttestationKind.ServiceContinuity,
] as const;
const LOAN_STATES = [undefined, 'Pledged', 'Funded', 'Repaid', 'Defaulted'] as const;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const order = (log: AttestationLog): readonly [bigint, number, number] => {
  if (log.blockNumber === null || log.transactionIndex === null || log.logIndex === null) {
    throw new Error('RPC returned an unpositioned attestation log.');
  }
  return [log.blockNumber, log.transactionIndex, log.logIndex];
};
const timestamp = (value: bigint | undefined): Date => {
  if (value === undefined || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('RPC returned an invalid attestation timestamp.');
  }
  return new Date(Number(value) * 1000);
};

/** Deterministically reduces finalized event history to active attestations only. */
export function activeAttestations(
  assetId: AssetId,
  logs: readonly AttestationLog[],
): Attestation[] {
  const positioned = logs
    .filter((log) => !log.removed && log.args.assetId?.toLowerCase() === assetId.toLowerCase())
    .sort((left, right) => {
      const a = order(left);
      const b = order(right);
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1] || a[2] - b[2];
    });
  const seen = new Map<string, string>();
  const active = new Map<string, Attestation>();
  for (const log of positioned) {
    const { kind, certifier } = log.args;
    if (kind === undefined || !KINDS[kind] || !certifier || !log.transactionHash) {
      throw new Error('RPC returned a malformed attestation log.');
    }
    const id = `${log.transactionHash}:${log.logIndex}`;
    const fingerprint = `${log.eventName}:${kind}:${certifier}:${log.args.certificateHash ?? ''}:${log.args.attestedAt ?? ''}`;
    if (seen.has(id)) {
      if (seen.get(id) !== fingerprint) throw new Error('RPC returned conflicting duplicate logs.');
      continue;
    }
    seen.set(id, fingerprint);
    const key = `${kind}:${certifier.toLowerCase()}`;
    if (log.eventName === 'AttestationRevoked') active.delete(key);
    else {
      if (!log.args.certificateHash) throw new Error('RPC returned a malformed Attested log.');
      active.set(key, {
        kind: KINDS[kind],
        certifier,
        certificateHash: log.args.certificateHash,
        attestedAt: timestamp(log.args.attestedAt),
        revokedAt: null,
      });
    }
  }
  return [...active.values()].sort(
    (left, right) =>
      KINDS.indexOf(left.kind) - KINDS.indexOf(right.kind) ||
      left.certifier.localeCompare(right.certifier),
  );
}

/** Public-RPC adapter. It never owns an account and therefore cannot submit transactions. */
@Injectable()
export class ArbitrumChainAdapter implements ChainPort {
  private readonly reader: Reader;

  constructor(
    rpcUrl: string,
    private readonly deployment: Deployment,
    private readonly deploymentBlock: bigint,
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

  async getNetworkStatus(): Promise<ChainNetworkStatus> {
    const chainId = await this.assertChain();
    const [safe, head] = await Promise.all([
      this.reader.getBlock({ blockTag: 'safe' }),
      this.reader.getBlock({ blockTag: 'latest' }),
    ]);
    return { network: 'arbitrum', chainId, safeBlock: safe.number, headBlock: head.number };
  }

  /**
   * Bytecode en una dirección, anclado al bloque `safe` como el resto de las
   * lecturas — con `blockTag` en vez de resolver el bloque aparte, porque
   * `getNetworkStatus` ya paga esa consulta y acá se llama seis veces seguidas.
   *
   * La identidad de la cadena la valida el liveness probe antes de que esto
   * corra; repetir `assertChain()` por contrato solo duplicaría el tráfico.
   */
  async getCode(address: Address): Promise<Hex | null> {
    const code = await this.reader.getCode({ address, blockTag: 'safe' });
    // Un nodo responde `0x` (o nada) para una cuenta sin código. Devolverlo tal
    // cual haría que una dirección vacía pase por desplegada.
    return code && code !== '0x' ? code : null;
  }

  async getAsset(assetId: AssetId): Promise<OnChainAsset | null> {
    return this.assetAt(assetId, await this.safeBlock());
  }

  async getAssetSnapshot(assetId: AssetId): Promise<ChainAssetSnapshot | null> {
    const safeBlock = await this.safeBlock();
    const asset = await this.assetAt(assetId, safeBlock);
    if (!asset) return null;
    const [valid, owner, issuanceCount, loan] = (await Promise.all([
      this.read(
        this.deployment.addresses.paiCertificate,
        paiCertificateAbi,
        'isValid',
        assetId,
        safeBlock,
      ),
      this.read(
        this.deployment.addresses.paiCertificate,
        paiCertificateAbi,
        'certificateOwner',
        assetId,
        safeBlock,
      ),
      this.read(
        this.deployment.addresses.paiCertificate,
        paiCertificateAbi,
        'issuanceCount',
        assetId,
        safeBlock,
      ),
      this.read(
        this.deployment.addresses.collateralVault,
        collateralVaultAbi,
        'getLoan',
        assetId,
        safeBlock,
      ),
    ])) as [
      boolean,
      Address,
      bigint,
      { borrower: Address; lender: Address; principal: bigint; dueAt: bigint; state: number },
    ];
    const certificateOwner = owner.toLowerCase() === ZERO_ADDRESS ? null : owner;
    if (valid !== (certificateOwner !== null)) {
      throw new Error('RPC returned inconsistent certificate state.');
    }
    const loanState = LOAN_STATES[Number(loan.state)];
    if (Number(loan.state) !== 0 && !loanState)
      throw new Error(`Unknown loan state: ${loan.state}`);
    return {
      network: 'arbitrum',
      chainId: this.deployment.chainId,
      blockNumber: safeBlock,
      asset,
      certificate: { supported: true, valid, owner: certificateOwner, issuanceCount },
      loan: {
        supported: true,
        value: loanState
          ? {
              borrower: loan.borrower,
              lender: loan.lender,
              principal: loan.principal,
              dueAt: timestamp(loan.dueAt),
              state: loanState,
            }
          : null,
      },
    };
  }

  /** Refuses to read from an RPC pointing at a different chain than the deployment. */
  private async assertChain(): Promise<number> {
    const chainId = await this.reader.getChainId();
    if (chainId !== this.deployment.chainId) {
      throw new Error(
        `RPC chain ${chainId} does not match deployment chain ${this.deployment.chainId}.`,
      );
    }
    return chainId;
  }

  private async safeBlock(): Promise<bigint> {
    await this.assertChain();
    return (await this.reader.getBlock({ blockTag: 'safe' })).number;
  }

  private async assetAt(assetId: AssetId, safeBlock: bigint): Promise<OnChainAsset | null> {
    const exists = await this.reader.readContract({
      address: this.deployment.addresses.assetRegistry,
      abi: assetRegistryAbi,
      functionName: 'exists',
      args: [assetId],
      blockNumber: safeBlock,
    });
    if (exists !== true) return null;
    const asset = (await this.reader.readContract({
      address: this.deployment.addresses.assetRegistry,
      abi: assetRegistryAbi,
      functionName: 'getAsset',
      args: [assetId],
      blockNumber: safeBlock,
    })) as {
      merkleRoot: AssetId;
      ownerIdHash: AssetId;
      controller: Address;
      registeredAt: bigint;
      status: number;
      exists: boolean;
    };
    const status = Object.entries(ASSET_STATUS_ORDINAL).find(
      ([, ordinal]) => ordinal === Number(asset.status),
    )?.[0] as AssetStatus | undefined;
    if (!status) throw new Error(`Unknown on-chain asset status: ${asset.status}`);
    const logs = (
      await Promise.all(
        ['Attested', 'AttestationRevoked'].map((eventName) =>
          this.reader.getContractEvents({
            address: this.deployment.addresses.certificationAttestor,
            abi: certificationAttestorAbi,
            eventName,
            args: { assetId },
            fromBlock: this.deploymentBlock,
            toBlock: safeBlock,
            strict: true,
          }),
        ),
      )
    ).flat();
    return {
      assetId,
      merkleRoot: asset.merkleRoot,
      ownerIdHash: asset.ownerIdHash,
      controller: asset.controller,
      registeredAt: timestamp(asset.registeredAt),
      status,
      attestations: activeAttestations(assetId, logs),
    };
  }

  private read(
    address: Address,
    abi: object,
    functionName: string,
    assetId: AssetId,
    blockNumber: bigint,
  ) {
    return this.reader.readContract({ address, abi, functionName, args: [assetId], blockNumber });
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
