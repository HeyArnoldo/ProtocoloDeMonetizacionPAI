import { buildTree, CURRENCY, hashDebtor, type Hex, type ReceivableLeaf } from '@app/merkle';
import { sha256 } from 'ethereum-cryptography/sha256';
import { toHex, utf8ToBytes } from 'ethereum-cryptography/utils';
import { getAddress, keccak256, stringToHex, type Address } from 'viem';
import { mnemonicToAccount, type HDAccount } from 'viem/accounts';
import { parseLiveDeployment, type LiveDeployment } from './deployments';
import {
  approveIntent,
  attestIntent,
  fundIntent,
  mintIntent,
  originateIntent,
  registerAssetIntent,
  repayIntent,
  type ContractIntent,
  type ReceivableInput,
} from './intents';

export interface SmokeAccounts {
  readonly admin: HDAccount;
  readonly borrower: HDAccount;
  readonly lender: HDAccount;
  readonly certifiers: readonly [HDAccount, HDAccount, HDAccount];
}
export interface SmokeStep {
  readonly action: string;
  readonly signer:
    | 'borrower'
    | 'lender'
    | 'certifier-revenue'
    | 'certifier-rights'
    | 'certifier-service';
  readonly signerAddress: Address;
  readonly intent: ContractIntent;
}
export interface DemoReadback {
  readonly assetStatus: number;
  readonly loanState: number;
  readonly certificateValid: boolean;
  readonly borrowerBalance: bigint;
  readonly lenderBalance: bigint;
  readonly vaultBalance: bigint;
}
export interface DemoPlan {
  readonly transactions: readonly SmokeStep[];
  readonly readback: DemoReadback;
}
export interface DemoFixture {
  readonly receivable: ReceivableLeaf;
  readonly merkleRoot: Hex;
}

export const DEMO_ASSET_ID = keccak256(stringToHex('pai-arbitrum-sepolia-demo-v1'));
export const DEMO_PRINCIPAL = 400_000n;
export const DEMO_DEBTOR_SALT = `0x${'a5'.repeat(32)}` as Hex;
const DEMO_READBACK: DemoReadback = Object.freeze({
  assetStatus: 4,
  loanState: 2,
  certificateValid: true,
  borrowerBalance: 0n,
  lenderBalance: 1_000_000n,
  vaultBalance: 0n,
});

export function deriveRoleAccounts(mnemonic: string): SmokeAccounts {
  if (mnemonic.trim().split(/\s+/).length < 12)
    throw new TypeError('DEMO_ROLE_MNEMONIC is invalid.');
  const accounts = Array.from({ length: 6 }, (_, accountIndex) =>
    mnemonicToAccount(mnemonic, { accountIndex }),
  );
  return Object.freeze({
    admin: accounts[0]!,
    borrower: accounts[1]!,
    lender: accounts[2]!,
    certifiers: Object.freeze([accounts[3]!, accounts[4]!, accounts[5]!] as const),
  });
}

export function validateSmokeConfig(value: unknown, accounts: SmokeAccounts): LiveDeployment {
  const deployment = parseLiveDeployment(value);
  if (deployment.chainId !== 421_614)
    throw new RangeError('Smoke is restricted to chainId 421614.');
  const expected = {
    admin: accounts.admin.address,
    borrower: accounts.borrower.address,
    lender: accounts.lender.address,
  };
  for (const [role, address] of Object.entries(expected)) {
    if (deployment.roles[role as keyof typeof expected] !== getAddress(address)) {
      throw new Error(`Derived ${role} does not match canonical deployment metadata.`);
    }
  }
  deployment.roles.certifiers.forEach((address, index) => {
    if (address !== getAddress(accounts.certifiers[index]!.address)) {
      throw new Error(`Derived certifier ${index} does not match canonical deployment metadata.`);
    }
  });
  return deployment;
}

