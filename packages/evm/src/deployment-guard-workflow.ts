import { timingSafeEqual } from 'node:crypto';
import { toHex } from 'ethereum-cryptography/utils';
import {
  canonicalJson,
  createGuardToken,
  guardHmac,
  parseGuardToken,
  sha256Text,
  type DeploymentAuthorization,
} from './deployment-guard';

export type GuardPhase = 'prepared' | 'inspected' | 'authorized' | 'consumed';

export interface FrozenSnapshot {
  readonly tokenId: string;
  readonly sourcePath: string;
  readonly writablePath: string;
  readonly envFilePath?: string;
  readonly identity: Readonly<Record<string, unknown>> & {
    readonly chainId: number;
    readonly sourceTreeHash: string;
  };
}

export interface CandidateRecord {
  readonly snapshot: FrozenSnapshot;
  readonly baseCandidateDigest?: string;
  readonly candidateDigest: string;
  readonly environmentFingerprints?: DeploymentEnvironmentFingerprints;
  readonly details?: unknown;
}

export interface GuardState {
  readonly version: 2;
  readonly tokenId: string;
  readonly candidateDigest: string;
  readonly authorizationNonceHash: string;
  readonly phase: GuardPhase;
  readonly preparedAt: number;
  readonly inspectedAt: number | null;
  readonly authorizedAt: number | null;
  readonly consumedAt: number | null;
  readonly tag: string;
}

export const requiredDeploymentEnvironmentNames = [
  'CHAIN_RPC_URL',
  'DEPLOYER_PRIVATE_KEY',
  'ADMIN_ADDRESS',
  'BORROWER_ADDRESS',
  'LENDER_ADDRESS',
  'CERTIFIER_REVENUE_ADDRESS',
  'CERTIFIER_RIGHTS_ADDRESS',
  'CERTIFIER_SERVICE_ADDRESS',
] as const;

export type DeploymentEnvironmentName = (typeof requiredDeploymentEnvironmentNames)[number];
export interface CapturedDeploymentEnvironment {
  readonly values: Readonly<Record<DeploymentEnvironmentName, string>>;
}
export type DeploymentEnvironmentFingerprints = Readonly<Record<DeploymentEnvironmentName, string>>;

export interface DeploymentEnvironmentPort {
  capture(): Promise<CapturedDeploymentEnvironment>;
}

export interface ProcessRequest {
  readonly kind: 'build' | 'simulate' | 'broadcast';
  readonly executable: 'docker';
  readonly args: readonly string[];
  readonly shell: false;
}

export interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GuardProcessPort {
  run(request: ProcessRequest, environment?: CapturedDeploymentEnvironment): Promise<ProcessResult>;
}

export interface GuardStorePort {
  loadSecret(): Promise<Uint8Array | null>;
  createSecret(secret: Uint8Array): Promise<void>;
  freezeCandidate(tokenId: string): Promise<FrozenSnapshot>;
  inspectCandidate(snapshot: FrozenSnapshot): Promise<CandidateRecord>;
  validateEnvironment(
    snapshot: FrozenSnapshot,
    environment: CapturedDeploymentEnvironment,
  ): Promise<void>;
  assertCandidateUnchanged(candidate: CandidateRecord): Promise<void>;
  saveCandidate(candidate: CandidateRecord): Promise<void>;
  loadCandidate(tokenId: string): Promise<CandidateRecord>;
  createState(state: GuardState): Promise<void>;
  loadState(tokenId: string): Promise<GuardState>;
  transition(expected: GuardState, next: GuardState): Promise<void>;
  readBroadcastArtifact(candidate: CandidateRecord): Promise<unknown>;
}

export interface RpcChainPort {
  chainId(environment: CapturedDeploymentEnvironment): Promise<number>;
}

export interface BroadcastValidationPort {
  validate(
    artifact: unknown,
    candidate: CandidateRecord,
    environment: CapturedDeploymentEnvironment,
  ): Promise<unknown>;
}

export interface ClockPort {
  now(): number;
}

export interface RandomPort {
  bytes(length: number): Uint8Array;
}

const image =
  'ghcr.io/foundry-rs/foundry@sha256:043752653d5be351c71709091b3db97c4421c907eb40ea294195e7f532aadf46';

