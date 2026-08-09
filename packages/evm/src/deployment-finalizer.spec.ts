import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { finalizeDeployment } from './deployment-finalizer';

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
  it('derives the first successful receipt block and all six addresses', () => {
    const { transactions, receipts } = successfulBroadcast();

    const deployment = finalizeDeployment({ transactions, receipts }, 421_614, roles);

    expect(deployment.deploymentBlock).toBe(296_444_399);
    expect(deployment.addresses.assetRegistry).toBe(address('1'));
    expect(deployment.addresses.collateralVault).toBe(address('6'));
    expect(deployment).not.toHaveProperty('deployer');
  });

  it('accepts a real-shaped 20-receipt broadcast idempotently', () => {
    const broadcast = successfulBroadcast();
    const first = JSON.stringify(finalizeDeployment(broadcast, 421_614, roles));
    const second = JSON.stringify(finalizeDeployment(broadcast, 421_614, roles));
    expect(second).toBe(first);
  });

  it('rejects duplicate receipt hashes globally', () => {
    const broadcast = successfulBroadcast();
    broadcast.receipts.push({ ...broadcast.receipts[19]!, blockNumber: '0x123' });
    expect(() => finalizeDeployment(broadcast, 421_614, roles)).toThrow(/duplicate receipt hash/i);
  });

  it('rejects malformed unrelated receipts', () => {
    const broadcast = successfulBroadcast();
    broadcast.receipts.push({
      transactionHash: 'not-a-hash',
      blockNumber: '0x123',
      status: '0x1',
    });
    expect(() => finalizeDeployment(broadcast, 421_614, roles)).toThrow(/receipt.*hash/i);
  });

  it('rejects failed and malformed required receipts', () => {
    const failed = successfulBroadcast();
    failed.receipts[0] = { ...failed.receipts[0]!, status: '0x0' };
    expect(() => finalizeDeployment(failed, 421_614, roles)).toThrow(/not successful/i);

    const malformed = successfulBroadcast();
    malformed.receipts[0] = { ...malformed.receipts[0]!, blockNumber: 'invalid' };
    expect(() => finalizeDeployment(malformed, 421_614, roles)).toThrow(/receipt 0 block/i);
  });

  it('rejects missing, failed, and duplicate contract deployments', () => {
    const transaction = {
      contractName: 'AssetRegistry',
      contractAddress: address('1'),
      hash: hash('1'),
      transactionType: 'CREATE',
    };
    expect(() =>
      finalizeDeployment({ transactions: [transaction], receipts: [] }, 421_614, roles),
    ).toThrow(/receipt|six/i);
    expect(() =>
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
      ),
    ).toThrow();
  });
});
