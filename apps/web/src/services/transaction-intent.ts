import { api } from '@/lib/api';

export type ChainIntentAction =
  | 'register'
  | 'attest'
  | 'revoke'
  | 'approve'
  | 'originate'
  | 'fund'
  | 'repay';

export interface TransactionIntent {
  readonly chainId: number;
  readonly to: `0x${string}`;
  readonly data: `0x${string}`;
  readonly value: string;
}

interface IntentHttpClient {
  post<T>(url: string, body: unknown): Promise<{ data: T }>;
}

export interface ChainIntentClient {
  prepare(action: ChainIntentAction, body: Record<string, unknown>): Promise<TransactionIntent>;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;
const QUANTITY = /^(?:0|[1-9][0-9]*|0x[0-9a-fA-F]+)$/;

function parseIntent(value: unknown): TransactionIntent {
  const item = value as Partial<Record<keyof TransactionIntent, unknown>> | null;
  const rawChainId = item?.chainId;
  const chainId =
    typeof rawChainId === 'string' && /^0x[0-9a-fA-F]+$/.test(rawChainId)
      ? Number.parseInt(rawChainId.slice(2), 16)
      : rawChainId;

  if (
    !item ||
    !Number.isSafeInteger(chainId) ||
    Number(chainId) <= 0 ||
    typeof item.to !== 'string' ||
    !ADDRESS.test(item.to) ||
    typeof item.data !== 'string' ||
    !BYTES.test(item.data) ||
    typeof item.value !== 'string' ||
    !QUANTITY.test(item.value)
  ) {
    throw new TypeError('Malformed transaction intent returned by API.');
  }

  return {
    chainId: Number(chainId),
    to: item.to as `0x${string}`,
    data: item.data as `0x${string}`,
    value: item.value,
  };
}

export function createChainIntentClient(http: IntentHttpClient = api): ChainIntentClient {
  return {
    async prepare(action, body) {
      const { data } = await http.post<unknown>(`/chain/intents/${action}`, body);
      return parseIntent(data);
    },
  };
}

export interface TransactionSubmitter {
  submit(intent: TransactionIntent): Promise<`0x${string}`>;
}

export interface Eip1193Provider {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

function transactionValue(value: string): `0x${string}` {
  return value.startsWith('0x') ? (value as `0x${string}`) : `0x${BigInt(value).toString(16)}`;
}

export class InjectedWalletSubmitter implements TransactionSubmitter {
  constructor(
    private readonly provider: Eip1193Provider | null = null,
    private readonly account: string | null = null,
    private readonly chainId: number | null = null,
  ) {}

  async submit(intent: TransactionIntent): Promise<`0x${string}`> {
    if (!this.provider) throw new Error('No injected wallet provider is available.');

    if (!this.account || !ADDRESS.test(this.account)) {
      throw new Error('Conecta MetaMask antes de enviar una transacción.');
    }
    if (this.chainId !== intent.chainId) {
      throw new Error('Cambia a Arbitrum Sepolia antes de enviar la transacción.');
    }

    let changed = false;
    const invalidate = () => {
      changed = true;
    };
    this.provider.on?.('accountsChanged', invalidate);
    this.provider.on?.('chainChanged', invalidate);
    this.provider.on?.('disconnect', invalidate);

    let hash: unknown;
    try {
      const targetChain = `0x${intent.chainId.toString(16)}`;
      const currentChain = await this.provider.request({ method: 'eth_chainId' });
      const accounts = await this.provider.request({ method: 'eth_accounts' });
      const from = Array.isArray(accounts) ? accounts[0] : undefined;
      if (changed || currentChain !== targetChain) {
        throw new Error(
          'La red de MetaMask cambió durante la operación. Revisa la red y reintenta.',
        );
      }
      if (typeof from !== 'string' || from.toLowerCase() !== this.account.toLowerCase()) {
        throw new Error(
          'La cuenta de MetaMask cambió durante la operación. Revisa la cuenta y reintenta.',
        );
      }

      // Tras invocar al proveedor ya no se afirma que un evento pueda cancelar el envío.
      hash = await this.provider.request({
        method: 'eth_sendTransaction',
        params: [{ from, to: intent.to, data: intent.data, value: transactionValue(intent.value) }],
      });
    } finally {
      this.provider.removeListener?.('accountsChanged', invalidate);
      this.provider.removeListener?.('chainChanged', invalidate);
      this.provider.removeListener?.('disconnect', invalidate);
    }
    if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      throw new Error('Wallet returned an invalid transaction hash.');
    }
    return hash as `0x${string}`;
  }
}

export class InMemoryTransactionSubmitter implements TransactionSubmitter {
  readonly submissions: TransactionIntent[] = [];

  async submit(intent: TransactionIntent): Promise<`0x${string}`> {
    this.submissions.push(intent);
    return `0x${this.submissions.length.toString(16).padStart(64, '0')}`;
  }
}

export function injectedProvider(): Eip1193Provider | null {
  return (globalThis as typeof globalThis & { ethereum?: Eip1193Provider }).ethereum ?? null;
}

export const chainIntentClient = createChainIntentClient();
