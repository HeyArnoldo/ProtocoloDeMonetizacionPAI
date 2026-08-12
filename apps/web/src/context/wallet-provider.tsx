import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { injectedProvider, type Eip1193Provider } from '@/services/transaction-intent';

export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614;
export const ARBITRUM_SEPOLIA_HEX_CHAIN_ID = '0x66eee';

export type WalletStatus =
  | 'unavailable'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'wrong-chain'
  | 'error';

export interface WalletSnapshot {
  readonly status: WalletStatus;
  readonly provider: Eip1193Provider | null;
  readonly account: string | null;
  readonly chainId: number | null;
  readonly error: string | null;
}

const ARBITRUM_SEPOLIA = {
  chainId: ARBITRUM_SEPOLIA_HEX_CHAIN_ID,
  chainName: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
  blockExplorerUrls: ['https://sepolia.arbiscan.io'],
} as const;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function errorCode(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? Number((error as { code: unknown }).code)
    : undefined;
}

function walletError(error: unknown, action: 'connect' | 'switch'): string {
  if (errorCode(error) === 4001) {
    return action === 'connect'
      ? 'Rechazaste la conexión en MetaMask. Vuelve a intentarlo cuando estés listo.'
      : 'Rechazaste el cambio de red. Selecciona Arbitrum Sepolia para continuar.';
  }
  return action === 'connect'
    ? 'MetaMask no pudo conectar la cuenta. Abre la extensión e inténtalo otra vez.'
    : 'No se pudo cambiar a Arbitrum Sepolia. Revisa MetaMask e inténtalo otra vez.';
}

function accountFrom(value: unknown): string | null {
  const account = Array.isArray(value) ? value[0] : null;
  return typeof account === 'string' && ADDRESS.test(account) ? account : null;
}

function chainFrom(value: unknown): number | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) return null;
  const chainId = Number.parseInt(value.slice(2), 16);
  return Number.isSafeInteger(chainId) ? chainId : null;
}

export class WalletStore {
  private snapshot: WalletSnapshot;
  private readonly listeners = new Set<() => void>();
  private listening = false;
  private generation = 0;

  constructor(private readonly provider: Eip1193Provider | null) {
    this.snapshot = {
      status: provider ? 'disconnected' : 'unavailable',
      provider,
      account: null,
      chainId: null,
      error: null,
    };
  }

  readonly getSnapshot = (): WalletSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async initialize(): Promise<void> {
    if (!this.provider) return;
    this.listen();
    await this.refresh();
  }

  async connect(): Promise<void> {
    if (!this.provider) return;
    const generation = ++this.generation;
    this.update({ ...this.snapshot, status: 'connecting', error: null });
    try {
      const accounts = await this.provider.request({ method: 'eth_requestAccounts' });
      const chainId = await this.provider.request({ method: 'eth_chainId' });
      if (generation !== this.generation) return;
      this.setConnection(accountFrom(accounts), chainFrom(chainId));
    } catch (error) {
      if (generation !== this.generation) return;
      this.update({ ...this.snapshot, status: 'error', error: walletError(error, 'connect') });
    }
  }

  async switchNetwork(): Promise<void> {
    if (!this.provider) return;
    const generation = ++this.generation;
    this.update({ ...this.snapshot, status: 'connecting', error: null });
    try {
      try {
        await this.provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ARBITRUM_SEPOLIA_HEX_CHAIN_ID }],
        });
      } catch (error) {
        if (errorCode(error) !== 4902) throw error;
        await this.provider.request({
          method: 'wallet_addEthereumChain',
          params: [ARBITRUM_SEPOLIA],
        });
        await this.provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ARBITRUM_SEPOLIA_HEX_CHAIN_ID }],
        });
      }
      if (generation === this.generation) await this.refresh();
    } catch (error) {
      if (generation !== this.generation) return;
      this.update({ ...this.snapshot, status: 'error', error: walletError(error, 'switch') });
    }
  }

  destroy(): void {
    if (!this.provider || !this.listening) return;
    this.provider.removeListener?.('accountsChanged', this.handleAccountsChanged);
    this.provider.removeListener?.('chainChanged', this.handleChainChanged);
    this.provider.removeListener?.('disconnect', this.handleDisconnect);
    this.listening = false;
  }

  private listen(): void {
    if (!this.provider || this.listening) return;
    this.provider.on?.('accountsChanged', this.handleAccountsChanged);
    this.provider.on?.('chainChanged', this.handleChainChanged);
    this.provider.on?.('disconnect', this.handleDisconnect);
    this.listening = true;
  }

  private async refresh(): Promise<void> {
    if (!this.provider) return;
    const generation = ++this.generation;
    try {
      const accounts = await this.provider.request({ method: 'eth_accounts' });
      const chainId = await this.provider.request({ method: 'eth_chainId' });
      if (generation !== this.generation) return;
      this.setConnection(accountFrom(accounts), chainFrom(chainId));
    } catch {
      if (generation !== this.generation) return;
      this.update({
        ...this.snapshot,
        status: 'error',
        error: 'MetaMask no pudo leer la cuenta o la red actual. Abre la extensión y reintenta.',
      });
    }
  }

  private readonly handleAccountsChanged = (accounts: unknown): void => {
    this.generation++;
    this.setConnection(accountFrom(accounts), this.snapshot.chainId);
  };

  private readonly handleChainChanged = (chainId: unknown): void => {
    this.generation++;
    this.setConnection(this.snapshot.account, chainFrom(chainId));
  };

  private readonly handleDisconnect = (): void => {
    this.generation++;
    this.update({ ...this.snapshot, status: 'disconnected', account: null, error: null });
  };

  private setConnection(account: string | null, chainId: number | null): void {
    const status: WalletStatus = !account
      ? 'disconnected'
      : chainId === ARBITRUM_SEPOLIA_CHAIN_ID
        ? 'connected'
        : 'wrong-chain';
    this.update({ provider: this.provider, account, chainId, status, error: null });
  }

  private update(snapshot: WalletSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}

interface WalletContextValue extends WalletSnapshot {
  connect(): Promise<void>;
  switchNetwork(): Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new WalletStore(injectedProvider()));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    void store.initialize();
    return () => store.destroy();
  }, [store]);

  return (
    <WalletContext.Provider
      value={{
        ...snapshot,
        connect: () => store.connect(),
        switchNetwork: () => store.switchNetwork(),
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

// El hook comparte el contexto privado con su proveedor; separarlo solo ocultaría esa relación.
// eslint-disable-next-line react-refresh/only-export-components
export function useWallet(): WalletContextValue {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error('useWallet must be used within WalletProvider.');
  return wallet;
}
