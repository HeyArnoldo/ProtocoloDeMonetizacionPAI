import { describe, expect, it } from 'vitest';
import { keccak256, type Address, type Hex } from 'viem';
import { finalizeDeployment } from './deployment-finalizer';
import { verifyRuntimeBytecodeHashes } from './deployments';

const address = (digit: string) => `0x${digit.repeat(40)}` as Address;
const hash = (digit: string) => `0x${digit.repeat(64)}`;
const indexedHash = (index: number) => `0x${index.toString(16).padStart(64, '0')}`;
const roles = {
  admin: address('a'),
  borrower: address('b'),
  lender: address('c'),
  certifiers: [address('d'), address('e'), address('f')],
} as const;
const names = [
  'AssetRegistry',
  'PAICertificate',
  'CertificationAttestor',
  'BorrowingBaseEngine',
  'MockUSDC',
  'CollateralVault',
] as const;
const codes = Object.fromEntries(
  names.map((name, index) => [address(String(index + 1)), `0x60${index + 1}` as Hex]),
);
const codeProvider = {
  getCode: async ({ address: target }: { address: Address }) => codes[target],
};

const successfulBroadcast = () => {
  const transactions = names.map((contractName, index) => ({
    contractName,
    contractAddress: address(String(index + 1)),
    hash: indexedHash(index + 1),
    transactionType: 'CREATE',
  }));
  const receipts = Array.from({ length: 20 }, (_, index) => ({
    transactionHash: indexedHash(index + 1),
    blockNumber: `0x${(296_444_399 + index).toString(16)}`,
    status: '0x1',
  }));
  return { transactions, receipts };
};

describe('deployment finalization', () => {
  it('derives the first successful receipt block, addresses, and runtime hashes', async () => {
    const { transactions, receipts } = successfulBroadcast();

    const deployment = await finalizeDeployment(
      { transactions, receipts },
      421_614,
      roles,
      codeProvider,
    );

    expect(deployment.deploymentBlock).toBe(296_444_399);
    expect(deployment.addresses.assetRegistry).toBe(address('1'));
    expect(deployment.addresses.collateralVault).toBe(address('6'));
    expect(deployment.runtimeBytecodeHashes.assetRegistry).toBe(keccak256(codes[address('1')]!));
    expect(deployment).not.toHaveProperty('deployer');
  });

  it('accepts a real-shaped 20-receipt broadcast idempotently', async () => {
    const broadcast = successfulBroadcast();
    const first = JSON.stringify(await finalizeDeployment(broadcast, 421_614, roles, codeProvider));
    const second = JSON.stringify(
      await finalizeDeployment(broadcast, 421_614, roles, codeProvider),
    );
    expect(second).toBe(first);
  });

  it('rejects duplicate receipt hashes globally', async () => {
    const broadcast = successfulBroadcast();
    broadcast.receipts.push({ ...broadcast.receipts[19]!, blockNumber: '0x123' });
    await expect(finalizeDeployment(broadcast, 421_614, roles, codeProvider)).rejects.toThrow(
      /duplicate receipt hash/i,
    );
  });

  it('rejects malformed unrelated receipts', async () => {
    const broadcast = successfulBroadcast();
    broadcast.receipts.push({
      transactionHash: 'not-a-hash',
      blockNumber: '0x123',
      status: '0x1',
    });
    await expect(finalizeDeployment(broadcast, 421_614, roles, codeProvider)).rejects.toThrow(
      /receipt.*hash/i,
    );
  });

  it('rejects failed and malformed required receipts', async () => {
    const failed = successfulBroadcast();
    failed.receipts[0] = { ...failed.receipts[0]!, status: '0x0' };
    await expect(finalizeDeployment(failed, 421_614, roles, codeProvider)).rejects.toThrow(
      /not successful/i,
    );

    const malformed = successfulBroadcast();
    malformed.receipts[0] = { ...malformed.receipts[0]!, blockNumber: 'invalid' };
    await expect(finalizeDeployment(malformed, 421_614, roles, codeProvider)).rejects.toThrow(
      /receipt 0 block/i,
    );
  });

  it('rejects missing, failed, and duplicate contract deployments', async () => {
    const transaction = {
      contractName: 'AssetRegistry',
      contractAddress: address('1'),
      hash: hash('1'),
      transactionType: 'CREATE',
    };
    await expect(
      finalizeDeployment(
        { transactions: [transaction], receipts: [] },
        421_614,
        roles,
        codeProvider,
      ),
    ).rejects.toThrow(/receipt|six/i);
    await expect(
      finalizeDeployment(
        {
          transactions: [transaction, { ...transaction, hash: hash('2') }],
          receipts: [
            { transactionHash: hash('1'), blockNumber: '0x1', status: '0x1' },
            { transactionHash: hash('2'), blockNumber: '0x2', status: '0x0' },
          ],
        },
        421_614,
        roles,
        codeProvider,
      ),
    ).rejects.toThrow();
  });

  it('rejects missing deployed runtime bytecode', async () => {
    await expect(
      finalizeDeployment(successfulBroadcast(), 421_614, roles, { getCode: async () => undefined }),
    ).rejects.toThrow(/runtime bytecode/i);
  });

  it('rejects a runtime bytecode hash mismatch', async () => {
    const deployment = await finalizeDeployment(
      successfulBroadcast(),
      421_614,
      roles,
      codeProvider,
    );
    await expect(
      verifyRuntimeBytecodeHashes(deployment, {
        getCode: async ({ address: target }) =>
          target === deployment.addresses.assetRegistry ? ('0x6000' as Hex) : codes[target],
      }),
    ).rejects.toThrow(/assetRegistry runtime bytecode hash mismatch/i);
  });
});
