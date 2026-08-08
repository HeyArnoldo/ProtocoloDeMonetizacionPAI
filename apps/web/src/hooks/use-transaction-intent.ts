import { useCallback, useState } from 'react';
import {
  chainIntentClient,
  type ChainIntentAction,
  type ChainIntentClient,
  type TransactionIntent,
  type TransactionSubmitter,
} from '@/services/transaction-intent';

export type TransactionIntentStatus = 'idle' | 'preparing' | 'submitting' | 'success' | 'error';

interface TransactionIntentState {
  readonly status: TransactionIntentStatus;
  readonly intent: TransactionIntent | null;
  readonly hash: `0x${string}` | null;
  readonly error: Error | null;
}

const INITIAL_STATE: TransactionIntentState = {
  status: 'idle',
  intent: null,
  hash: null,
  error: null,
};

export function useTransactionIntent(
  submitter: TransactionSubmitter,
  client: ChainIntentClient = chainIntentClient,
) {
  const [state, setState] = useState(INITIAL_STATE);

  const execute = useCallback(
    async (action: ChainIntentAction, body: Record<string, unknown>) => {
      setState({ status: 'preparing', intent: null, hash: null, error: null });
      try {
        const intent = await client.prepare(action, body);
        setState({ status: 'submitting', intent, hash: null, error: null });
        const hash = await submitter.submit(intent);
        setState({ status: 'success', intent, hash, error: null });
        return hash;
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error('Transaction failed.');
        setState({ status: 'error', intent: null, hash: null, error });
        throw error;
      }
    },
    [client, submitter],
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);
  return { ...state, execute, reset };
}