export function dockerProcessRequest(
  snapshot: FrozenSnapshot,
  kind: ProcessRequest['kind'],
  platform: 'win32' | 'linux' = process.platform === 'win32' ? 'win32' : 'linux',
  posixUser: { uid: number; gid: number } | null = process.getuid && process.getgid
    ? { uid: process.getuid(), gid: process.getgid() }
    : null,
): ProcessRequest {
  // El snapshot se congela a `0500` y pertenece a quien invoca el guard, pero
  // la imagen de Foundry corre como `uid=1000(foundry)`. Si los uid no
  // coinciden el contenedor no puede leer las fuentes: `forge` responde
  // «Nothing to compile», no escribe artefactos y el fallo aparece mucho más
  // tarde como un ENOENT sobre `out/`. Se ejecuta con el uid del invocante en
  // vez de aflojar los permisos del snapshot.
  //
  // Con un uid ajeno a la imagen, `HOME` cae a `/`, que no es escribible, y
  // `forge` muere con «Permission denied (os error 13)» al crear `~/.foundry`.
  // Se le da un HOME dentro del único volumen escribible del contenedor.
  const user =
    platform === 'win32' || !posixUser
      ? []
      : ['--user', `${posixUser.uid}:${posixUser.gid}`, '-e', 'HOME=/guard'];
  const args = [
    'run',
    '--rm',
    ...user,
    ...(kind !== 'build' ? requiredDeploymentEnvironmentNames.flatMap((name) => ['-e', name]) : []),
    '--entrypoint',
    'forge',
    '-v',
    `${snapshot.sourcePath}:/snapshot:ro`,
    '-v',
    `${snapshot.writablePath}:/guard`,
    '-v',
    `${snapshot.writablePath}/broadcast:/snapshot/chain/broadcast`,
    '-w',
    '/snapshot/chain',
    image,
  ];
  if (kind === 'build') {
    args.push('build', '--force', '--out', '/guard/out', '--cache-path', '/guard/cache');
  } else {
    args.push(
      'script',
      'script/Deploy.s.sol:Deploy',
      '--out',
      '/guard/out',
      '--cache-path',
      '/guard/cache',
    );
    if (kind === 'broadcast') {
      args.push('--rpc-url', 'arbitrum_sepolia', '--broadcast', '--non-interactive');
    }
  }
  return Object.freeze({ kind, executable: 'docker', args: Object.freeze(args), shell: false });
}

export function fingerprintEnvironment(
  secret: Uint8Array,
  environment: CapturedDeploymentEnvironment,
): DeploymentEnvironmentFingerprints {
  const actualFields = Object.keys(environment.values).sort();
  const expectedFields = [...requiredDeploymentEnvironmentNames].sort();
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields[index])
  ) {
    throw new Error('deployment_environment_schema_invalid');
  }
  const values = environment.values;
  try {
    const rpc = new URL(values.CHAIN_RPC_URL);
    if ((rpc.protocol !== 'https:' && rpc.protocol !== 'http:') || rpc.username || rpc.password) {
      throw new Error('rpc');
    }
  } catch {
    throw new Error('deployment_environment_invalid');
  }
  if (!/^0x[\da-fA-F]{64}$/.test(values.DEPLOYER_PRIVATE_KEY)) {
    throw new Error('deployment_environment_invalid');
  }
  for (const name of requiredDeploymentEnvironmentNames.slice(2)) {
    if (!/^0x[\da-fA-F]{40}$/.test(values[name])) {
      throw new Error('deployment_environment_invalid');
    }
  }
  return Object.freeze(
    Object.fromEntries(
      requiredDeploymentEnvironmentNames.map((name) => [
        name,
        guardHmac(secret, { domain: 'deployment-environment-v1', name, value: values[name] }),
      ]),
    ) as Record<DeploymentEnvironmentName, string>,
  );
}

function signState(secret: Uint8Array, body: Omit<GuardState, 'tag'>): GuardState {
  return Object.freeze({ ...body, tag: guardHmac(secret, body) });
}

const stateFields = [
  'authorizationNonceHash',
  'authorizedAt',
  'candidateDigest',
  'consumedAt',
  'inspectedAt',
  'phase',
  'preparedAt',
  'tag',
  'tokenId',
  'version',
] as const;

