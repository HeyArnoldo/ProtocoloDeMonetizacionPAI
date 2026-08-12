import { describe, expect, it, vi } from 'vitest';
import {
  ARBITRUM_SEPOLIA_CHAIN_ID,
  ARBITRUM_SEPOLIA_HEX_CHAIN_ID,
  WalletStore,
} from './wallet-provider';
import type { Eip1193Provider } from '@/services/transaction-intent';

const ACCOUNT = `0x${'2'.repeat(40)}`;
const OTHER_ACCOUNT = `0x${'3'.repeat(40)}`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function mockProvider(responses: Record<string, unknown | Error>): Eip1193Provider & {
  emit(event: string, value?: unknown): void;
  listenerCount(event: string): number;
  request: ReturnType<typeof vi.fn>;
} {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const request = vi.fn(async ({ method }: { method: string }) => {
    const response = responses[method];
    if (response instanceof Error) throw response;
    return response;
  });

  return {
    request,
    on(event, listener) {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    emit(event, value) {
      listeners.get(event)?.forEach((listener) => listener(value));
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}

describe('WalletStore', () => {
  it('reports provider absence without prompting', async () => {
    const store = new WalletStore(null);

    await store.initialize();

    expect(store.getSnapshot()).toMatchObject({ status: 'unavailable', account: null });
  });

  it('reads only authorized accounts and chain on mount', async () => {
    const provider = mockProvider({ eth_accounts: [], eth_chainId: ARBITRUM_SEPOLIA_HEX_CHAIN_ID });
    const store = new WalletStore(provider);

    await store.initialize();

    expect(provider.request.mock.calls.map(([call]) => call.method)).toEqual([
      'eth_accounts',
      'eth_chainId',
    ]);
    expect(store.getSnapshot().status).toBe('disconnected');
  });

  it('restores an authorized account without prompting', async () => {
    const provider = mockProvider({
      eth_accounts: [ACCOUNT],
      eth_chainId: ARBITRUM_SEPOLIA_HEX_CHAIN_ID,
    });
    const store = new WalletStore(provider);

    await store.initialize();

    expect(store.getSnapshot()).toMatchObject({
      status: 'connected',
      account: ACCOUNT,
      chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
    });
  });

  it('connects only after an explicit action', async () => {
    const provider = mockProvider({
      eth_requestAccounts: [ACCOUNT],
      eth_chainId: ARBITRUM_SEPOLIA_HEX_CHAIN_ID,
    });
    const store = new WalletStore(provider);

    await store.connect();

    expect(provider.request).toHaveBeenNthCalledWith(1, { method: 'eth_requestAccounts' });
    expect(store.getSnapshot().status).toBe('connected');
  });

  it('turns a rejected connection into an actionable error', async () => {
    const rejection = Object.assign(new Error('User rejected request'), { code: 4001 });
    const provider = mockProvider({ eth_requestAccounts: rejection });
    const store = new WalletStore(provider);

    await store.connect();

    expect(store.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'Rechazaste la conexión en MetaMask. Vuelve a intentarlo cuando estés listo.',
    });
  });

  it('marks an authorized account on another chain as wrong network', async () => {
    const provider = mockProvider({ eth_accounts: [ACCOUNT], eth_chainId: '0x1' });
    const store = new WalletStore(provider);

    await store.initialize();

    expect(store.getSnapshot()).toMatchObject({ status: 'wrong-chain', chainId: 1 });
  });

  it('switches to Arbitrum Sepolia and refreshes state', async () => {
    const responses: Record<string, unknown> = {
      eth_accounts: [ACCOUNT],
      eth_chainId: '0x1',
      wallet_switchEthereumChain: null,
    };
    const provider = mockProvider(responses);
    const store = new WalletStore(provider);
    await store.initialize();
    responses.eth_chainId = ARBITRUM_SEPOLIA_HEX_CHAIN_ID;

    await store.switchNetwork();

    expect(provider.request).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARBITRUM_SEPOLIA_HEX_CHAIN_ID }],
    });
    expect(store.getSnapshot().status).toBe('connected');
  });

  it('adds Arbitrum Sepolia when MetaMask reports code 4902', async () => {
    const unknownChain = Object.assign(new Error('Unknown chain'), { code: 4902 });
    let switchAttempts = 0;
    const provider = mockProvider({
      eth_accounts: [ACCOUNT],
      eth_chainId: ARBITRUM_SEPOLIA_HEX_CHAIN_ID,
    });
    provider.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === 'wallet_switchEthereumChain' && switchAttempts++ === 0) throw unknownChain;
      if (method === 'wallet_addEthereumChain' || method === 'wallet_switchEthereumChain')
        return null;
      if (method === 'eth_accounts') return [ACCOUNT];
      if (method === 'eth_chainId') return ARBITRUM_SEPOLIA_HEX_CHAIN_ID;
      throw new Error(`Unexpected ${method}`);
    });
    const store = new WalletStore(provider);

    await store.switchNetwork();

    expect(provider.request).toHaveBeenCalledWith({
      method: 'wallet_addEthereumChain',
      params: [
        expect.objectContaining({
          chainId: ARBITRUM_SEPOLIA_HEX_CHAIN_ID,
          chainName: 'Arbitrum Sepolia',
          rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
          blockExplorerUrls: ['https://sepolia.arbiscan.io'],
        }),
      ],
    });
    expect(switchAttempts).toBe(2);
    expect(store.getSnapshot().status).toBe('connected');
  });

  it('tracks account, chain, and disconnect events', async () => {
    const provider = mockProvider({ eth_accounts: [], eth_chainId: '0x1' });
    const store = new WalletStore(provider);
    await store.initialize();

    provider.emit('accountsChanged', [ACCOUNT]);
    expect(store.getSnapshot()).toMatchObject({ status: 'wrong-chain', account: ACCOUNT });
    provider.emit('chainChanged', ARBITRUM_SEPOLIA_HEX_CHAIN_ID);
    expect(store.getSnapshot().status).toBe('connected');
    provider.emit('disconnect');
    expect(store.getSnapshot()).toMatchObject({ status: 'disconnected', account: null });
  });

  it('does not let stale account restoration overwrite accountsChanged', async () => {
    const accounts = deferred<unknown>();
    const provider = mockProvider({ eth_chainId: ARBITRUM_SEPOLIA_HEX_CHAIN_ID });
    provider.request.mockImplementation(({ method }: { method: string }) =>
      method === 'eth_accounts' ? accounts.promise : Promise.resolve(ARBITRUM_SEPOLIA_HEX_CHAIN_ID),
    );
    const store = new WalletStore(provider);

    const initializing = store.initialize();
    provider.emit('accountsChanged', [OTHER_ACCOUNT]);
    accounts.resolve([ACCOUNT]);
    await initializing;

    expect(store.getSnapshot().account).toBe(OTHER_ACCOUNT);
  });

  it('does not let a stale connect chain read overwrite chainChanged', async () => {
    const chain = deferred<unknown>();
    const provider = mockProvider({ eth_requestAccounts: [ACCOUNT] });
    let chainReads = 0;
    provider.request.mockImplementation(({ method }: { method: string }) => {
      if (method === 'eth_chainId') {
        return chainReads++ === 0 ? Promise.resolve(ARBITRUM_SEPOLIA_HEX_CHAIN_ID) : chain.promise;
      }
      return Promise.resolve([ACCOUNT]);
    });
    const store = new WalletStore(provider);

    await store.initialize();
    const connecting = store.connect();
    await vi.waitFor(() =>
      expect(provider.request).toHaveBeenCalledWith({ method: 'eth_chainId' }),
    );
    provider.emit('chainChanged', '0x1');
    chain.resolve(ARBITRUM_SEPOLIA_HEX_CHAIN_ID);
    await connecting;

    expect(store.getSnapshot()).toMatchObject({ chainId: 1, status: 'wrong-chain' });
  });

  it('removes provider listeners on cleanup', async () => {
    const provider = mockProvider({ eth_accounts: [], eth_chainId: '0x1' });
    const store = new WalletStore(provider);
    await store.initialize();

    expect(provider.listenerCount('accountsChanged')).toBe(1);
    expect(provider.listenerCount('chainChanged')).toBe(1);
    expect(provider.listenerCount('disconnect')).toBe(1);

    store.destroy();

    expect(provider.listenerCount('accountsChanged')).toBe(0);
    expect(provider.listenerCount('chainChanged')).toBe(0);
    expect(provider.listenerCount('disconnect')).toBe(0);
  });
});
