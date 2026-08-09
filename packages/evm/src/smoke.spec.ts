import { createHash } from 'node:crypto';
import { buildTree, hashDebtor, hashLeaf } from '@app/merkle';
import { decodeFunctionData } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { assetRegistryAbi, collateralVaultAbi, mockUSDCAbi } from './generated/abis';
import { safeErrorLine } from './operational-error';
import {
  buildDemoFixture,
  buildDemoPlan,
  DEMO_DEBTOR_SALT,
  deriveRoleAccounts,
  validateSmokeConfig,
  verifyDemoReadback,
} from './smoke';

const mnemonic = 'test test test test test test test test test test test junk';
const address = (digit: string) => `0x${digit.repeat(40)}`;
const valuationDate = 1_767_225_600n;

describe('testnet smoke safety boundary', () => {
  it('derives borrower, lender, and certifiers from fixed account indexes', () => {
    const accounts = deriveRoleAccounts(mnemonic);
    expect(accounts.admin.address).toBe(mnemonicToAccount(mnemonic, { accountIndex: 0 }).address);
    expect(accounts.borrower.address).toBe(
      mnemonicToAccount(mnemonic, { accountIndex: 1 }).address,
    );
    expect(accounts.lender.address).toBe(mnemonicToAccount(mnemonic, { accountIndex: 2 }).address);
    expect(accounts.certifiers.map((account) => account.address)).toEqual(
      [3, 4, 5].map((accountIndex) => mnemonicToAccount(mnemonic, { accountIndex }).address),
    );
  });

  it('rejects metadata whose public roles do not match the mnemonic', () => {
    const accounts = deriveRoleAccounts(mnemonic);
    expect(() =>
      validateSmokeConfig(
        {
          chainId: 421_614,
          deploymentBlock: 1,
          addresses: Object.fromEntries(
            [
              'assetRegistry',
              'certificationAttestor',
              'paiCertificate',
              'borrowingBaseEngine',
              'collateralVault',
              'mockUsdc',
            ].map((name, index) => [name, address(String(index + 1))]),
          ),
          roles: {
            admin: accounts.admin.address,
            borrower: address('9'),
            lender: accounts.lender.address,
            certifiers: accounts.certifiers.map((account) => account.address),
          },
        },
        accounts,
      ),
    ).toThrow(/borrower/);
  });

  it('builds the complete deterministic lifecycle without sending transactions', () => {
    const accounts = deriveRoleAccounts(mnemonic);
    const deployment = validateSmokeConfig(
      {
        chainId: 421_614,
        deploymentBlock: 1,
        addresses: Object.fromEntries(
          [
            'assetRegistry',
            'certificationAttestor',
            'paiCertificate',
            'borrowingBaseEngine',
            'collateralVault',
            'mockUsdc',
          ].map((name, index) => [name, address(String(index + 1))]),
        ),
        roles: {
          admin: accounts.admin.address,
          borrower: accounts.borrower.address,
          lender: accounts.lender.address,
          certifiers: accounts.certifiers.map((account) => account.address),
        },
      },
      accounts,
    );

    const plan = buildDemoPlan(deployment, accounts, valuationDate);

    expect(plan.transactions.map((step) => step.action)).toEqual([
      'register',
      'attest-revenue',
      'attest-rights',
      'attest-service',
      'originate',
      'mint-lender',
      'approve-funding',
      'fund',
      'approve-repayment',
      'repay',
    ]);
    expect(plan.transactions).toHaveLength(10);
    expect(plan.transactions.every((step) => step.intent.value === 0n)).toBe(true);
    expect(
      decodeFunctionData({ abi: mockUSDCAbi, data: plan.transactions[5]!.intent.data })
        .functionName,
    ).toBe('mint');
    expect(
      decodeFunctionData({ abi: collateralVaultAbi, data: plan.transactions[9]!.intent.data })
        .functionName,
    ).toBe('repay');
    expect(plan.readback).toEqual({
      assetStatus: 4,
      loanState: 2,
      certificateValid: true,
      borrowerBalance: 0n,
      lenderBalance: 1_000_000n,
      vaultBalance: 0n,
    });
    expect(() => verifyDemoReadback(plan.readback, plan.readback)).not.toThrow();
    expect(() => verifyDemoReadback({ ...plan.readback, assetStatus: 1 }, plan.readback)).toThrow(
      /assetStatus/,
    );
  });

  it('uses the canonical salted debtor, SHA-256 document, and Merkle leaf', () => {
    const fixture = buildDemoFixture(valuationDate);
    const expectedDocHash = `0x${createHash('sha256').update('pai-demo-document').digest('hex')}`;
    expect(fixture.receivable.debtorHash).toBe(hashDebtor('20512345678', DEMO_DEBTOR_SALT));
    expect(fixture.receivable.docHash).toBe(expectedDocHash);
    expect(fixture.merkleRoot).toBe(buildTree([fixture.receivable]).root);
    expect(fixture.merkleRoot).toBe(hashLeaf(fixture.receivable));

    const accounts = deriveRoleAccounts(mnemonic);
    const deployment = validateSmokeConfig(
      {
        chainId: 421_614,
        deploymentBlock: 1,
        addresses: Object.fromEntries(
          [
            'assetRegistry',
            'certificationAttestor',
            'paiCertificate',
            'borrowingBaseEngine',
            'collateralVault',
            'mockUsdc',
          ].map((name, index) => [name, address(String(index + 1))]),
        ),
        roles: {
          admin: accounts.admin.address,
          borrower: accounts.borrower.address,
          lender: accounts.lender.address,
          certifiers: accounts.certifiers.map((account) => account.address),
        },
      },
      accounts,
    );
    const register = decodeFunctionData({
      abi: assetRegistryAbi,
      data: buildDemoPlan(deployment, accounts, valuationDate).transactions[0]!.intent.data,
    });
    expect(register.args[1]).toBe(fixture.merkleRoot);
  });

  it('never includes RPC URL secrets in operational output', () => {
    const sentinel = 'SENTINEL_RPC_SECRET_7f3a';
    const unsafe = new Error(
      `HTTP request failed: https://rpc.example.invalid/private/${sentinel}?apiKey=${sentinel}`,
    );
    const outputs = {
      stdout: '',
      stderr: safeErrorLine('rpc-preflight', unsafe),
      error: safeErrorLine('rpc-preflight', unsafe),
    };
    expect(JSON.stringify(outputs)).not.toContain(sentinel);
    expect(outputs.stderr).toBe(
      '{"code":"SMOKE_PREFLIGHT_FAILED","operation":"rpc-preflight","reason":"RPC_FAILURE"}',
    );
  });
});
