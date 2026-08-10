import { keccak256, stringToHex, type Address, type Hex } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import * as publicApi from './index';
import type { LiveDeployment } from './deployments';
import {
  EXPECTED_ASSET_REGISTRY_RUNTIME_BYTECODE_HASH,
  RedeploymentRequiredError,
  assertBroadcastRequest,
  assertDeploymentSourceIdentity,
  buildExpectedSmokeStates,
  executeSmokePlan,
  hashSmokePlan,
  type PendingSmokeTransaction,
  type SmokeChainState,
  type SmokeExecutionPort,
  type SmokeJournal,
  type SmokeReceipt,
} from './smoke-executor';
import { buildDemoPlan, deriveRoleAccounts } from './smoke';

const mnemonic = 'test test test test test test test test test test test junk';
const accounts = deriveRoleAccounts(mnemonic);
const address = (digit: string) => `0x${digit.repeat(40)}` as Address;
const runtimeBytecodeHashes = Object.fromEntries(
  [
    'assetRegistry',
    'certificationAttestor',
    'paiCertificate',
    'borrowingBaseEngine',
    'collateralVault',
    'mockUsdc',
  ].map((name, index) => [name, `0x${String(index + 1).repeat(64)}`]),
) as LiveDeployment['runtimeBytecodeHashes'];
const deployment: LiveDeployment = {
  chainId: 421_614,
  deploymentBlock: 1,
  addresses: {
    assetRegistry: address('1'),
    certificationAttestor: address('2'),
    paiCertificate: address('3'),
    borrowingBaseEngine: address('4'),
    collateralVault: address('5'),
    mockUsdc: address('6'),
  },
  runtimeBytecodeHashes,
  roles: {
    admin: accounts.admin.address,
    borrower: accounts.borrower.address,
    lender: accounts.lender.address,
    certifiers: accounts.certifiers.map((account) => account.address) as [
      Address,
      Address,
      Address,
    ],
  },
};
const valuationDate = 1_767_225_600n;
const plan = buildDemoPlan(deployment, accounts, valuationDate);
const planHash = hashSmokePlan(deployment, plan, valuationDate);
const states = buildExpectedSmokeStates(deployment, accounts, plan, valuationDate);

function harness(initialState = 0) {
  let stateIndex = initialState;
  let pending: PendingSmokeTransaction | null = null;
  const broadcasts: Hex[] = [];
  const prepared: PendingSmokeTransaction[] = [];
  const accepted = new Set<Hex>();
  const receipts = new Map<Hex, SmokeReceipt>();
  const journal: SmokeJournal = {
    loadPending: vi.fn(async () => pending),
    savePending: vi.fn(async (entry) => {
      pending = entry;
    }),
    markCommitted: vi.fn(async () => {
      pending = null;
    }),
  };
  const port: SmokeExecutionPort = {
    async readState() {
      return states[stateIndex]!;
    },
    async prepare(step) {
      const serializedTransaction = stringToHex(step.action);
      const entry = {
        transactionHash: keccak256(serializedTransaction),
        serializedTransaction,
        signerAddress: step.signerAddress,
      };
      prepared.push(entry as PendingSmokeTransaction);
      return entry;
    },
    async broadcast(serializedTransaction) {
      broadcasts.push(serializedTransaction);
      const hash = keccak256(serializedTransaction);
      const isNew = !accepted.has(hash);
      if (isNew) accepted.add(hash);
      receipts.set(hash, {
        transactionHash: hash,
        blockNumber: BigInt(stateIndex + 1),
        status: 'success',
      });
      if (isNew) stateIndex += 1;
      return hash;
    },
    async receipt(hash) {
      return receipts.get(hash) ?? null;
    },
  };
  return {
    port,
    journal,
    broadcasts,
    prepared,
    accepted,
    get pending() {
      return pending;
    },
    setState(index: number) {
      stateIndex = index;
    },
  };
}

