import { beforeEach, describe, expect, it } from 'vitest';
import {
  advanceGuardState,
  createGuardState,
  DeploymentGuardWorkflow,
  dockerProcessRequest,
  fingerprintEnvironment,
  parseGuardState,
  type BroadcastValidationPort,
  type CandidateRecord,
  type ClockPort,
  type DeploymentEnvironmentPort,
  type GuardProcessPort,
  type GuardState,
  type GuardStorePort,
  type ProcessRequest,
  type RandomPort,
  type RpcChainPort,
} from './deployment-guard-workflow';
import { createGuardToken } from './deployment-guard';

const NOW = 1_786_291_200_000;
const SECRET_SENTINEL = 'private-key-sentinel-never-log';

class FakeStore implements GuardStorePort {
  secret: Uint8Array | null = null;
  candidate: CandidateRecord | null = null;
  state: GuardState | null = null;
  mutated = false;
  broadcastArtifact: unknown = { transactions: [], receipts: [] };
  events: string[] = [];

  async loadSecret() {
    return this.secret;
  }
  async createSecret(secret: Uint8Array) {
    this.secret = secret;
    this.events.push('secret');
  }
  async freezeCandidate(tokenId: string) {
    this.events.push('freeze');
    return {
      tokenId,
      sourcePath: 'C:\\repo path & safe\\snapshot',
      writablePath: 'C:\\repo path & safe\\candidate',
      identity: { chainId: 421_614, sourceTreeHash: 'a'.repeat(64) },
    };
  }
  async inspectCandidate(snapshot: CandidateRecord['snapshot']) {
    this.events.push('artifacts');
    return { snapshot, candidateDigest: 'b'.repeat(64) };
  }
  async validateEnvironment() {}
  async assertCandidateUnchanged() {
    this.events.push('unchanged');
    if (this.mutated) throw new Error('candidate_changed');
  }
  async saveCandidate(candidate: CandidateRecord) {
    this.candidate = candidate;
  }
  async loadCandidate() {
    if (!this.candidate) throw new Error('candidate_missing');
    return this.candidate;
  }
  async createState(state: GuardState) {
    this.state = state;
  }
  async loadState() {
    if (!this.state) throw new Error('state_missing');
    return this.state;
  }
  async transition(expected: GuardState, next: GuardState) {
    if (this.state !== expected) throw new Error('invalid_transition');
    this.state = next;
    this.events.push(`state:${next.phase}`);
  }
  async readBroadcastArtifact() {
    return this.broadcastArtifact;
  }
}

class FakeProcess implements GuardProcessPort {
  requests: ProcessRequest[] = [];
  result = { exitCode: 0, stdout: 'Script ran successfully.\nGas used: 5623688', stderr: '' };
  events: string[];
  environments: unknown[] = [];
  constructor(events: string[]) {
    this.events = events;
  }
  async run(request: ProcessRequest, environment?: unknown) {
    this.requests.push(request);
    this.environments.push(environment);
    this.events.push(`process:${request.kind}`);
    return this.result;
  }
}

const baseEnvironment = () => ({
  values: Object.freeze({
    CHAIN_RPC_URL: 'https://rpc.example.invalid',
    DEPLOYER_PRIVATE_KEY: `0x${'1'.repeat(64)}`,
    ADMIN_ADDRESS: `0x${'a'.repeat(40)}`,
    BORROWER_ADDRESS: `0x${'b'.repeat(40)}`,
    LENDER_ADDRESS: `0x${'c'.repeat(40)}`,
    CERTIFIER_REVENUE_ADDRESS: `0x${'d'.repeat(40)}`,
    CERTIFIER_RIGHTS_ADDRESS: `0x${'e'.repeat(40)}`,
    CERTIFIER_SERVICE_ADDRESS: `0x${'f'.repeat(40)}`,
  }),
});

class FakeEnvironment implements DeploymentEnvironmentPort {
  current = baseEnvironment();
  captures = 0;
  lastCaptured: ReturnType<typeof baseEnvironment> | null = null;
  mutateAfterCapture = false;
  async capture() {
    this.captures += 1;
    const captured = { values: Object.freeze({ ...this.current.values }) };
    this.lastCaptured = captured;
    if (this.mutateAfterCapture) {
      this.current = {
        values: Object.freeze({
          ...this.current.values,
          DEPLOYER_PRIVATE_KEY: `0x${'9'.repeat(64)}`,
        }),
      };
    }
    return captured;
  }
}

const clock: ClockPort = { now: () => NOW };
const random: RandomPort = {
  bytes: (length) => new Uint8Array(length).fill(length === 32 ? 7 : 8),
};

