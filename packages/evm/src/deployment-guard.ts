import { createHmac, timingSafeEqual } from 'node:crypto';
import { sha256 } from 'ethereum-cryptography/sha256';
import { toHex, utf8ToBytes } from 'ethereum-cryptography/utils';
import { getAddress, keccak256, type Address, type Hex } from 'viem';
import { contractNames, type ContractName, type DeploymentRoles } from './deployments';

export interface FoundryArtifactInput {
  readonly artifactJson: string;
  readonly bytecode?: { readonly object?: unknown };
  readonly deployedBytecode?: { readonly object?: unknown };
  readonly metadata?: {
    readonly compiler?: { readonly version?: unknown };
    readonly settings?: unknown;
  };
}

export interface ArtifactIdentity {
  readonly artifactSha256: string;
  readonly creationBytecodeHash: Hex;
  readonly runtimeBytecodeHash: Hex;
}

export interface InspectedFoundryArtifacts {
  readonly compilerVersion: string;
  readonly compilerSettingsHash: string;
  readonly artifacts: Readonly<Record<ContractName, ArtifactIdentity>>;
}

export interface ExpectedDeploymentIdentity extends InspectedFoundryArtifacts {
  readonly version: 1;
  readonly sourceTreeHash: string;
  readonly deployScriptHash: string;
}

export interface DeploymentGuardContext {
  readonly sourceCommit: string;
  readonly sourceTreeHash: string;
  readonly deployScriptPath: 'script/Deploy.s.sol:Deploy';
  readonly deployScriptHash: string;
  readonly chainId: number;
  readonly roles: DeploymentRoles;
}

export interface DeploymentAuthorization {
  readonly version: 2;
  readonly tokenId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly candidateDigest: string;
  readonly authorizationNonceHash: string;
  readonly tag: string;
}

const SHA256 = /^[\da-f]{64}$/;
const COMMIT = /^[\da-f]{40,64}$/;

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Text(value: string): string {
  return toHex(sha256(utf8ToBytes(value)));
}

export function sha256Bytes(value: Uint8Array): string {
  return toHex(sha256(value));
}

function bytecode(value: unknown, field: string): Hex {
  if (typeof value !== 'string' || !/^0x(?:[\da-fA-F]{2})+$/.test(value)) {
    throw new TypeError(`${field} must contain non-empty bytecode.`);
  }
  if (/__\$[\da-fA-F]{34}\$__/.test(value)) throw new Error(`${field} contains unresolved links.`);
  return value.toLowerCase() as Hex;
}

export function inspectFoundryArtifacts(
  inputs: Readonly<Record<ContractName, FoundryArtifactInput>>,
): InspectedFoundryArtifacts {
  let compilerVersion: string | undefined;
  let compilerSettingsHash: string | undefined;
  const artifacts = Object.fromEntries(
    contractNames.map((name) => {
      const input = inputs[name];
      if (!input) throw new Error(`${name} artifact is missing.`);
      const version = input.metadata?.compiler?.version;
      if (typeof version !== 'string' || version.length === 0) {
        throw new TypeError(`${name} compiler version is missing.`);
      }
      const settings = input.metadata?.settings;
      if (typeof settings !== 'object' || settings === null) {
        throw new TypeError(`${name} compiler settings are missing.`);
      }
      const { compilationTarget: _compilationTarget, ...sharedSettings } = settings as Record<
        string,
        unknown
      >;
      const settingsHash = sha256Text(canonicalJson(sharedSettings));
      compilerVersion ??= version;
      compilerSettingsHash ??= settingsHash;
      if (version !== compilerVersion) throw new Error(`${name} compiler version mismatch.`);
      if (settingsHash !== compilerSettingsHash)
        throw new Error(`${name} compiler settings mismatch.`);
      return [
        name,
        Object.freeze({
          artifactSha256: sha256Text(input.artifactJson),
          creationBytecodeHash: keccak256(
            bytecode(input.bytecode?.object, `${name} creation bytecode`),
          ),
          runtimeBytecodeHash: keccak256(
            bytecode(input.deployedBytecode?.object, `${name} runtime bytecode`),
          ),
        }),
      ];
    }),
  ) as Record<ContractName, ArtifactIdentity>;
  return Object.freeze({
    compilerVersion: compilerVersion!,
    compilerSettingsHash: compilerSettingsHash!,
    artifacts: Object.freeze(artifacts),
  });
}

function assertSha256(value: string, field: string): void {
  if (!SHA256.test(value)) throw new TypeError(`${field} must be a lowercase SHA-256 hash.`);
}

function normalizeContext(context: DeploymentGuardContext): DeploymentGuardContext {
  if (!COMMIT.test(context.sourceCommit)) throw new TypeError('sourceCommit is invalid.');
  assertSha256(context.sourceTreeHash, 'sourceTreeHash');
  assertSha256(context.deployScriptHash, 'deployScriptHash');
  if (context.deployScriptPath !== 'script/Deploy.s.sol:Deploy') {
    throw new Error('deploy script mismatch.');
  }
  if (!Number.isSafeInteger(context.chainId) || context.chainId <= 0) {
    throw new RangeError('chainId must be positive.');
  }
  return {
    ...context,
    roles: {
      admin: getAddress(context.roles.admin),
      borrower: getAddress(context.roles.borrower),
      lender: getAddress(context.roles.lender),
      certifiers: context.roles.certifiers.map(getAddress) as [Address, Address, Address],
    },
  };
}

