import { getAddress, type Address } from 'viem';
import {
  contractNames,
  parseLiveDeployment,
  readRuntimeBytecodeHashes,
  type DeploymentRoles,
  type LiveDeployment,
  type RuntimeCodeProvider,
} from './deployments';
import type { RuntimeBytecodeHashes } from './deployments';

const contractKeys = {
  AssetRegistry: 'assetRegistry',
  PAICertificate: 'paiCertificate',
  CertificationAttestor: 'certificationAttestor',
  BorrowingBaseEngine: 'borrowingBaseEngine',
  MockUSDC: 'mockUsdc',
  CollateralVault: 'collateralVault',
} as const;

interface BroadcastTransaction {
  readonly contractName?: unknown;
  readonly contractAddress?: unknown;
  readonly hash?: unknown;
  readonly transactionType?: unknown;
}
interface BroadcastReceipt {
  readonly transactionHash?: unknown;
  readonly blockNumber?: unknown;
  readonly status?: unknown;
}
interface FoundryBroadcast {
  readonly transactions?: readonly BroadcastTransaction[];
  readonly receipts?: readonly BroadcastReceipt[];
}

const TRANSACTION_HASH = /^0x[\da-f]{64}$/i;

const hexNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'string' || !/^0x[\da-f]+$/i.test(value)) {
    throw new TypeError(`${field} must be a hexadecimal quantity.`);
  }
  const result = Number(BigInt(value));
  if (!Number.isSafeInteger(result) || result <= 0) throw new RangeError(`${field} is invalid.`);
  return result;
};

const parseReceipts = (values: readonly BroadcastReceipt[]) => {
  const receipts = new Map<string, { blockNumber: number; status: '0x0' | '0x1' }>();
  values.forEach((value, index) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new TypeError(`Receipt ${index} must be an object.`);
    }
    if (
      typeof value.transactionHash !== 'string' ||
      !TRANSACTION_HASH.test(value.transactionHash)
    ) {
      throw new TypeError(`Receipt ${index} transaction hash is invalid.`);
    }
    const transactionHash = value.transactionHash.toLowerCase();
    if (receipts.has(transactionHash))
      throw new Error(`Duplicate receipt hash ${transactionHash}.`);
    if (value.status !== '0x0' && value.status !== '0x1') {
      throw new TypeError(`Receipt ${index} status is invalid.`);
    }
    receipts.set(transactionHash, {
      blockNumber: hexNumber(value.blockNumber, `Receipt ${index} block`),
      status: value.status,
    });
  });
  return receipts;
};

export function validateGuardedBroadcast(value: unknown): asserts value is FoundryBroadcast {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Guarded broadcast artifact must be an object.');
  }
  const broadcast = value as FoundryBroadcast;
  if (
    !Array.isArray(broadcast.transactions) ||
    !Array.isArray(broadcast.receipts) ||
    broadcast.transactions.length !== 20 ||
    broadcast.receipts.length !== 20
  ) {
    throw new Error('Guarded broadcast must contain the complete 20-transaction receipt set.');
  }
  const receipts = parseReceipts(broadcast.receipts);
  const transactionHashes = new Set<string>();
  const creations = new Set<string>();
  for (const [index, transaction] of broadcast.transactions.entries()) {
    if (typeof transaction !== 'object' || transaction === null || Array.isArray(transaction)) {
      throw new TypeError(`Transaction ${index} must be an object.`);
    }
    if (typeof transaction.hash !== 'string' || !TRANSACTION_HASH.test(transaction.hash)) {
      throw new TypeError(`Transaction ${index} hash is invalid.`);
    }
    const hash = transaction.hash.toLowerCase();
    if (transactionHashes.has(hash)) throw new Error(`Duplicate transaction hash ${hash}.`);
    transactionHashes.add(hash);
    const receipt = receipts.get(hash);
    if (!receipt || receipt.status !== '0x1') {
      throw new Error(`Transaction ${index} must have a successful receipt.`);
    }
    if (transaction.transactionType === 'CREATE') {
      const name = String(transaction.contractName);
      if (!(name in contractKeys) || creations.has(name)) {
        throw new Error('Guarded broadcast contains an unexpected contract creation.');
      }
      creations.add(name);
    }
  }
  if (transactionHashes.size !== receipts.size || creations.size !== 6) {
    throw new Error('Guarded broadcast must contain the complete six-contract deployment.');
  }
}

export function verifyExpectedRuntimeBytecodeHashes(
  actual: RuntimeBytecodeHashes,
  expected: RuntimeBytecodeHashes,
): void {
  for (const name of contractNames) {
    if (actual[name] !== expected[name]) {
      throw new Error(`${name} live runtime bytecode hash mismatch.`);
    }
  }
}

export async function finalizeDeployment(
  value: unknown,
  chainId: number,
  roles: DeploymentRoles,
  codeProvider: RuntimeCodeProvider,
): Promise<LiveDeployment> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Foundry broadcast must be an object.');
  }
  const broadcast = value as FoundryBroadcast;
  if (!Array.isArray(broadcast.transactions) || !Array.isArray(broadcast.receipts)) {
    throw new TypeError('Foundry broadcast must contain transactions and receipts.');
  }
  const receipts = parseReceipts(broadcast.receipts);
  const addresses: Partial<Record<(typeof contractKeys)[keyof typeof contractKeys], Address>> = {};
  const blocks: number[] = [];
  for (const transaction of broadcast.transactions) {
    if (
      transaction.transactionType !== 'CREATE' ||
      !(String(transaction.contractName) in contractKeys)
    ) {
      continue;
    }
    const name = String(transaction.contractName) as keyof typeof contractKeys;
    const key = contractKeys[name];
    if (addresses[key]) throw new Error(`Duplicate ${name} deployment.`);
    if (typeof transaction.hash !== 'string' || !TRANSACTION_HASH.test(transaction.hash)) {
      throw new TypeError(`${name} transaction hash is invalid.`);
    }
    const receipt = receipts.get(transaction.hash.toLowerCase());
    if (!receipt) throw new Error(`${name} receipt is missing.`);
    if (receipt.status !== '0x1') throw new Error(`${name} receipt was not successful.`);
    if (typeof transaction.contractAddress !== 'string')
      throw new TypeError(`${name} address is missing.`);
    addresses[key] = getAddress(transaction.contractAddress);
    blocks.push(receipt.blockNumber);
  }
  if (Object.keys(addresses).length !== 6 || blocks.length !== 6) {
    throw new Error('Broadcast must contain exactly the six successful protocol deployments.');
  }
  const runtimeBytecodeHashes = await readRuntimeBytecodeHashes(
    addresses as LiveDeployment['addresses'],
    codeProvider,
  );
  return parseLiveDeployment({
    chainId,
    deploymentBlock: Math.min(...blocks),
    addresses,
    runtimeBytecodeHashes,
    roles,
  });
}