describe('deployment guard CLI workflow', () => {
  let store: FakeStore;
  let process: FakeProcess;
  let rpc: RpcChainPort;
  let validator: BroadcastValidationPort;
  let environment: FakeEnvironment;
  let workflow: DeploymentGuardWorkflow;

  beforeEach(() => {
    store = new FakeStore();
    process = new FakeProcess(store.events);
    rpc = { chainId: async () => 421_614 };
    validator = { validate: async () => ({ deploymentBlock: 1 }) };
    environment = new FakeEnvironment();
    workflow = new DeploymentGuardWorkflow({
      store,
      process,
      rpc,
      validator,
      environment,
      clock,
      random,
    });
  });

  async function prepared() {
    return workflow.prepare();
  }

  async function inspected() {
    const result = await prepared();
    await workflow.inspect(result.token);
    return result;
  }

  async function authorized() {
    const result = await inspected();
    await workflow.authorize(result.token, result.authorizationNonce);
    return result;
  }

  it('enforces prepare -> inspect -> authorize and consumes before process launch', async () => {
    const result = await authorized();
    store.broadcastArtifact = { valid: true };
    await workflow.broadcast(result.token);
    expect(store.events).toContain('state:inspected');
    expect(store.events).toContain('state:authorized');
    expect(store.events.indexOf('state:consumed')).toBeLessThan(
      store.events.indexOf('process:broadcast'),
    );
  });

  it('rejects skipping inspect', async () => {
    const result = await prepared();
    await expect(workflow.authorize(result.token, result.authorizationNonce)).rejects.toThrow(
      /transition|inspect/i,
    );
  });

  it.each(['', 'wrong-nonce'])('rejects missing or wrong authorization nonce', async (nonce) => {
    const result = await inspected();
    await expect(workflow.authorize(result.token, nonce)).rejects.toThrow(/authorization/i);
  });

  it('rejects replay even when the first broadcast child fails', async () => {
    const result = await authorized();
    process.result = { exitCode: 1, stdout: SECRET_SENTINEL, stderr: SECRET_SENTINEL };
    await expect(workflow.broadcast(result.token)).rejects.toThrow(/broadcast_failed/);
    await expect(workflow.broadcast(result.token)).rejects.toThrow(/consumed|transition/i);
    expect(store.state?.phase).toBe('consumed');
  });

  it('rejects a tampered local transition state', async () => {
    const result = await inspected();
    store.state = { ...store.state!, phase: 'authorized' };
    await expect(workflow.broadcast(result.token)).rejects.toThrow(/state_/);
  });

  it('queries actual RPC chain before authorization and rejects mismatch', async () => {
    const result = await inspected();
    rpc.chainId = async () => 31_337;
    await expect(workflow.authorize(result.token, result.authorizationNonce)).rejects.toThrow(
      /rpc_chain_mismatch/,
    );
    expect(store.state?.phase).toBe('inspected');
  });

  it('rejects environment mutation before authorization', async () => {
    const result = await inspected();
    environment.current = {
      values: Object.freeze({
        ...environment.current.values,
        DEPLOYER_PRIVATE_KEY: `0x${'9'.repeat(64)}`,
      }),
    };
    await expect(workflow.authorize(result.token, result.authorizationNonce)).rejects.toThrow(
      /environment_fingerprint_mismatch/,
    );
  });

  it('captures broadcast environment once and passes that exact immutable object to the child', async () => {
    const result = await authorized();
    environment.mutateAfterCapture = true;
    const before = environment.captures;
    await workflow.broadcast(result.token);
    expect(environment.captures).toBe(before + 1);
    expect(process.environments.at(-1)).toBe(environment.lastCaptured);
    expect(environment.lastCaptured?.values.DEPLOYER_PRIVATE_KEY).toBe(`0x${'1'.repeat(64)}`);
    expect(process.requests.at(-1)?.args).not.toContain('--env-file');
    expect(process.requests.at(-1)?.args.join(' ')).not.toContain('1'.repeat(64));
  });

  it('rejects source or artifact mutation before process write', async () => {
    const result = await authorized();
    store.mutated = true;
    await expect(workflow.broadcast(result.token)).rejects.toThrow(/candidate_changed/);
    expect(process.requests).toHaveLength(1);
    expect(process.requests[0]?.kind).toBe('build');
    expect(store.state?.phase).toBe('authorized');
  });

  it.each([
    { exitCode: 0, stdout: '', stderr: '' },
    { exitCode: 0, stdout: 'ambiguous success', stderr: '' },
  ])('rejects zero-exit empty or malformed child output', async (result) => {
    const prepared = await authorized();
    process.result = result;
    await expect(workflow.broadcast(prepared.token)).rejects.toThrow(/broadcast_output_invalid/);
    expect(store.state?.phase).toBe('consumed');
  });

  it('never includes raw child output or secret sentinels in errors', async () => {
    const result = await authorized();
    process.result = { exitCode: 7, stdout: SECRET_SENTINEL, stderr: SECRET_SENTINEL };
    const error = await workflow.broadcast(result.token).catch((value: unknown) => value);
    expect(String(error)).toBe('Error: broadcast_failed');
    expect(String(error)).not.toContain(SECRET_SENTINEL);
  });

  it('requires strict final artifact validation before success', async () => {
    const result = await authorized();
    validator.validate = async () => {
      throw new Error('broadcast_artifact_invalid');
    };
    await expect(workflow.broadcast(result.token)).rejects.toThrow(/broadcast_artifact_invalid/);
    expect(store.state?.phase).toBe('consumed');
  });

  it('permits one guarded non-broadcast simulation only after inspect', async () => {
    const result = await prepared();
    await expect(workflow.simulate(result.token)).rejects.toThrow(/inspect|transition/i);
    await workflow.inspect(result.token);
    await expect(workflow.simulate(result.token)).resolves.toEqual({ gasUsed: 5_623_688 });
  });

  it.each([
    ['win32', 'C:\\repo path & safe\\snapshot', 'C:\\repo path & safe\\candidate'],
    ['linux', '/repo path & safe/snapshot', '/repo path & safe/candidate'],
  ] as const)('uses shell-free argument boundaries on %s', (platform, sourcePath, writablePath) => {
    const request = dockerProcessRequest(
      {
        tokenId: '11'.repeat(16),
        sourcePath,
        writablePath,
        identity: { chainId: 421_614, sourceTreeHash: 'a'.repeat(64) },
      },
      'broadcast',
      platform,
    );
    expect(request.executable).toBe('docker');
    expect(request.shell).toBe(false);
    expect(request.args).toContain(`${sourcePath}:/snapshot:ro`);
    expect(request.args).toContain(`${writablePath}:/guard`);
    expect(request.args).not.toContain(SECRET_SENTINEL);
    expect(request.args).not.toContain('--force');
  });
});

