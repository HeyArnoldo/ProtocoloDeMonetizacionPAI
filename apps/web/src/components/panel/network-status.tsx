import { useChainStatus } from '@/hooks/use-chain-status';
import { networkStatusView, type NetworkStatusState } from '@/domain/network-status';
import { cn } from '@/lib/utils';

export function NetworkStatus() {
  const query = useChainStatus();
  const state: NetworkStatusState = query.isPending
    ? { state: 'loading' }
    : query.data
      ? { state: 'ready', data: query.data }
      : { state: 'error' };

  return <NetworkStatusContent state={state} />;
}

export function NetworkStatusContent({ state }: { state: NetworkStatusState }) {
  const view = networkStatusView(state);

  return (
    <div role="status" className="bg-card flex flex-col gap-1.5 rounded-md p-2.5">
      <div className="text-ink-300 flex items-center gap-1.5 text-[11px] font-medium">
        <span
          className={cn(
            'size-1.5 rounded-full',
            view.tone === 'loading'
              ? 'bg-ink-600 animate-pulse'
              : view.tone === 'live'
                ? 'bg-emerald-400 animate-pulse'
                : view.tone === 'warning'
                  ? 'bg-amber-400'
                  : 'bg-ink-600',
          )}
          aria-hidden="true"
        />
        {view.label}
      </div>
      <p className="text-muted-foreground text-[10px] leading-snug">{view.detail}</p>
      <p className="text-ink-400 text-[10px] leading-snug">{view.metric}</p>
    </div>
  );
}
