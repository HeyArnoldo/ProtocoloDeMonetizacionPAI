import { encodeFunctionData, getAddress, type Abi, type Address, type Hex } from 'viem';
import * as abis from './generated/abis';

export interface ContractIntent {
  readonly to: Address;
  readonly data: Hex;
  readonly value: 0n;
}
export interface ReceivableInput {
  readonly debtorHash: Hex;
  readonly amountMinor: bigint;
  readonly dueDate: bigint;
  readonly currency: 604 | 840;
  readonly docHash: Hex;
}
export interface RiskParams {
  readonly valuationDate: bigint;
  readonly discountRateBps: number;
  readonly delinquencyBps: number;
  readonly concentrationThresholdBps: number;
  readonly concentrationPenaltyBps: number;
  readonly serviceContinuityScore: number;
  readonly serviceContinuityWeightBps: number;
  readonly advanceRateBps: number;
}

const bytes32 = (value: Hex, field: string): Hex => {
  if (!/^0x[\da-fA-F]{64}$/.test(value)) throw new TypeError(`${field} must be bytes32.`);
  return value;
};
const uint = (value: bigint, bits: number, field: string, zero = false): bigint => {
  if (typeof value !== 'bigint' || value < (zero ? 0n : 1n) || value >= 1n << BigInt(bits)) {
    throw new RangeError(`${field} must fit uint${bits}.`);
  }
  return value;
};
const bounded = (value: number, max: number, field: string): number => {
  if (!Number.isInteger(value) || value < 0 || value > max)
    throw new RangeError(`${field} must be 0..${max}.`);
  return value;
};
const kind = (value: number): number => bounded(value, 2, 'kind');
const address = (value: string): Address => getAddress(value);
const bpsFields = [
  'discountRateBps',
  'delinquencyBps',
  'concentrationThresholdBps',
  'concentrationPenaltyBps',
  'serviceContinuityWeightBps',
  'advanceRateBps',
] as const;
const params = (value: RiskParams) => {
  const result = { ...value, valuationDate: uint(value.valuationDate, 64, 'valuationDate') };
  for (const field of bpsFields) result[field] = bounded(value[field], 10_000, field);
  result.serviceContinuityScore = bounded(
    value.serviceContinuityScore,
    100,
    'serviceContinuityScore',
  );
  return result;
};
const leaves = (values: readonly ReceivableInput[]) => {
  if (values.length === 0) throw new RangeError('receivables must not be empty.');
  return values.map((leaf, index) => {
    if (leaf.currency !== 604 && leaf.currency !== 840)
      throw new RangeError('currency must be 604 or 840.');
    return {
      debtorHash: bytes32(leaf.debtorHash, `receivables[${index}].debtorHash`),
      amountMinor: uint(leaf.amountMinor, 128, `receivables[${index}].amountMinor`),
      dueDate: uint(leaf.dueDate, 64, `receivables[${index}].dueDate`),
      currency: leaf.currency,
      docHash: bytes32(leaf.docHash, `receivables[${index}].docHash`),
    };
  });
};
const intent = (
  to: string,
  abi: Abi,
  functionName: string,
  args: readonly unknown[],
): ContractIntent => ({
  to: address(to),
  data: encodeFunctionData({ abi, functionName, args }),
  value: 0n,
});
const assetIntent = (to: string, abi: Abi, functionName: string, assetId: Hex) =>
  intent(to, abi, functionName, [bytes32(assetId, 'assetId')]);

export const registerAssetIntent = (to: string, assetId: Hex, merkleRoot: Hex, ownerIdHash: Hex) =>
  intent(to, abis.assetRegistryAbi, 'registerAsset', [
    bytes32(assetId, 'assetId'),
    bytes32(merkleRoot, 'merkleRoot'),
    bytes32(ownerIdHash, 'ownerIdHash'),
  ]);
export const attestIntent = (
  to: string,
  assetId: Hex,
  attestationKind: number,
  certificateHash: Hex,
) =>
  intent(to, abis.certificationAttestorAbi, 'attest', [
    bytes32(assetId, 'assetId'),
    kind(attestationKind),
    bytes32(certificateHash, 'certificateHash'),
  ]);
export const revokeIntent = (to: string, assetId: Hex, attestationKind: number) =>
  intent(to, abis.certificationAttestorAbi, 'revoke', [
    bytes32(assetId, 'assetId'),
    kind(attestationKind),
  ]);
export const approveIntent = (to: string, spender: string, amount: bigint) =>
  intent(to, abis.mockUSDCAbi, 'approve', [address(spender), uint(amount, 256, 'amount', true)]);
export const fundIntent = (to: string, assetId: Hex) =>
  assetIntent(to, abis.collateralVaultAbi, 'fund', assetId);
export const repayIntent = (to: string, assetId: Hex) =>
  assetIntent(to, abis.collateralVaultAbi, 'repay', assetId);

export interface OriginateInput {
  readonly assetId: Hex;
  readonly lender: string;
  readonly principal: bigint;
  readonly dueAt: bigint;
  readonly receivables: readonly ReceivableInput[];
  readonly proof: readonly Hex[];
  readonly proofFlags: readonly boolean[];
  readonly params: RiskParams;
}
export const originateIntent = (to: string, input: OriginateInput) => {
  const receivables = leaves(input.receivables);
  if (receivables.some((leaf) => leaf.currency !== 840))
    throw new RangeError('Loan currency must be 840.');
  if (input.proof.length + receivables.length !== input.proofFlags.length + 1)
    throw new RangeError('Invalid multiproof shape.');
  return intent(to, abis.collateralVaultAbi, 'originate', [
    bytes32(input.assetId, 'assetId'),
    address(input.lender),
    uint(input.principal, 128, 'principal'),
    uint(input.dueAt, 64, 'dueAt'),
    receivables,
    input.proof.map((item, index) => bytes32(item, `proof[${index}]`)),
    input.proofFlags,
    params(input.params),
  ]);
};

export const getAssetIntent = (to: string, assetId: Hex) =>
  assetIntent(to, abis.assetRegistryAbi, 'getAsset', assetId);
export const getAttestationIntent = (
  to: string,
  assetId: Hex,
  attestationKind: number,
  certifier: string,
) =>
  intent(to, abis.certificationAttestorAbi, 'getAttestation', [
    bytes32(assetId, 'assetId'),
    kind(attestationKind),
    address(certifier),
  ]);
export const certificateValidIntent = (to: string, assetId: Hex) =>
  assetIntent(to, abis.paiCertificateAbi, 'isValid', assetId);
export const getLoanIntent = (to: string, assetId: Hex) =>
  assetIntent(to, abis.collateralVaultAbi, 'getLoan', assetId);
export const balanceOfIntent = (to: string, account: string) =>
  intent(to, abis.mockUSDCAbi, 'balanceOf', [address(account)]);
export const allowanceIntent = (to: string, owner: string, spender: string) =>
  intent(to, abis.mockUSDCAbi, 'allowance', [address(owner), address(spender)]);
export const computeIntent = (to: string, values: readonly ReceivableInput[], risk: RiskParams) =>
  intent(to, abis.borrowingBaseEngineAbi, 'compute', [
    leaves(values).map(({ docHash: _, ...leaf }) => ({
      ...leaf,
      amountMinor: uint(leaf.amountMinor, 128, 'amountMinor'),
    })),
    params(risk),
  ]);
