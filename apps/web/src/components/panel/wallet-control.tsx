import { AlertTriangle, Check, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/context/wallet-provider';

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletControl() {
  const wallet = useWallet();
  const busy = wallet.status === 'connecting';

  if (wallet.status === 'connected' && wallet.account) {
    return (
      <div
        className="border-ink-800 bg-card flex min-h-11 flex-none items-center gap-2 rounded-md border px-3 lg:min-h-8"
        aria-label={`MetaMask conectada: ${wallet.account}, Arbitrum Sepolia`}
      >
        <Check className="text-primary size-3.5" aria-hidden="true" />
        <span className="mono text-[11px]">{shortAddress(wallet.account)}</span>
      </div>
    );
  }

  const wrongChain = wallet.status === 'wrong-chain';
  const unavailable = wallet.status === 'unavailable';
  const label = unavailable
    ? 'MetaMask no disponible'
    : wrongChain
      ? 'Cambiar red'
      : busy
        ? 'Conectando…'
        : 'Conectar MetaMask';

  return (
    <div className="flex min-w-0 flex-none flex-col items-end gap-1" aria-live="polite">
      <Button
        type="button"
        size="sm"
        variant={wrongChain ? 'destructive' : 'outline'}
        onClick={() => void (wrongChain ? wallet.switchNetwork() : wallet.connect())}
        disabled={busy || unavailable}
        aria-label={wrongChain ? 'Cambiar MetaMask a Arbitrum Sepolia' : label}
      >
        {wrongChain ? (
          <AlertTriangle className="size-3.5" aria-hidden="true" />
        ) : (
          <WalletCards className="size-3.5" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{label}</span>
      </Button>
      {wallet.error ? (
        <span
          role="alert"
          className="text-destructive max-w-56 text-right text-[10px] leading-tight"
        >
          {wallet.error}
        </span>
      ) : wrongChain ? (
        <span className="text-destructive hidden text-[10px] sm:block">Red incorrecta</span>
      ) : null}
    </div>
  );
}