describe('smoke broadcast boundary', () => {
  it('does not expose any send-capable factory from the package public API', () => {
    expect(publicApi).not.toHaveProperty('createViemSmokeExecutionPort');
    expect(publicApi).not.toHaveProperty('createAuthorizedExecutionPort');
    expect(publicApi).not.toHaveProperty('executeSmokePlan');
  });

  it('creates no capability when chain or confirmation gates fail', () => {
    const createCapability = vi.fn();
    expect(() => assertBroadcastRequest({ ...deployment, chainId: 1 }, planHash, planHash)).toThrow(
      /421614/,
    );
    expect(() => assertBroadcastRequest(deployment, planHash, undefined)).toThrow(/confirm-plan/i);
    expect(() => assertBroadcastRequest(deployment, planHash, `0x${'0'.repeat(64)}`)).toThrow(
      /plan hash/i,
    );
    expect(createCapability).not.toHaveBeenCalled();
  });

  it('requires corrected canonical runtime identity before capability creation', () => {
    const createWallet = vi.fn();
    const sign = vi.fn();
    const journal = vi.fn();
    const send = vi.fn();
    expect(() => assertDeploymentSourceIdentity(deployment)).toThrow(RedeploymentRequiredError);
    expect(() => assertBroadcastRequest(deployment, planHash, planHash)).toThrow(
      RedeploymentRequiredError,
    );
    expect(
      [createWallet, sign, journal, send].every((operation) => operation.mock.calls.length === 0),
    ).toBe(true);
  });

  it('accepts future metadata bound to the corrected AssetRegistry runtime', () => {
    const corrected = {
      ...deployment,
      runtimeBytecodeHashes: {
        ...deployment.runtimeBytecodeHashes,
        assetRegistry: EXPECTED_ASSET_REGISTRY_RUNTIME_BYTECODE_HASH,
      },
    };

    expect(() => assertDeploymentSourceIdentity(corrected)).not.toThrow();
    expect(() => assertBroadcastRequest(corrected, planHash, planHash)).not.toThrow();
  });
});

