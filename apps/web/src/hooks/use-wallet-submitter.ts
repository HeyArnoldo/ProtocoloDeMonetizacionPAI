import { useWallet } from '@/context/wallet-provider';
import { InjectedWalletSubmitter } from '@/services/transaction-intent';

export function useWalletSubmitter(): InjectedWalletSubmitter {
  const { provider, account, chainId } = useWallet();
  return new InjectedWalletSubmitter(provider, account, chainId);
}
