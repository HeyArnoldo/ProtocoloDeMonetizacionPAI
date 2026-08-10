import { useCallback, useState } from 'react';
import {
  chainIntentClient,
  type ChainIntentAction,
  type ChainIntentClient,
  type TransactionIntent,
  type TransactionSubmitter,
} from '@/services/transaction-intent';

export type TransactionIntentStatus = 'idle' | 'preparing' | 'submitting' | 'success' | 'error';

export interface TransactionIntentState {
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

export async function runTransactionIntent(
  client: ChainIntentClient,
  submitter: TransactionSubmitter,
  action: ChainIntentAction,
  body: Record<string, unknown>,
  update: (state: TransactionIntentState) => void,
) {
  update({ status: 'preparing', intent: null, hash: null, error: null });
  try {
    const intent = await client.prepare(action, body);
    update({ status: 'submitting', intent, hash: null, error: null });
    const hash = await submitter.submit(intent);
    update({ status: 'success', intent, hash, error: null });
    return hash;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error('Transaction failed.');
    update({ status: 'error', intent: null, hash: null, error });
    throw error;
  }
}

export function useTransactionIntent(
  submitter: TransactionSubmitter,
  client: ChainIntentClient = chainIntentClient,
) {
  const [state, setState] = useState(INITIAL_STATE);

  const execute = useCallback(
    (action: ChainIntentAction, body: Record<string, unknown>) =>
      runTransactionIntent(client, submitter, action, body, setState),
    [client, submitter],
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);
  return { ...state, execute, reset };
}
