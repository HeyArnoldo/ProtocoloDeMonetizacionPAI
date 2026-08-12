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

function eventProvider(request: Eip1193Provider['request']) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    request: vi.fn(request),
    on: (event: string, listener: (...args: unknown[]) => void) => {
      const values = listeners.get(event) ?? new Set();
      values.add(listener);
      listeners.set(event, values);
    },
    removeListener: (event: string, listener: (...args: unknown[]) => void) =>
      listeners.get(event)?.delete(listener),
    emit: (event: string, value: unknown) =>
      listeners.get(event)?.forEach((listener) => listener(value)),
  };
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

  it('submits from the exact globally connected account without requesting accounts', async () => {
    const hash = `0x${'a'.repeat(64)}`;
    const account = `0x${'2'.repeat(40)}`;
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_chainId') return '0x66eee';
      if (method === 'eth_accounts') return [account];
      if (method === 'eth_sendTransaction') return hash;
      throw new Error(`Unexpected ${method}`);
    });

    await expect(
      new InjectedWalletSubmitter(provider(request), account, 421614).submit(intent),
    ).resolves.toBe(hash);
    expect(request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_requestAccounts' }),
    );
    expect(request).toHaveBeenLastCalledWith({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: intent.to, data: intent.data, value: '0x0' }],
    });
  });

  it('fails closed if the account changes before submission', async () => {
    const connected = `0x${'2'.repeat(40)}`;
    const changed = `0x${'3'.repeat(40)}`;
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_chainId') return '0x66eee';
      if (method === 'eth_accounts') return [changed];
      throw new Error(`Unexpected ${method}`);
    });

    await expect(
      new InjectedWalletSubmitter(provider(request), connected, 421614).submit(intent),
    ).rejects.toThrow('La cuenta de MetaMask cambió');
    expect(request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_sendTransaction' }),
    );
  });

  it.each([
    ['accountsChanged', [`0x${'3'.repeat(40)}`]],
    ['chainChanged', '0x1'],
  ])('does not send when %s fires between validation reads', async (event, value) => {
    const account = `0x${'2'.repeat(40)}`;
    let release!: () => void;
    const pause = new Promise<void>((resolve) => (release = resolve));
    const wallet = eventProvider(async ({ method }) => {
      if (method === 'eth_chainId') return '0x66eee';
      if (method === 'eth_accounts') {
        await pause;
        return [account];
      }
      if (method === 'eth_sendTransaction') return `0x${'a'.repeat(64)}`;
      throw new Error(`Unexpected ${method}`);
    });

    const submission = new InjectedWalletSubmitter(wallet, account, 421614).submit(intent);
    await vi.waitFor(() => expect(wallet.request).toHaveBeenCalledWith({ method: 'eth_accounts' }));
    wallet.emit(event, value);
    release();

    await expect(submission).rejects.toThrow('cambió durante la operación');
    expect(wallet.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'eth_sendTransaction' }),
    );
  });

  it('returns the provider result when an event arrives after send is invoked', async () => {
    const account = `0x${'2'.repeat(40)}`;
    const hash = `0x${'a'.repeat(64)}`;
    const wallet = eventProvider(async ({ method }) => {
      if (method === 'eth_chainId') return '0x66eee';
      if (method === 'eth_accounts') return [account];
      if (method === 'eth_sendTransaction') {
        wallet.emit('accountsChanged', [`0x${'3'.repeat(40)}`]);
        return hash;
      }
      throw new Error(`Unexpected ${method}`);
    });

    await expect(new InjectedWalletSubmitter(wallet, account, 421614).submit(intent)).resolves.toBe(
      hash,
    );
  });

  it('requires an active account on the intent chain', async () => {
    const account = `0x${'2'.repeat(40)}`;

    await expect(
      new InjectedWalletSubmitter(provider(vi.fn()), null, null).submit(intent),
    ).rejects.toThrow('Conecta MetaMask');
    await expect(
      new InjectedWalletSubmitter(provider(vi.fn()), account, 1).submit(intent),
    ).rejects.toThrow('Cambia a Arbitrum Sepolia');
  });
});

describe('InMemoryTransactionSubmitter', () => {
  it('records submitted intents and returns a deterministic transaction hash', async () => {
    const submitter = new InMemoryTransactionSubmitter();

    await expect(submitter.submit(intent)).resolves.toMatch(/^0x[0-9a-f]{64}$/);
    expect(submitter.submissions).toEqual([intent]);
  });
});