describe('strict persisted guard state', () => {
  const secret = new Uint8Array(32).fill(7);
  const token = createGuardToken({
    secret,
    tokenId: '11'.repeat(16),
    authorizationNonce: '22'.repeat(32),
    candidateDigest: '33'.repeat(32),
    now: NOW,
  });
  const prepared = createGuardState(token, secret, NOW);
  const inspected = advanceGuardState(prepared, token, secret, 'inspected', NOW + 1);
  const authorized = advanceGuardState(inspected, token, secret, 'authorized', NOW + 2);
  const consumed = advanceGuardState(authorized, token, secret, 'consumed', NOW + 3);

  it.each([
    ['version', { ...prepared, version: 99 }],
    ['tokenId', { ...prepared, tokenId: '44'.repeat(16) }],
    ['candidateDigest', { ...prepared, candidateDigest: '44'.repeat(32) }],
    ['nonceHash', { ...prepared, authorizationNonceHash: '44'.repeat(32) }],
    ['phase', { ...prepared, phase: 'invalid' }],
    ['preparedAt NaN', { ...prepared, preparedAt: Number.NaN }],
    ['future', { ...prepared, preparedAt: NOW + 1 }],
    ['tag', { ...prepared, tag: '44'.repeat(32) }],
    ['unknown', { ...prepared, unknown: true }],
    ['prepared with inspectedAt', { ...prepared, inspectedAt: NOW }],
    ['inspected regression', { ...inspected, inspectedAt: NOW - 1 }],
    ['authorized missing time', { ...authorized, authorizedAt: null }],
    ['consumed regression', { ...consumed, consumedAt: NOW + 1 }],
  ])('rejects tampered %s state', (_name, value) => {
    expect(() => parseGuardState(value, token, secret, NOW + 3)).toThrow();
  });

  it('accepts every valid monotonic phase and keeps consumed terminal', () => {
    expect(parseGuardState(prepared, token, secret, NOW + 3).phase).toBe('prepared');
    expect(parseGuardState(inspected, token, secret, NOW + 3).phase).toBe('inspected');
    expect(parseGuardState(authorized, token, secret, NOW + 3).phase).toBe('authorized');
    expect(parseGuardState(consumed, token, secret, NOW + 3).phase).toBe('consumed');
    expect(() => advanceGuardState(consumed, token, secret, 'authorized', NOW + 4)).toThrow(
      /terminal/i,
    );
  });

  it('creates deterministic HMAC fingerprints without retaining raw environment values', () => {
    const captured = baseEnvironment();
    const fingerprints = fingerprintEnvironment(secret, captured);
    expect(Object.keys(fingerprints)).toHaveLength(8);
    expect(JSON.stringify(fingerprints)).not.toContain(captured.values.DEPLOYER_PRIVATE_KEY);
    expect(JSON.stringify(fingerprints)).not.toContain(captured.values.CHAIN_RPC_URL);
  });
});