export function parseGuardState(
  value: unknown,
  token: DeploymentAuthorization,
  secret: Uint8Array,
  now: number,
): GuardState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('state_schema_invalid');
  }
  const input = value as Record<string, unknown>;
  const actualFields = Object.keys(input).sort();
  const expectedFields = [...stateFields].sort();
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields[index])
  ) {
    throw new Error('state_schema_invalid');
  }
  if (input.version !== 2) throw new Error('state_version_invalid');
  if (
    typeof input.tokenId !== 'string' ||
    !/^[\da-f]{32}$/.test(input.tokenId) ||
    input.tokenId !== token.tokenId
  ) {
    throw new Error('state_token_invalid');
  }
  for (const field of ['candidateDigest', 'authorizationNonceHash', 'tag'] as const) {
    if (typeof input[field] !== 'string' || !/^[\da-f]{64}$/.test(input[field])) {
      throw new Error('state_hash_invalid');
    }
  }
  if (
    input.candidateDigest !== token.candidateDigest ||
    input.authorizationNonceHash !== token.authorizationNonceHash
  ) {
    throw new Error('state_token_consistency_invalid');
  }
  if (!['prepared', 'inspected', 'authorized', 'consumed'].includes(String(input.phase))) {
    throw new Error('state_phase_invalid');
  }
  if (typeof input.phase !== 'string') throw new Error('state_phase_invalid');
  if (!Number.isSafeInteger(now)) throw new Error('state_time_invalid');
  const times = ['preparedAt', 'inspectedAt', 'authorizedAt', 'consumedAt'] as const;
  for (const field of times) {
    if (input[field] !== null && !Number.isSafeInteger(input[field])) {
      throw new Error('state_time_invalid');
    }
  }
  const state = input as unknown as GuardState;
  if (
    state.preparedAt < token.issuedAt ||
    state.preparedAt > now ||
    state.preparedAt > token.expiresAt
  ) {
    throw new Error('state_time_invalid');
  }
  const present = (time: number | null): time is number => time !== null;
  if (
    (present(state.inspectedAt) && state.inspectedAt < state.preparedAt) ||
    (present(state.authorizedAt) &&
      (!present(state.inspectedAt) || state.authorizedAt < state.inspectedAt)) ||
    (present(state.consumedAt) &&
      (!present(state.authorizedAt) || state.consumedAt < state.authorizedAt)) ||
    [state.inspectedAt, state.authorizedAt, state.consumedAt].some(
      (time) => present(time) && (time > now || time > token.expiresAt),
    )
  ) {
    throw new Error('state_time_regression');
  }
  const validPhaseTimes =
    (state.phase === 'prepared' &&
      state.inspectedAt === null &&
      state.authorizedAt === null &&
      state.consumedAt === null) ||
    (state.phase === 'inspected' &&
      present(state.inspectedAt) &&
      state.authorizedAt === null &&
      state.consumedAt === null) ||
    (state.phase === 'authorized' &&
      present(state.inspectedAt) &&
      present(state.authorizedAt) &&
      state.consumedAt === null) ||
    (state.phase === 'consumed' &&
      present(state.inspectedAt) &&
      present(state.authorizedAt) &&
      present(state.consumedAt));
  if (!validPhaseTimes) throw new Error('state_phase_times_invalid');
  const { tag, ...body } = state;
  const expected = guardHmac(secret, body);
  if (!timingSafeEqual(Buffer.from(tag, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new Error('state_hmac_invalid');
  }
  return Object.freeze(state);
}

export function createGuardState(
  token: DeploymentAuthorization,
  secret: Uint8Array,
  now: number,
): GuardState {
  return signState(secret, {
    version: 2,
    tokenId: token.tokenId,
    candidateDigest: token.candidateDigest,
    authorizationNonceHash: token.authorizationNonceHash,
    phase: 'prepared',
    preparedAt: now,
    inspectedAt: null,
    authorizedAt: null,
    consumedAt: null,
  });
}

export function advanceGuardState(
  state: GuardState,
  token: DeploymentAuthorization,
  secret: Uint8Array,
  phase: GuardPhase,
  now: number,
): GuardState {
  parseGuardState(state, token, secret, now);
  const allowed: Record<GuardPhase, GuardPhase | null> = {
    prepared: 'inspected',
    inspected: 'authorized',
    authorized: 'consumed',
    consumed: null,
  };
  if (allowed[state.phase] === null) throw new Error('consumed_state_is_terminal');
  if (allowed[state.phase] !== phase) throw new Error('state_transition_invalid');
  const { tag: _tag, ...body } = state;
  const next = signState(secret, {
    ...body,
    phase,
    inspectedAt: phase === 'inspected' ? now : body.inspectedAt,
    authorizedAt: phase === 'authorized' ? now : body.authorizedAt,
    consumedAt: phase === 'consumed' ? now : body.consumedAt,
  });
  return parseGuardState(next, token, secret, now);
}

function bindCandidateEnvironment(
  candidate: CandidateRecord,
  fingerprints: DeploymentEnvironmentFingerprints,
): CandidateRecord {
  const baseCandidateDigest = candidate.baseCandidateDigest ?? candidate.candidateDigest;
  return Object.freeze({
    ...candidate,
    baseCandidateDigest,
    environmentFingerprints: fingerprints,
    candidateDigest: sha256Text(canonicalJson({ baseCandidateDigest, fingerprints })),
  });
}

function verifyEnvironment(
  secret: Uint8Array,
  candidate: CandidateRecord,
  environment: CapturedDeploymentEnvironment,
): void {
  if (!candidate.environmentFingerprints) throw new Error('environment_fingerprints_missing');
  const actual = fingerprintEnvironment(secret, environment);
  for (const name of requiredDeploymentEnvironmentNames) {
    const expected = candidate.environmentFingerprints[name];
    if (
      !/^[\da-f]{64}$/.test(expected) ||
      !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual[name], 'hex'))
    ) {
      throw new Error('environment_fingerprint_mismatch');
    }
  }
}

