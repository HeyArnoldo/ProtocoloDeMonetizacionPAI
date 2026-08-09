import { createHash } from 'node:crypto';
import { getAddress, keccak256, stringToHex, type Address, type Hex } from 'viem';
import type { LiveDeployment } from './deployments';
import {
  buildDemoFixture,
  DEMO_ASSET_ID,
  DEMO_PRINCIPAL,
  type DemoPlan,
  type SmokeAccounts,
  type SmokeStep,
} from './smoke';

export interface SmokeAssetState {
  readonly merkleRoot: Hex;
  readonly ownerIdHash: Hex;
  readonly controller: Address;
  readonly status: number;
}

export interface SmokeLoanState {
  readonly borrower: Address;
  readonly lender: Address;
  readonly principal: bigint;
  readonly dueAt: bigint;
  readonly state: number;
}

export interface SmokeChainState {
  readonly asset: SmokeAssetState | null;
  readonly attestations: readonly [Hex | null, Hex | null, Hex | null];
  readonly loan: SmokeLoanState | null;
  readonly certificateValid: boolean;
  readonly balances: Readonly<{ borrower: bigint; lender: bigint; vault: bigint }>;
  readonly allowances: Readonly<{ borrower: bigint; lender: bigint }>;
}

export interface SmokeReceipt {
  readonly transactionHash: Hex;
  readonly blockNumber: bigint | null;
  readonly status: 'success' | 'reverted';
}

export interface SmokeExecutionPort {
  readState(): Promise<SmokeChainState>;
  prepare(step: SmokeStep): Promise<PreparedSmokeTransaction>;
  broadcast(serializedTransaction: Hex): Promise<Hex>;
  receipt(hash: Hex): Promise<SmokeReceipt | null>;
}

export interface PreparedSmokeTransaction {
  readonly transactionHash: Hex;
  readonly serializedTransaction: Hex;
  readonly signerAddress: Address;
}

export interface SmokeExecutionIdentity {
  readonly chainId: number;
  readonly deploymentMetadataHash: Hex;
  readonly planHash: Hex;
}

export interface PendingSmokeTransaction extends SmokeExecutionIdentity {
  readonly step: number;
  readonly action: string;
  readonly signerAddress: Address;
  readonly to: Address;
  readonly transactionHash: Hex;
  readonly serializedTransaction: Hex;
}

export interface SmokeJournal {
  loadPending(): Promise<PendingSmokeTransaction | null>;
  savePending(entry: PendingSmokeTransaction): Promise<void>;
  markCommitted(entry: PendingSmokeTransaction, receipt: SmokeReceipt): Promise<void>;
}

export interface SmokeExecutionResult {
  readonly skipped: readonly string[];
  readonly executed: readonly string[];
  readonly receipts: readonly SmokeReceipt[];
}