describe('same-hash smoke executor', () => {
  it('persists the signed hash before broadcasting and executes exact order', async () => {
    const test = harness();
    const events: string[] = [];
    vi.mocked(test.journal.savePending).mockImplementation(async (entry) => {
      events.push(`journal:${entry.step}`);
      Object.defineProperty(test, 'pending', { value: entry, configurable: true });
    });
    const originalBroadcast = test.port.broadcast;
    test.port.broadcast = vi.fn(async (raw) => {
      events.push(`broadcast:${keccak256(raw)}`);
      return originalBroadcast(raw);
    });

    const result = await executeSmokePlan(
      { chainId: deployment.chainId, deploymentMetadataHash: planHash, planHash },
      plan,
      states,
      test.port,
      test.journal,
    );

    expect(result.executed).toEqual(plan.transactions.map((step) => step.action));
    expect(events[0]).toBe('journal:0');
    expect(events[1]).toMatch(/^broadcast:/);
    expect(test.broadcasts).toHaveLength(10);
  });

  it('leaves a pending journal when broadcast outcome is ambiguous', async () => {
    const test = harness();
    test.port.broadcast = vi.fn(async () => {
      throw new Error('ambiguous network failure');
    });
    await expect(
      executeSmokePlan(
        { chainId: deployment.chainId, deploymentMetadataHash: planHash, planHash },
        plan,
        states,
        test.port,
        test.journal,
      ),
    ).rejects.toThrow(/ambiguous/);
    expect(test.journal.savePending).toHaveBeenCalledTimes(1);
    expect(test.journal.markCommitted).not.toHaveBeenCalled();
  });

  it('rebroadcasts only the identical signed transaction after a crash window', async () => {
    const test = harness();
    const raw = stringToHex(plan.transactions[0]!.action);
    const transactionHash = keccak256(raw);
    const pending: PendingSmokeTransaction = {
      chainId: deployment.chainId,
      deploymentMetadataHash: planHash,
      planHash,
      step: 0,
      action: plan.transactions[0]!.action,
      signerAddress: plan.transactions[0]!.signerAddress,
      to: plan.transactions[0]!.intent.to,
      transactionHash,
      serializedTransaction: raw,
    };
    vi.mocked(test.journal.loadPending).mockResolvedValueOnce(pending);

    await executeSmokePlan(
      { chainId: deployment.chainId, deploymentMetadataHash: planHash, planHash },
      plan,
      states,
      test.port,
      test.journal,
    );

    expect(test.broadcasts[0]).toBe(raw);
    expect(test.prepared).toHaveLength(9);
    expect(test.accepted.size).toBe(10);
  });

  it('uses an existing receipt by exact hash without rebroadcasting', async () => {
    const test = harness();
    const raw = stringToHex(plan.transactions[0]!.action);
    const transactionHash = keccak256(raw);
    vi.mocked(test.journal.loadPending).mockResolvedValueOnce({
      chainId: deployment.chainId,
      deploymentMetadataHash: planHash,
      planHash,
      step: 0,
      action: plan.transactions[0]!.action,
      signerAddress: plan.transactions[0]!.signerAddress,
      to: plan.transactions[0]!.intent.to,
      transactionHash,
      serializedTransaction: raw,
    });
    test.setState(1);
    const originalReceipt = test.port.receipt;
    test.port.receipt = vi.fn(async (hash) =>
      hash === transactionHash
        ? ({ transactionHash: hash, blockNumber: 1n, status: 'success' } satisfies SmokeReceipt)
        : originalReceipt(hash),
    );

    await executeSmokePlan(
      { chainId: deployment.chainId, deploymentMetadataHash: planHash, planHash },
      plan,
      states,
      test.port,
      test.journal,
    );

    expect(test.broadcasts).toHaveLength(9);
    expect(test.broadcasts).not.toContain(raw);
  });

  it('rebroadcasts the identical hash when committed state has an ambiguous receipt', async () => {
    const test = harness();
    const raw = stringToHex(plan.transactions[0]!.action);
    const transactionHash = keccak256(raw);
    const pending: PendingSmokeTransaction = {
      chainId: deployment.chainId,
      deploymentMetadataHash: planHash,
      planHash,
      step: 0,
      action: plan.transactions[0]!.action,
      signerAddress: plan.transactions[0]!.signerAddress,
      to: plan.transactions[0]!.intent.to,
      transactionHash,
      serializedTransaction: raw,
    };
    vi.mocked(test.journal.loadPending).mockResolvedValueOnce(pending);
    test.accepted.add(transactionHash);
    test.setState(1);

    await executeSmokePlan(
      { chainId: deployment.chainId, deploymentMetadataHash: planHash, planHash },
      plan,
      states,
      test.port,
      test.journal,
    );

    expect(test.broadcasts[0]).toBe(raw);
    expect(keccak256(test.broadcasts[0]!)).toBe(transactionHash);
    expect(test.accepted.size).toBe(10);
  });

  it('rejects a prepared or broadcast hash mismatch', async () => {
    const preparedMismatch = harness();
    preparedMismatch.port.prepare = vi.fn(async (step) => ({
      transactionHash: `0x${'0'.repeat(64)}` as Hex,
      serializedTransaction: '0x020001' as Hex,
      signerAddress: step.signerAddress,
    }));
    await expect(
      executeSmokePlan(
        { chainId: deployment.chainId, deploymentMetadataHash: planHash, planHash },
        plan,
        states,
        preparedMismatch.port,
        preparedMismatch.journal,
      ),
    ).rejects.toThrow(/prepared transaction hash/i);
    expect(preparedMismatch.broadcasts).toHaveLength(0);

    const broadcastMismatch = harness();
    broadcastMismatch.port.broadcast = vi.fn(async () => `0x${'0'.repeat(64)}` as Hex);
    await expect(
      executeSmokePlan(
        { chainId: deployment.chainId, deploymentMetadataHash: planHash, planHash },
        plan,
        states,
        broadcastMismatch.port,
        broadcastMismatch.journal,
      ),
    ).rejects.toThrow(/broadcast hash/i);
  });

  it('aborts before preparing when state diverges', async () => {
    const test = harness();
    test.port.readState = vi.fn(async () => ({
      ...states[0],
      balances: { ...states[0]!.balances, lender: 1n },
    })) as () => Promise<SmokeChainState>;
    await expect(
      executeSmokePlan(
        { chainId: deployment.chainId, deploymentMetadataHash: planHash, planHash },
        plan,
        states,
        test.port,
        test.journal,
      ),
    ).rejects.toThrow(/divergence/i);
    expect(test.prepared).toHaveLength(0);
  });
});