function safeProcess(result: ProcessResult, kind: ProcessRequest['kind']): void {
  if (!Number.isInteger(result.exitCode) || result.exitCode !== 0)
    throw new Error(`${kind}_failed`);
}

function parseSimulationOutput(output: string): { gasUsed: number } {
  if (!output.includes('Script ran successfully.')) throw new Error('simulation_output_invalid');
  const match = /(?:^|\n)Gas used: (\d+)(?:\n|$)/.exec(output);
  const gasUsed = Number(match?.[1]);
  if (!Number.isSafeInteger(gasUsed) || gasUsed <= 0) throw new Error('simulation_output_invalid');
  return { gasUsed };
}

function assertBroadcastOutput(output: string): void {
  if (!output.trim() || !output.includes('Script ran successfully.')) {
    throw new Error('broadcast_output_invalid');
  }
}

export class DeploymentGuardWorkflow {
  constructor(
    private readonly ports: {
      readonly store: GuardStorePort;
      readonly process: GuardProcessPort;
      readonly rpc: RpcChainPort;
      readonly validator: BroadcastValidationPort;
      readonly environment: DeploymentEnvironmentPort;
      readonly clock: ClockPort;
      readonly random: RandomPort;
    },
  ) {}

  private async secret(): Promise<Uint8Array> {
    const existing = await this.ports.store.loadSecret();
    if (existing) return existing;
    const created = this.ports.random.bytes(32);
    await this.ports.store.createSecret(created);
    return created;
  }

  private async checked(value: unknown) {
    const secret = await this.secret();
    const token = parseGuardToken(value, secret, this.ports.clock.now());
    const candidate = await this.ports.store.loadCandidate(token.tokenId);
    if (candidate.candidateDigest !== token.candidateDigest)
      throw new Error('candidate_digest_mismatch');
    const state = parseGuardState(
      await this.ports.store.loadState(token.tokenId),
      token,
      secret,
      this.ports.clock.now(),
    );
    return { secret, token, candidate, state };
  }

  async prepare(): Promise<{
    token: DeploymentAuthorization;
    authorizationNonce: string;
    candidateDigest: string;
  }> {
    const secret = await this.secret();
    const tokenId = toHex(this.ports.random.bytes(16));
    const authorizationNonce = toHex(this.ports.random.bytes(32));
    const environment = await this.ports.environment.capture();
    const fingerprints = fingerprintEnvironment(secret, environment);
    const snapshot = await this.ports.store.freezeCandidate(tokenId);
    await this.ports.store.validateEnvironment(snapshot, environment);
    const result = await this.ports.process.run(dockerProcessRequest(snapshot, 'build'));
    safeProcess(result, 'build');
    const candidate = bindCandidateEnvironment(
      await this.ports.store.inspectCandidate(snapshot),
      fingerprints,
    );
    if (!/^[\da-f]{64}$/.test(candidate.candidateDigest)) {
      throw new Error('candidate_digest_invalid');
    }
    await this.ports.store.assertCandidateUnchanged(candidate);
    const token = createGuardToken({
      secret,
      tokenId,
      authorizationNonce,
      candidateDigest: candidate.candidateDigest,
      now: this.ports.clock.now(),
    });
    const state = createGuardState(token, secret, this.ports.clock.now());
    parseGuardState(state, token, secret, this.ports.clock.now());
    await this.ports.store.saveCandidate(candidate);
    await this.ports.store.createState(state);
    return { token, authorizationNonce, candidateDigest: candidate.candidateDigest };
  }