function canonical(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function digest(value: unknown): Hex {
  return `0x${createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')}`;
}

export function hashDeploymentMetadata(deployment: LiveDeployment): Hex {
  return digest(deployment);
}

export function hashSmokePlan(
  deployment: LiveDeployment,
  plan: DemoPlan,
  valuationDate: bigint,
): Hex {
  return digest({
    chainId: deployment.chainId,
    deploymentMetadataHash: hashDeploymentMetadata(deployment),
    valuationDate,
    transactions: plan.transactions,
    readback: plan.readback,
  });
}

export class ArchitectureDecisionRequiredError extends Error {
  constructor() {
    super('architecture_decision_required');
    this.name = 'ArchitectureDecisionRequiredError';
  }
}

export function assertBroadcastRequest(
  chainId: number,
  currentPlanHash: Hex,
  confirmedPlanHash: string | undefined,
): never {
  if (chainId !== 421_614) throw new Error('Broadcast is restricted to chainId 421614.');
  if (!confirmedPlanHash)
    throw new Error('Broadcast requires --confirm-plan with the printed hash.');
  if (confirmedPlanHash !== currentPlanHash) throw new Error('Confirmed plan hash does not match.');
  throw new ArchitectureDecisionRequiredError();
}

export function buildExpectedSmokeStates(
  deployment: LiveDeployment,
  accounts: SmokeAccounts,
  plan: DemoPlan,
  valuationDate: bigint,
): readonly SmokeChainState[] {
  const fixture = buildDemoFixture(valuationDate);
  const ownerIdHash = keccak256(stringToHex('pai-demo-owner'));
  const certificateHashes = [0, 1, 2].map((kind) =>
    keccak256(stringToHex(`pai-demo-certificate-${kind}`)),
  ) as [Hex, Hex, Hex];
  const asset = (status: number): SmokeAssetState => ({
    merkleRoot: fixture.merkleRoot,
    ownerIdHash,
    controller: getAddress(accounts.borrower.address),
    status,
  });
  const loan = (state: number): SmokeLoanState => ({
    borrower: getAddress(accounts.borrower.address),
    lender: getAddress(accounts.lender.address),
    principal: DEMO_PRINCIPAL,
    dueAt: valuationDate + 30n * 86_400n,
    state,
  });
  const state = (
    assetState: SmokeAssetState | null,
    attestations: SmokeChainState['attestations'],
    loanState: SmokeLoanState | null,
    certificateValid: boolean,
    borrowerBalance: bigint,
    lenderBalance: bigint,
    borrowerAllowance = 0n,
    lenderAllowance = 0n,
  ): SmokeChainState => ({
    asset: assetState,
    attestations,
    loan: loanState,
    certificateValid,
    balances: { borrower: borrowerBalance, lender: lenderBalance, vault: 0n },
    allowances: { borrower: borrowerAllowance, lender: lenderAllowance },
  });
  const none = [null, null, null] as const;
  const one = [certificateHashes[0], null, null] as const;
  const two = [certificateHashes[0], certificateHashes[1], null] as const;
  const all = certificateHashes;
  const expected = [
    state(null, none, null, false, 0n, 0n),
    state(asset(0), none, null, false, 0n, 0n),
    state(asset(0), one, null, false, 0n, 0n),
    state(asset(0), two, null, false, 0n, 0n),
    state(asset(1), all, null, true, 0n, 0n),
    state(asset(2), all, loan(1), true, 0n, 0n),
    state(asset(2), all, loan(1), true, 0n, 1_000_000n),
    state(asset(2), all, loan(1), true, 0n, 1_000_000n, 0n, DEMO_PRINCIPAL),
    state(asset(3), all, loan(2), true, DEMO_PRINCIPAL, 600_000n),
    state(asset(3), all, loan(2), true, DEMO_PRINCIPAL, 600_000n, DEMO_PRINCIPAL),
    state(asset(4), all, loan(3), true, plan.readback.borrowerBalance, plan.readback.lenderBalance),
  ];
  return Object.freeze(expected.map((item) => Object.freeze(item)));
}

function equalState(left: SmokeChainState, right: SmokeChainState): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function pendingMatches(
  pending: PendingSmokeTransaction,
  identity: SmokeExecutionIdentity,
  step: SmokeStep,
  index: number,
): boolean {
  return (
    pending.chainId === identity.chainId &&
    pending.deploymentMetadataHash === identity.deploymentMetadataHash &&
    pending.planHash === identity.planHash &&
    pending.step === index &&
    pending.action === step.action &&
    pending.signerAddress === step.signerAddress &&
    pending.to === step.intent.to &&
    keccak256(pending.serializedTransaction) === pending.transactionHash
  );
}

function validReceipt(receipt: SmokeReceipt | null, transactionHash: Hex): receipt is SmokeReceipt {
  return Boolean(
    receipt &&
    receipt.status === 'success' &&
    receipt.transactionHash === transactionHash &&
    receipt.blockNumber !== null &&
    receipt.blockNumber > 0n,
  );
}

export async function executeSmokePlan(
  identity: SmokeExecutionIdentity,
  plan: DemoPlan,
  expectedStates: readonly SmokeChainState[],
  port: SmokeExecutionPort,
  journal: SmokeJournal,
): Promise<SmokeExecutionResult> {
  if (expectedStates.length !== plan.transactions.length + 1) {
    throw new Error('Smoke checkpoint count does not match transaction plan.');
  }
  const current = await port.readState();
  const matches = expectedStates.flatMap((expected, index) =>
    equalState(current, expected) ? [index] : [],
  );
  if (matches.length !== 1) throw new Error('On-chain state divergence prevents safe execution.');

  const completed = matches[0]!;
  const skipped = plan.transactions.slice(0, completed).map((step) => step.action);
  const executed: string[] = [];
  const receipts: SmokeReceipt[] = [];
  let pending = await journal.loadPending();

  if (pending && pending.step === completed - 1) {
    const priorStep = plan.transactions[pending.step];
    if (!priorStep || !pendingMatches(pending, identity, priorStep, pending.step)) {
      throw new Error('Pending journal entry cannot be reconciled with committed state.');
    }
    let receipt = await port.receipt(pending.transactionHash);
    if (!receipt) {
      const broadcastHash = await port.broadcast(pending.serializedTransaction);
      if (broadcastHash !== pending.transactionHash) {
        throw new Error(`Broadcast hash mismatch at step ${pending.step + 1}.`);
      }
      receipt = await port.receipt(pending.transactionHash);
    }
    if (!validReceipt(receipt, pending.transactionHash)) {
      throw new Error('Pending journal receipt remains ambiguous.');
    }
    await journal.markCommitted(pending, receipt);
    pending = null;
  }

  for (let index = completed; index < plan.transactions.length; index += 1) {
    const step = plan.transactions[index]!;
    if (pending) {
      if (!pendingMatches(pending, identity, step, index)) {
        throw new Error('Pending journal entry does not match the current smoke step.');
      }
    } else {
      const prepared = await port.prepare(step);
      if (
        prepared.signerAddress !== step.signerAddress ||
        keccak256(prepared.serializedTransaction) !== prepared.transactionHash
      ) {
        throw new Error('Prepared transaction hash or signer mismatch.');
      }
      pending = {
        ...identity,
        step: index,
        action: step.action,
        signerAddress: step.signerAddress,
        to: step.intent.to,
        transactionHash: prepared.transactionHash,
        serializedTransaction: prepared.serializedTransaction,
      };
      await journal.savePending(pending);
    }
    let receipt = await port.receipt(pending.transactionHash);
    if (!receipt) {
      const broadcastHash = await port.broadcast(pending.serializedTransaction);
      if (broadcastHash !== pending.transactionHash) {
        throw new Error(`Broadcast hash mismatch at step ${index + 1}.`);
      }
      receipt = await port.receipt(pending.transactionHash);
    }
    if (!validReceipt(receipt, pending.transactionHash)) {
      throw new Error(`Transaction receipt validation failed at step ${index + 1}.`);
    }
    receipts.push(receipt);
    executed.push(step.action);
    const committed = await port.readState();
    if (!equalState(committed, expectedStates[index + 1]!)) {
      throw new Error(`On-chain state divergence after step ${index + 1}.`);
    }
    await journal.markCommitted(pending, receipt);
    pending = null;
  }

  return Object.freeze({ skipped, executed, receipts });
}