export function buildDemoFixture(valuationDate: bigint): DemoFixture {
  const dueDate = valuationDate + 30n * 86_400n;
  if (dueDate > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Demo dueDate is too large.');
  const receivable: ReceivableLeaf = {
    debtorHash: hashDebtor('20512345678', DEMO_DEBTOR_SALT),
    amountMinor: 1_000_000n,
    dueDate: Number(dueDate),
    currency: CURRENCY.USD,
    docHash: `0x${toHex(sha256(utf8ToBytes('pai-demo-document')))}`,
  };
  return Object.freeze({
    receivable: Object.freeze(receivable),
    merkleRoot: buildTree([receivable]).root,
  });
}

export function verifyDemoReadback(actual: DemoReadback, expected: DemoReadback): void {
  for (const field of Object.keys(expected) as Array<keyof DemoReadback>) {
    if (actual[field] !== expected[field]) {
      throw new Error(`Demo readback mismatch: ${field}.`);
    }
  }
}

export function buildDemoPlan(
  deployment: LiveDeployment,
  accounts: SmokeAccounts,
  valuationDate: bigint,
): DemoPlan {
  const fixture = buildDemoFixture(valuationDate);
  const receivable: ReceivableInput = {
    ...fixture.receivable,
    dueDate: BigInt(fixture.receivable.dueDate),
  };
  const ownerIdHash = keccak256(stringToHex('pai-demo-owner'));
  const dueAt = valuationDate + 30n * 86_400n;
  const { addresses } = deployment;
  const step = (
    action: string,
    signer: SmokeStep['signer'],
    signerAddress: Address,
    intent: ContractIntent,
  ): SmokeStep => ({ action, signer, signerAddress, intent });
  const transactions = Object.freeze([
    step(
      'register',
      'borrower',
      accounts.borrower.address,
      registerAssetIntent(addresses.assetRegistry, DEMO_ASSET_ID, fixture.merkleRoot, ownerIdHash),
    ),
    ...accounts.certifiers.map((account, kind) =>
      step(
        ['attest-revenue', 'attest-rights', 'attest-service'][kind]!,
        ['certifier-revenue', 'certifier-rights', 'certifier-service'][kind] as SmokeStep['signer'],
        account.address,
        attestIntent(
          addresses.certificationAttestor,
          DEMO_ASSET_ID,
          kind,
          keccak256(stringToHex(`pai-demo-certificate-${kind}`)),
        ),
      ),
    ),
    step(
      'originate',
      'borrower',
      accounts.borrower.address,
      originateIntent(addresses.collateralVault, {
        assetId: DEMO_ASSET_ID,
        lender: accounts.lender.address,
        principal: DEMO_PRINCIPAL,
        dueAt,
        receivables: [receivable],
        proof: [],
        proofFlags: [],
        params: {
          valuationDate,
          discountRateBps: 0,
          delinquencyBps: 0,
          concentrationThresholdBps: 10_000,
          concentrationPenaltyBps: 0,
          serviceContinuityScore: 100,
          serviceContinuityWeightBps: 0,
          advanceRateBps: 5_000,
        },
      }),
    ),
    step(
      'mint-lender',
      'lender',
      accounts.lender.address,
      mintIntent(addresses.mockUsdc, accounts.lender.address, 1_000_000n),
    ),
    step(
      'approve-funding',
      'lender',
      accounts.lender.address,
      approveIntent(addresses.mockUsdc, addresses.collateralVault, DEMO_PRINCIPAL),
    ),
    step(
      'fund',
      'lender',
      accounts.lender.address,
      fundIntent(addresses.collateralVault, DEMO_ASSET_ID),
    ),
    step(
      'approve-repayment',
      'borrower',
      accounts.borrower.address,
      approveIntent(addresses.mockUsdc, addresses.collateralVault, DEMO_PRINCIPAL),
    ),
    step(
      'repay',
      'borrower',
      accounts.borrower.address,
      repayIntent(addresses.collateralVault, DEMO_ASSET_ID),
    ),
  ]);
  return Object.freeze({ transactions, readback: DEMO_READBACK });
}