export function verifyExpectedDeploymentIdentity(
  expected: ExpectedDeploymentIdentity,
  actual: InspectedFoundryArtifacts,
  context: DeploymentGuardContext,
): void {
  if (expected.version !== 1) throw new Error('Expected deployment identity version mismatch.');
  assertSha256(expected.sourceTreeHash, 'expected sourceTreeHash');
  assertSha256(expected.deployScriptHash, 'expected deployScriptHash');
  if (context.sourceTreeHash !== expected.sourceTreeHash)
    throw new Error('Source tree hash mismatch.');
  if (context.deployScriptHash !== expected.deployScriptHash)
    throw new Error('Deploy script hash mismatch.');
  if (actual.compilerVersion !== expected.compilerVersion)
    throw new Error('Compiler version mismatch.');
  if (actual.compilerSettingsHash !== expected.compilerSettingsHash) {
    throw new Error('Compiler settings hash mismatch.');
  }
  for (const name of contractNames) {
    for (const field of [
      'runtimeBytecodeHash',
      'creationBytecodeHash',
      'artifactSha256',
    ] as const) {
      if (actual.artifacts[name][field] !== expected.artifacts[name][field]) {
        throw new Error(`${name} ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} mismatch.`);
      }
    }
  }
}

const TOKEN_FIELDS = [
  'authorizationNonceHash',
  'candidateDigest',
  'expiresAt',
  'issuedAt',
  'tag',
  'tokenId',
  'version',
] as const;

function assertExactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  name: string,
) {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    throw new TypeError(`${name} contains unknown or missing fields.`);
  }
}

export function guardHmac(secret: Uint8Array, value: unknown): string {
  if (!(secret instanceof Uint8Array) || secret.length !== 32) {
    throw new TypeError('Guard secret must contain exactly 32 bytes.');
  }
  return createHmac('sha256', secret).update(canonicalJson(value)).digest('hex');
}

function equalHex(left: string, right: string): boolean {
  if (!/^[\da-f]+$/.test(left) || !/^[\da-f]+$/.test(right) || left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function createGuardToken(input: {
  readonly secret: Uint8Array;
  readonly tokenId: string;
  readonly authorizationNonce: string;
  readonly candidateDigest: string;
  readonly now: number;
}): DeploymentAuthorization {
  if (!/^[\da-f]{32}$/.test(input.tokenId)) throw new TypeError('tokenId is invalid.');
  if (!/^[\da-f]{64}$/.test(input.authorizationNonce)) {
    throw new TypeError('Authorization nonce is invalid.');
  }
  assertSha256(input.candidateDigest, 'candidateDigest');
  if (!Number.isSafeInteger(input.now) || input.now <= 0)
    throw new TypeError('issuedAt is invalid.');
  const body = {
    version: 2 as const,
    tokenId: input.tokenId,
    issuedAt: input.now,
    expiresAt: input.now + 5 * 60_000,
    candidateDigest: input.candidateDigest,
    authorizationNonceHash: sha256Text(input.authorizationNonce),
  };
  return Object.freeze({ ...body, tag: guardHmac(input.secret, body) });
}

export function parseGuardToken(
  value: unknown,
  secret: Uint8Array,
  now: number,
): DeploymentAuthorization {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Deployment authorization token must be an object.');
  }
  const input = value as Record<string, unknown>;
  assertExactFields(input, TOKEN_FIELDS, 'Deployment authorization token');
  if (input.version !== 2)
    throw new TypeError('Deployment authorization token version is invalid.');
  if (typeof input.tokenId !== 'string' || !/^[\da-f]{32}$/.test(input.tokenId)) {
    throw new TypeError('Deployment authorization tokenId is invalid.');
  }
  for (const field of ['candidateDigest', 'authorizationNonceHash', 'tag'] as const) {
    if (typeof input[field] !== 'string' || !SHA256.test(input[field])) {
      throw new TypeError(`Deployment authorization ${field} is invalid.`);
    }
  }
  if (
    !Number.isSafeInteger(input.issuedAt) ||
    !Number.isSafeInteger(input.expiresAt) ||
    !Number.isSafeInteger(now)
  ) {
    throw new TypeError('Deployment authorization times must be finite integers.');
  }
  const issuedAt = input.issuedAt as number;
  const expiresAt = input.expiresAt as number;
  if (issuedAt <= 0 || expiresAt <= issuedAt || expiresAt - issuedAt > 5 * 60_000) {
    throw new RangeError('Deployment authorization lifetime is invalid.');
  }
  if (issuedAt > now) throw new Error('Deployment authorization is not active.');
  if (expiresAt < now) throw new Error('Deployment authorization token expired.');
  const { tag, ...body } = input;
  if (!equalHex(tag as string, guardHmac(secret, body))) {
    throw new Error('Deployment authorization token HMAC mismatch.');
  }
  return Object.freeze(input as unknown as DeploymentAuthorization);
}

export function deploymentCandidateDigest(
  expected: ExpectedDeploymentIdentity,
  actual: InspectedFoundryArtifacts,
  rawContext: DeploymentGuardContext,
): string {
  const context = normalizeContext(rawContext);
  verifyExpectedDeploymentIdentity(expected, actual, context);
  return sha256Text(canonicalJson({ expected, actual, context }));
}

export function verifyDeploymentAuthorization(
  value: unknown,
  secret: Uint8Array,
  expected: ExpectedDeploymentIdentity,
  actual: InspectedFoundryArtifacts,
  context: DeploymentGuardContext,
  now: number,
): DeploymentAuthorization {
  const token = parseGuardToken(value, secret, now);
  const candidateDigest = deploymentCandidateDigest(expected, actual, context);
  if (!equalHex(token.candidateDigest, candidateDigest)) {
    throw new Error('Deployment authorization token context mismatch.');
  }
  return token;
}