  async inspect(value: unknown): Promise<{ candidateDigest: string }> {
    const checked = await this.checked(value);
    if (checked.state.phase !== 'prepared') throw new Error('inspect_transition_invalid');
    await this.ports.store.assertCandidateUnchanged(checked.candidate);
    await this.ports.store.transition(
      checked.state,
      advanceGuardState(
        checked.state,
        checked.token,
        checked.secret,
        'inspected',
        this.ports.clock.now(),
      ),
    );
    return { candidateDigest: checked.candidate.candidateDigest };
  }

  async authorize(value: unknown, authorizationNonce: string): Promise<void> {
    const checked = await this.checked(value);
    if (checked.state.phase !== 'inspected') throw new Error('authorize_requires_inspect');
    if (
      typeof authorizationNonce !== 'string' ||
      !/^[\da-f]{64}$/.test(authorizationNonce) ||
      !timingSafeEqual(
        Buffer.from(sha256Text(authorizationNonce), 'hex'),
        Buffer.from(checked.state.authorizationNonceHash, 'hex'),
      )
    ) {
      throw new Error('authorization_nonce_invalid');
    }
    const environment = await this.ports.environment.capture();
    verifyEnvironment(checked.secret, checked.candidate, environment);
    await this.ports.store.validateEnvironment(checked.candidate.snapshot, environment);
    let chainId: number;
    try {
      chainId = await this.ports.rpc.chainId(environment);
    } catch {
      throw new Error('rpc_chain_unavailable');
    }
    if (chainId !== 421_614) throw new Error('rpc_chain_mismatch');
    await this.ports.store.assertCandidateUnchanged(checked.candidate);
    await this.ports.store.transition(
      checked.state,
      advanceGuardState(
        checked.state,
        checked.token,
        checked.secret,
        'authorized',
        this.ports.clock.now(),
      ),
    );
  }

  async simulate(value: unknown): Promise<{ gasUsed: number }> {
    const checked = await this.checked(value);
    if (checked.state.phase !== 'inspected' && checked.state.phase !== 'authorized') {
      throw new Error('simulation_requires_inspect');
    }
    const environment = await this.ports.environment.capture();
    verifyEnvironment(checked.secret, checked.candidate, environment);
    await this.ports.store.validateEnvironment(checked.candidate.snapshot, environment);
    await this.ports.store.assertCandidateUnchanged(checked.candidate);
    const result = await this.ports.process.run(
      dockerProcessRequest(checked.candidate.snapshot, 'simulate'),
      environment,
    );
    safeProcess(result, 'simulate');
    await this.ports.store.assertCandidateUnchanged(checked.candidate);
    return parseSimulationOutput(result.stdout);
  }

  async broadcast(value: unknown): Promise<void> {
    const checked = await this.checked(value);
    if (checked.state.phase !== 'authorized') throw new Error('broadcast_authorization_consumed');
    const environment = await this.ports.environment.capture();
    verifyEnvironment(checked.secret, checked.candidate, environment);
    await this.ports.store.validateEnvironment(checked.candidate.snapshot, environment);
    await this.ports.store.assertCandidateUnchanged(checked.candidate);
    await this.ports.store.transition(
      checked.state,
      advanceGuardState(
        checked.state,
        checked.token,
        checked.secret,
        'consumed',
        this.ports.clock.now(),
      ),
    );
    const result = await this.ports.process.run(
      dockerProcessRequest(checked.candidate.snapshot, 'broadcast'),
      environment,
    );
    safeProcess(result, 'broadcast');
    assertBroadcastOutput(result.stdout);
    await this.ports.store.assertCandidateUnchanged(checked.candidate);
    const artifact = await this.ports.store.readBroadcastArtifact(checked.candidate);
    await this.ports.validator.validate(artifact, checked.candidate, environment);
  }
}
