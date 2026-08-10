import { describe, expect, it, vi } from 'vitest';
import {
  createChainIntentClient,
  InjectedWalletSubmitter,
  InMemoryTransactionSubmitter,
  type Eip1193Provider,
} from './transaction-intent';

const intent = {
  chainId: 421614,
  to: `0x${'1'.repeat(40)}`,
  data: '0x1234',
  value: '0',
} as const;

function provider(request: Eip1193Provider['request']): Eip1193Provider {
  return { request };
}

describe('chain intent client', () => {
  it('posts the authenticated intent request through the shared API client', async () => {
    const post = vi.fn().mockResolvedValue({ data: intent });
    const client = createChainIntentClient({ post });

    await expect(client.prepare('register', { assetId: 'asset-1' })).resolves.toEqual(intent);
    expect(post).toHaveBeenCalledWith('/chain/intents/register', { assetId: 'asset-1' });
  });

  it('preserves API errors', async () => {
    const failure = new Error('Request failed with status code 400');
    const client = createChainIntentClient({ post: vi.fn().mockRejectedValue(failure) });

    await expect(client.prepare('fund', {})).rejects.toBe(failure);
  });

  it('rejects malformed JSON intents before they reach a wallet', async () => {
    const client = createChainIntentClient({
      post: vi.fn().mockResolvedValue({ data: { ...intent, to: 'not-an-address' } }),
    });

    await expect(client.prepare('repay', {})).rejects.toThrow('Malformed transaction intent');
  });
});

describe('InjectedWalletSubmitter', () => {
  it('does not request accounts until submit is explicitly called', () => {
    const request = vi.fn();

    new InjectedWalletSubmitter(provider(request));

    expect(request).not.toHaveBeenCalled();
  });

  it('fails clearly when no injected provider exists', async () => {
    await expect(new InjectedWalletSubmitter(null).submit(intent)).rejects.toThrow(
      'No injected wallet provider is available',
    );
  });

  it('stops when the user rejects a required chain switch', async () => {
    const rejection = new Error('User rejected request');
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_chainId') return '0x1';
      if (method === 'wallet_switchEthereumChain') throw rejection;
      throw new Error(`Unexpected ${method}`);
    });

    await expect(new InjectedWalletSubmitter(provider(request)).submit(intent)).rejects.toBe(
      rejection,
    );
    expect(request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_requestAccounts' }),
    );
  });

  it('switches chain, requests an account, and submits the prepared transaction', async () => {
    const hash = `0x${'a'.repeat(64)}`;
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_chainId') return '0x1';
      if (method === 'wallet_switchEthereumChain') return null;
      if (method === 'eth_requestAccounts') return [`0x${'2'.repeat(40)}`];
      if (method === 'eth_sendTransaction') return hash;
      throw new Error(`Unexpected ${method}`);
    });

    await expect(new InjectedWalletSubmitter(provider(request)).submit(intent)).resolves.toBe(hash);
    expect(request).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x66eee' }],
    });
    expect(request).toHaveBeenLastCalledWith({
      method: 'eth_sendTransaction',
      params: [{ from: `0x${'2'.repeat(40)}`, to: intent.to, data: intent.data, value: '0x0' }],
    });
  });
});

describe('InMemoryTransactionSubmitter', () => {
  it('records submitted intents and returns a deterministic transaction hash', async () => {
    const submitter = new InMemoryTransactionSubmitter();

    await expect(submitter.submit(intent)).resolves.toMatch(/^0x[0-9a-f]{64}$/);
    expect(submitter.submissions).toEqual([intent]);
  });
});
