import { decodeFunctionData, getAddress, type Abi, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import * as evm from './index';

const address = (digit: string) => `0x${digit.repeat(40)}`;
const word = (digit: string) => `0x${digit.repeat(64)}` as Hex;
const TO = address('1');
const OTHER = address('2');
const risk: evm.RiskParams = {
  valuationDate: 1_800_000_000n,
  discountRateBps: 1_800,
  delinquencyBps: 420,
  concentrationThresholdBps: 2_500,
  concentrationPenaltyBps: 1_000,
  serviceContinuityScore: 80,
  serviceContinuityWeightBps: 1_500,
  advanceRateBps: 5_280,
};
const receivable = {
  debtorHash: word('a'),
  amountMinor: 800_000n,
  dueDate: 1_900_000_000n,
  currency: 840 as const,
  docHash: word('b'),
};
const name = (abi: Abi, request: evm.ContractIntent) =>
  decodeFunctionData({ abi, data: request.data }).functionName;

describe('transaction intents', () => {
  it('encodes unsigned state changes with decodable selectors', () => {
    // prettier-ignore
    const cases = [
      [evm.assetRegistryAbi, evm.registerAssetIntent(TO, word('a'), word('b'), word('c')), 'registerAsset'],
      [evm.certificationAttestorAbi, evm.attestIntent(TO, word('a'), 1, word('b')), 'attest'],
      [evm.certificationAttestorAbi, evm.revokeIntent(TO, word('a'), 1), 'revoke'],
      [evm.mockUSDCAbi, evm.approveIntent(TO, OTHER, 10n), 'approve'],
      [evm.collateralVaultAbi, evm.fundIntent(TO, word('a')), 'fund'],
      [evm.collateralVaultAbi, evm.repayIntent(TO, word('a')), 'repay'],
    ] as const;
    for (const [abi, request, expected] of cases) {
      expect(request).toMatchObject({ to: getAddress(TO), value: 0n });
      expect(name(abi, request)).toBe(expected);
    }
  });

  it('encodes originate and compute with validated structs', () => {
    // prettier-ignore
    const originate = evm.originateIntent(TO, {
      assetId: word('a'), lender: OTHER, principal: 400_000n, dueAt: 1_910_000_000n,
      receivables: [receivable], proof: [], proofFlags: [], params: risk,
    });
    expect(name(evm.collateralVaultAbi, originate)).toBe('originate');
    expect(name(evm.borrowingBaseEngineAbi, evm.computeIntent(TO, [receivable], risk))).toBe(
      'compute',
    );
  });

  it('encodes the read surface needed by API and UI', () => {
    // prettier-ignore
    const cases = [
      [evm.assetRegistryAbi, evm.getAssetIntent(TO, word('a')), 'getAsset'],
      [evm.certificationAttestorAbi, evm.getAttestationIntent(TO, word('a'), 0, OTHER), 'getAttestation'],
      [evm.paiCertificateAbi, evm.certificateValidIntent(TO, word('a')), 'isValid'],
      [evm.collateralVaultAbi, evm.getLoanIntent(TO, word('a')), 'getLoan'],
      [evm.mockUSDCAbi, evm.balanceOfIntent(TO, OTHER), 'balanceOf'],
      [evm.mockUSDCAbi, evm.allowanceIntent(TO, OTHER, address('3')), 'allowance'],
    ] as const;
    for (const [abi, request, expected] of cases) expect(name(abi, request)).toBe(expected);
  });

  it('rejects malformed boundary values', () => {
    expect(() => evm.fundIntent('bad', word('a'))).toThrow();
    expect(() => evm.fundIntent(TO, '0x12')).toThrow(/bytes32/);
    expect(() => evm.attestIntent(TO, word('a'), 3, word('b'))).toThrow(/kind/);
    expect(() => evm.approveIntent(TO, OTHER, -1n)).toThrow(/uint256/);
    expect(() => evm.computeIntent(TO, [{ ...receivable, currency: 999 as 840 }], risk)).toThrow(
      /currency/,
    );
    expect(() => evm.computeIntent(TO, [receivable], { ...risk, advanceRateBps: 10_001 })).toThrow(
      /advanceRateBps/,
    );
  });
});

describe('deployment metadata', () => {
  const metadata = Object.fromEntries(
    evm.contractNames.map((contract, index) => [contract, address(String(index + 1))]),
  );
  const runtimeBytecodeHashes = Object.fromEntries(
    evm.contractNames.map((contract, index) => [contract, `0x${String(index + 1).repeat(64)}`]),
  );
  it('indexes validated deployments by chainId', () => {
    const parsed = evm.parseDeployments([{ chainId: 421_614, addresses: metadata }]);
    expect(parsed[421_614]?.addresses.assetRegistry).toBe(getAddress(address('1')));
  });
  it('rejects invalid chain ids', () => {
    expect(() => evm.parseDeployments([{ chainId: 0, addresses: metadata }])).toThrow(/chainId/);
  });
  it('validates canonical live metadata including its receipt block and public roles', () => {
    const parsed = evm.parseLiveDeployment({
      chainId: 421_614,
      deploymentBlock: 296_444_399,
      addresses: metadata,
      runtimeBytecodeHashes,
      roles: {
        admin: address('a'),
        borrower: address('b'),
        lender: address('c'),
        certifiers: [address('d'), address('e'), address('f')],
      },
    });
    expect(parsed.deploymentBlock).toBe(296_444_399);
    expect(parsed.roles.certifiers).toHaveLength(3);
    expect(() => evm.parseLiveDeployment({ chainId: 421_614, addresses: metadata })).toThrow(
      /deploymentBlock/,
    );
  });
});
