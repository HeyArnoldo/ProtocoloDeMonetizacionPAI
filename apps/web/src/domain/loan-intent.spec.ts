import { describe, expect, it, vi } from 'vitest';
import { buildLoanIntentRequest, type LoanFormValues } from './loan-intent';
import { runTransactionIntent } from '@/hooks/use-transaction-intent';
import type {
  ChainIntentClient,
  TransactionIntent,
  TransactionSubmitter,
} from '@/services/transaction-intent';
import type { Hex } from '@app/merkle';
const assetId = `0x${'1'.repeat(64)}` as Hex;
const lender = `0x${'2'.repeat(40)}` as `0x${string}`;
const form: LoanFormValues = {
  action: 'originate',
  assetId,
  lender,
  principal: '2500000',
  dueDate: '2027-01-15',
};
const proof = {
  verified: true,
  proof: [`0x${'3'.repeat(64)}`],
  proofFlags: [true],
  selectedLeaves: [
    {
      debtorHash: `0x${'4'.repeat(64)}` as Hex,
      amountMinor: 500000n,
      dueDate: 1_800_000_000,
      currency: 840 as const,
      docHash: `0x${'5'.repeat(64)}` as Hex,
    },
  ],
};
describe('buildLoanIntentRequest', () => {
  it('builds fund and repay from only the persisted asset id', () => {
    expect(buildLoanIntentRequest({ ...form, action: 'fund' }, null)).toEqual({ assetId });
    expect(buildLoanIntentRequest({ ...form, action: 'repay' }, null)).toEqual({ assetId });
  });
  it('builds structured originate input from form fields and verified disclosure', () => {
    const body = buildLoanIntentRequest(form, proof);
    expect(body).toMatchObject({ assetId, lender, principal: '2500000' });
    expect(body.receivables).toEqual([
      expect.objectContaining({ amountMinor: '500000', currency: 840 }),
    ]);
    expect(body.proof).toEqual(proof.proof);
  });
  it('rejects invalid identifiers and missing verified proof', () => {
    expect(() => buildLoanIntentRequest({ ...form, assetId: 'asset-1' }, proof)).toThrow(
      'Asset ID',
    );
    expect(() => buildLoanIntentRequest(form, null)).toThrow('verified disclosure proof');
  });
});
describe('runTransactionIntent', () => {
  const intent: TransactionIntent = { chainId: 421614, to: lender, data: '0x12', value: '0' };
  it('reports prepare and submit states with mocked boundaries', async () => {
    const client: ChainIntentClient = { prepare: vi.fn().mockResolvedValue(intent) };
    const submitter: TransactionSubmitter = {
      submit: vi.fn().mockResolvedValue(`0x${'a'.repeat(64)}`),
    };
    const states = vi.fn();
    await runTransactionIntent(client, submitter, 'fund', { assetId }, states);
    expect(states.mock.calls.map(([state]) => state.status)).toEqual([
      'preparing',
      'submitting',
      'success',
    ]);
  });
  it('reports API errors without invoking the submitter', async () => {
    const failure = new Error('API unavailable');
    const client: ChainIntentClient = { prepare: vi.fn().mockRejectedValue(failure) };
    const submitter: TransactionSubmitter = { submit: vi.fn() };
    const states = vi.fn();
    await expect(runTransactionIntent(client, submitter, 'fund', { assetId }, states)).rejects.toBe(
      failure,
    );
    expect(submitter.submit).not.toHaveBeenCalled();
    expect(states).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'error', error: failure }),
    );
  });
});
