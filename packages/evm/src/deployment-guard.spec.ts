import { describe, expect, it } from 'vitest';
import { keccak256, type Address, type Hex } from 'viem';
import {
  canonicalJson,
  createGuardToken,
  inspectFoundryArtifacts,
  parseGuardToken,
  sha256Text,
  verifyDeploymentAuthorization,
  verifyExpectedDeploymentIdentity,
  type DeploymentGuardContext,
  type ExpectedDeploymentIdentity,
  type FoundryArtifactInput,
} from './deployment-guard';

const address = (digit: string) => `0x${digit.repeat(40)}` as Address;
const bytecode = (digit: string) => `0x60${digit.repeat(2)}` as Hex;
const sha256 = (digit: string) => digit.repeat(64);
const artifact = (digit: string, compiler = '0.8.28+commit.7893614a'): FoundryArtifactInput => ({
  artifactJson: `{"contract":"${digit}"}`,
  bytecode: { object: bytecode(digit) },
  deployedBytecode: { object: bytecode(digit) },
  metadata: {
    compiler: { version: compiler },
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  },
});
const artifacts = {
  assetRegistry: artifact('1'),
  certificationAttestor: artifact('2'),
  paiCertificate: artifact('3'),
  borrowingBaseEngine: artifact('4'),
  collateralVault: artifact('5'),
  mockUsdc: artifact('6'),
} as const;
const inspected = inspectFoundryArtifacts(artifacts);
const expected: ExpectedDeploymentIdentity = {
  version: 1,
  compilerVersion: inspected.compilerVersion,
  compilerSettingsHash: inspected.compilerSettingsHash,
  sourceTreeHash: sha256('a'),
  deployScriptHash: sha256('b'),
  artifacts: inspected.artifacts,
};
const context: DeploymentGuardContext = {
  sourceCommit: sha256('c').slice(0, 40),
  sourceTreeHash: expected.sourceTreeHash,
  deployScriptPath: 'script/Deploy.s.sol:Deploy',
  deployScriptHash: expected.deployScriptHash,
  chainId: 421_614,
  roles: {
    admin: address('a'),
    borrower: address('b'),
    lender: address('c'),
    certifiers: [address('d'), address('e'), address('f')],
  },
};

describe('pre-broadcast deployment guard', () => {
  it('reproduces stale-artifact acceptance by hashing the cache, then rejects it', () => {
    const stale = { ...artifacts, assetRegistry: artifact('9') };
    expect(keccak256(bytecode('9'))).toBe(
      inspectFoundryArtifacts(stale).artifacts.assetRegistry.runtimeBytecodeHash,
    );
    expect(() => verifyExpectedDeploymentIdentity(expected, inspected, context)).not.toThrow();
    expect(() =>
      verifyExpectedDeploymentIdentity(expected, inspectFoundryArtifacts(stale), context),
    ).toThrow(/assetRegistry runtime bytecode hash mismatch/i);
  });

  it('accepts clean current artifacts and creates a short-lived non-secret token', () => {
    const now = Date.parse('2026-08-09T12:00:00.000Z');
    const authorization = createGuardToken({
      secret: new Uint8Array(32).fill(7),
      tokenId: '11'.repeat(16),
      authorizationNonce: '22'.repeat(32),
      candidateDigest: sha256('3'),
      now,
    });

    expect(authorization.expiresAt).toBe(now + 5 * 60_000);
    expect(JSON.stringify(authorization)).not.toMatch(/private|mnemonic|secret/i);
    expect(() => parseGuardToken(authorization, new Uint8Array(32).fill(7), now)).not.toThrow();
  });

  it.each([
    [
      'artifact',
      () => ({
        ...inspected,
        artifacts: inspectFoundryArtifacts({ ...artifacts, assetRegistry: artifact('9') })
          .artifacts,
      }),
    ],
    [
      'compiler',
      () =>
        inspectFoundryArtifacts({
          ...artifacts,
          assetRegistry: artifact('1', '0.8.29+commit.test'),
        }),
    ],
    ['settings', () => ({ ...inspected, compilerSettingsHash: sha256('9') })],
  ])('rejects tampered %s identity', (_name, mutate) => {
    expect(() => verifyExpectedDeploymentIdentity(expected, mutate(), context)).toThrow();
  });

  it.each([
    ['source', { ...context, sourceTreeHash: sha256('9') }],
    ['deploy script', { ...context, deployScriptHash: sha256('9') }],
    ['chain', { ...context, chainId: 31337 }],
    ['roles', { ...context, roles: { ...context.roles, admin: address('9') } }],
  ])('rejects a token when %s no longer matches', (_name, changedContext) => {
    const now = Date.parse('2026-08-09T12:00:00.000Z');
    const authorization = createGuardToken({
      secret: new Uint8Array(32).fill(7),
      tokenId: '11'.repeat(16),
      authorizationNonce: '22'.repeat(32),
      candidateDigest: sha256('3'),
      now,
    });
    expect(() =>
      verifyDeploymentAuthorization(
        authorization,
        new Uint8Array(32).fill(7),
        expected,
        inspected,
        changedContext,
        now,
      ),
    ).toThrow();
  });

  it('rejects tampered and expired tokens', () => {
    const now = Date.parse('2026-08-09T12:00:00.000Z');
    const secret = new Uint8Array(32).fill(7);
    const authorization = createGuardToken({
      secret,
      tokenId: '11'.repeat(16),
      authorizationNonce: '22'.repeat(32),
      candidateDigest: sha256('3'),
      now,
    });
    expect(() =>
      parseGuardToken({ ...authorization, candidateDigest: sha256('4') }, secret, now),
    ).toThrow(/token/i);
    expect(() => parseGuardToken(authorization, secret, now + 5 * 60_000 + 1)).toThrow(/expired/i);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    'rejects malformed expiresAt %s without a NaN bypass',
    (expiresAt) => {
      const now = Date.parse('2026-08-09T12:00:00.000Z');
      const secret = new Uint8Array(32).fill(7);
      const authorization = createGuardToken({
        secret,
        tokenId: '11'.repeat(16),
        authorizationNonce: '22'.repeat(32),
        candidateDigest: sha256('3'),
        now,
      });
      expect(() => parseGuardToken({ ...authorization, expiresAt }, secret, now)).toThrow();
    },
  );

  it('rejects unknown token fields', () => {
    const now = Date.parse('2026-08-09T12:00:00.000Z');
    const secret = new Uint8Array(32).fill(7);
    const authorization = createGuardToken({
      secret,
      tokenId: '11'.repeat(16),
      authorizationNonce: '22'.repeat(32),
      candidateDigest: sha256('3'),
      now,
    });
    expect(() => parseGuardToken({ ...authorization, bypass: true }, secret, now)).toThrow(
      /unknown/i,
    );
  });

  it('rejects a token forged with an unkeyed SHA-256 digest', () => {
    const now = Date.parse('2026-08-09T12:00:00.000Z');
    const secret = new Uint8Array(32).fill(7);
    const authorization = createGuardToken({
      secret,
      tokenId: '11'.repeat(16),
      authorizationNonce: '22'.repeat(32),
      candidateDigest: sha256('3'),
      now,
    });
    const { tag: _tag, ...body } = authorization;
    expect(() =>
      parseGuardToken({ ...body, tag: sha256Text(canonicalJson(body)) }, secret, now),
    ).toThrow(/hmac/i);
  });
});
