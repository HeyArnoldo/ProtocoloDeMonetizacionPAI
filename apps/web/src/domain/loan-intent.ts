import { buildBorrowingBaseParams, currentValuationDate } from './borrowing-base';
import type { ReceivableLeaf } from '@app/merkle';
export type LoanAction = 'originate' | 'fund' | 'repay';
export interface LoanFormValues {
  action: LoanAction;
  assetId: string;
  lender: string;
  principal: string;
  dueDate: string;
}
export interface OriginationProof {
  verified: boolean;
  proof: string[];
  proofFlags: boolean[];
  selectedLeaves: ReceivableLeaf[];
}
const BYTES32 = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
export function buildLoanIntentRequest(
  form: LoanFormValues,
  disclosure: OriginationProof | null,
): Record<string, unknown> {
  if (!BYTES32.test(form.assetId)) throw new Error('Asset ID must be a lowercase bytes32 value.');
  if (form.action !== 'originate') return { assetId: form.assetId };
  if (!ADDRESS.test(form.lender)) throw new Error('Lender must be a lowercase wallet address.');
  if (!POSITIVE_INTEGER.test(form.principal)) {
    throw new Error('Principal must be a positive integer in minor units.');
  }
  const dueAt = Date.parse(`${form.dueDate}T00:00:00.000Z`) / 1000;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate) || !Number.isInteger(dueAt)) {
    throw new Error('Due date must use YYYY-MM-DD.');
  }
  if (!disclosure?.verified || disclosure.selectedLeaves.length === 0) {
    throw new Error('Origination requires a verified disclosure proof.');
  }
  return {
    assetId: form.assetId,
    lender: form.lender,
    principal: form.principal,
    dueAt: String(dueAt),
    receivables: disclosure.selectedLeaves.map((leaf) => ({
      ...leaf,
      amountMinor: leaf.amountMinor.toString(),
      dueDate: String(leaf.dueDate),
    })),
    proof: disclosure.proof,
    proofFlags: disclosure.proofFlags,
    params: buildBorrowingBaseParams(currentValuationDate()),
  };
}
