import {
  approveIntent,
  attestIntent,
  fundIntent,
  originateIntent,
  registerAssetIntent,
  repayIntent,
  revokeIntent,
  type ContractIntent,
  type Deployment,
  type OriginateInput,
  type ReceivableInput,
  type RiskParams,
} from '@app/evm';
import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type Address, type Hex } from 'viem';
import { CHAIN_RUNTIME_CONFIG, type ChainRuntimeConfig } from './chain.config';
import { ownerIdHash } from './owner-id';

export type IntentAction =
  | 'register'
  | 'attest'
  | 'revoke'
  | 'approve'
  | 'originate'
  | 'fund'
  | 'repay';
export interface SerializedIntent {
  readonly chainId: number;
  readonly to: Address;
  readonly data: Hex;
  readonly value: string;
}

@Injectable()
export class ChainIntentService {
  constructor(@Inject(CHAIN_RUNTIME_CONFIG) private readonly runtime: ChainRuntimeConfig) {}

  build(action: IntentAction, userId: string, body: Record<string, unknown>): SerializedIntent {
    const deployment = this.runtime.deployment;
    if (!deployment) throw new ServiceUnavailableException('Chain deployment is not configured.');
    try {
      return this.serialize(deployment, this.intent(action, userId, body, deployment));
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid intent input.',
      );
    }
  }

  private intent(
    action: IntentAction,
    userId: string,
    body: Record<string, unknown>,
    deployment: Deployment,
  ): ContractIntent {
    const assetId = body.assetId as Hex;
    switch (action) {
      case 'register':
        return registerAssetIntent(
          deployment.addresses.assetRegistry,
          assetId,
          body.merkleRoot as Hex,
          ownerIdHash(userId),
        );
      case 'attest':
        return attestIntent(
          deployment.addresses.certificationAttestor,
          assetId,
          body.kind as number,
          body.certificateHash as Hex,
        );
      case 'revoke':
        return revokeIntent(
          deployment.addresses.certificationAttestor,
          assetId,
          body.kind as number,
        );
      case 'approve':
        return approveIntent(
          deployment.addresses.mockUsdc,
          deployment.addresses.collateralVault,
          BigInt(body.amount as string),
        );
      case 'originate':
        return originateIntent(deployment.addresses.collateralVault, this.originate(body));
      case 'fund':
        return fundIntent(deployment.addresses.collateralVault, assetId);
      case 'repay':
        return repayIntent(deployment.addresses.collateralVault, assetId);
      default:
        throw new TypeError(`Unsupported intent action: ${String(action)}`);
    }
  }

  private originate(body: Record<string, unknown>): OriginateInput {
    const receivables = body.receivables as Array<Record<string, unknown>>;
    const risk = body.params as Record<string, unknown>;
    return {
      assetId: body.assetId as Hex,
      lender: body.lender as string,
      principal: BigInt(body.principal as string),
      dueAt: BigInt(body.dueAt as string),
      receivables: receivables.map(
        (item): ReceivableInput => ({
          debtorHash: item.debtorHash as Hex,
          amountMinor: BigInt(item.amountMinor as string),
          dueDate: BigInt(item.dueDate as string),
          currency: Number(item.currency) as 604 | 840,
          docHash: item.docHash as Hex,
        }),
      ),
      proof: body.proof as Hex[],
      proofFlags: body.proofFlags as boolean[],
      params: Object.fromEntries(
        Object.entries(risk).map(([key, value]) => [
          key,
          key === 'valuationDate' ? BigInt(value as string) : Number(value),
        ]),
      ) as unknown as RiskParams,
    };
  }

  private serialize(deployment: Deployment, intent: ContractIntent): SerializedIntent {
    return { chainId: deployment.chainId, to: intent.to, data: intent.data, value: '0' };
  }
}
