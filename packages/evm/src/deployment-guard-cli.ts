import { execFile } from 'node:child_process';
import {
  chmod,
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createPublicClient, getAddress, http, keccak256, type Address, type Hex } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import {
  canonicalJson,
  deploymentCandidateDigest,
  inspectFoundryArtifacts,
  sha256Bytes,
  sha256Text,
  type DeploymentAuthorization,
  type DeploymentGuardContext,
  type ExpectedDeploymentIdentity,
  type FoundryArtifactInput,
  type InspectedFoundryArtifacts,
} from './deployment-guard';
import {
  DeploymentGuardWorkflow,
  type BroadcastValidationPort,
  type CapturedDeploymentEnvironment,
  type CandidateRecord,
  type FrozenSnapshot,
  type GuardProcessPort,
  type GuardState,
  type GuardStorePort,
  type ProcessRequest,
  type ProcessResult,
  type RpcChainPort,
  requiredDeploymentEnvironmentNames,
} from './deployment-guard-workflow';
import {
  finalizeDeployment,
  validateGuardedBroadcast,
  verifyExpectedRuntimeBytecodeHashes,
} from './deployment-finalizer';
import {
  contractNames,
  type ContractName,
  type DeploymentAddresses,
  type DeploymentRoles,
  type RuntimeBytecodeHashes,
} from './deployments';

const root = resolve(import.meta.dirname, '../../..');
const chainRoot = resolve(root, 'chain');
const guardRoot = resolve(chainRoot, '.deploy-guard');
const candidatesRoot = resolve(guardRoot, 'candidates');
const secretPath = resolve(guardRoot, 'guard-secret.bin');
const envPath = resolve(chainRoot, '.env');
const expectedPath = resolve(chainRoot, 'deployment-identities.json');
const configPath = resolve(chainRoot, 'deploy-config/421614.json');
const artifactPaths: Record<ContractName, string> = {
  assetRegistry: 'AssetRegistry.sol/AssetRegistry.json',
  certificationAttestor: 'CertificationAttestor.sol/CertificationAttestor.json',
  paiCertificate: 'PAICertificate.sol/PAICertificate.json',
  borrowingBaseEngine: 'BorrowingBaseEngine.sol/BorrowingBaseEngine.json',
  collateralVault: 'CollateralVault.sol/CollateralVault.json',
  mockUsdc: 'MockUSDC.sol/MockUSDC.json',
};

interface CandidateIdentity {
  readonly chainId: 421614;
  readonly sourceCommit: string;
  readonly sourceTreeHash: string;
  readonly deployScriptHash: string;
  readonly snapshotDigest: string;
  readonly roles: DeploymentRoles;
  readonly expected: ExpectedDeploymentIdentity;
  readonly context: DeploymentGuardContext;
}

function runFile(
  program: string,
  args: readonly string[],
  cwd = root,
  environment?: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
  return new Promise((resolveResult) => {
    execFile(
      program,
      [...args],
      { cwd, shell: false, maxBuffer: 10 * 1024 * 1024, env: environment ?? process.env },
      (error, stdout, stderr) => {
        const code =
          typeof (error as NodeJS.ErrnoException | null)?.code === 'number'
            ? Number((error as NodeJS.ErrnoException).code)
            : error
              ? -1
              : 0;
        resolveResult({ exitCode: code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

async function git(args: readonly string[]): Promise<string> {
  const result = await runFile('git', args);
  if (result.exitCode !== 0 || !result.stdout.trim())
    throw new Error('source_identity_unavailable');
  return result.stdout.trim();
}

async function restrictPath(path: string, directory = false): Promise<void> {
  await chmod(path, directory ? 0o700 : 0o600);
  if (process.platform !== 'win32') return;
  const user = process.env.USERNAME;
  if (!user) throw new Error('filesystem_security_failed');
  const permission = directory ? '(OI)(CI)F' : 'F';
  const result = await runFile('icacls', [
    path,
    '/inheritance:r',
    '/grant:r',
    `${user}:${permission}`,
  ]);
  if (result.exitCode !== 0) throw new Error('filesystem_security_failed');
}

async function freezeReadOnly(path: string): Promise<void> {
  if (process.platform === 'win32') {
    const user = process.env.USERNAME;
    if (!user) throw new Error('filesystem_security_failed');
    const result = await runFile('icacls', [
      path,
      '/inheritance:r',
      '/grant:r',
      `${user}:(OI)(CI)RX`,
    ]);
    if (result.exitCode !== 0) throw new Error('filesystem_security_failed');
    return;
  }
  const children = await readdir(path, { withFileTypes: true });
  for (const child of children) {
    const absolute = join(path, child.name);
    if (child.isDirectory()) await freezeReadOnly(absolute);
    else if (child.isFile()) await chmod(absolute, 0o400);
    else throw new Error('snapshot_contains_unsupported_entry');
  }
  await chmod(path, 0o500);
}

async function writeRestricted(path: string, value: string | Uint8Array, exclusive = false) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await restrictPath(dirname(path), true);
  const handle = await open(path, exclusive ? 'wx' : 'w', 0o600);
  try {
    await handle.writeFile(value);
  } finally {
    await handle.close();
  }
  await restrictPath(path);
}

async function writeAtomic(path: string, value: unknown) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeRestricted(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
  await restrictPath(path);
}

async function directoryDigest(path: string): Promise<string> {
  const entries: string[] = [];
  async function visit(directory: string) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const absolute = join(directory, child.name);
      if (child.isDirectory()) await visit(absolute);
      else if (child.isFile()) {
        entries.push(
          `${relative(path, absolute).replaceAll('\\', '/')}\0${sha256Bytes(await readFile(absolute))}`,
        );
      } else throw new Error('snapshot_contains_unsupported_entry');
    }
  }
  await visit(path);
  return sha256Text(entries.join('\n'));
}

async function publicConfig(): Promise<{ chainId: 421614; roles: DeploymentRoles }> {
  const value = JSON.parse(await readFile(configPath, 'utf8')) as {
    chainId: unknown;
    roles?: Record<string, unknown>;
  };
  if (value.chainId !== 421_614 || !value.roles) throw new Error('public_config_invalid');
  const certifiers = value.roles.certifiers;
  if (!Array.isArray(certifiers) || certifiers.length !== 3)
    throw new Error('public_config_invalid');
  const address = (name: string) => {
    const input = value.roles?.[name];
    if (typeof input !== 'string') throw new Error('public_config_invalid');
    return getAddress(input);
  };
  return {
    chainId: 421_614,
    roles: {
      admin: address('admin'),
      borrower: address('borrower'),
      lender: address('lender'),
      certifiers: certifiers.map((input) => getAddress(String(input))) as [
        Address,
        Address,
        Address,
      ],
    },
  };
}

async function captureDeploymentEnvironment(): Promise<CapturedDeploymentEnvironment> {
  const content = await readFile(envPath, 'utf8');
  const entries = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (!match || !requiredDeploymentEnvironmentNames.includes(match[1] as never)) continue;
    if (entries.has(match[1]!)) throw new Error('deployment_environment_duplicate');
    entries.set(match[1]!, match[2]!.trim());
  }
  const values = Object.fromEntries(
    requiredDeploymentEnvironmentNames.map((name) => {
      const value = entries.get(name);
      if (!value) throw new Error('deployment_environment_missing');
      return [name, value];
    }),
  ) as CapturedDeploymentEnvironment['values'];
  return Object.freeze({ values: Object.freeze(values) });
}

function assertPublicEnvironment(
  roles: DeploymentRoles,
  environment: CapturedDeploymentEnvironment,
): void {
  const expected = [
    ['ADMIN_ADDRESS', roles.admin],
    ['BORROWER_ADDRESS', roles.borrower],
    ['LENDER_ADDRESS', roles.lender],
    ['CERTIFIER_REVENUE_ADDRESS', roles.certifiers[0]],
    ['CERTIFIER_RIGHTS_ADDRESS', roles.certifiers[1]],
    ['CERTIFIER_SERVICE_ADDRESS', roles.certifiers[2]],
  ] as const;
  for (const [name, address] of expected) {
    const actual = environment.values[name];
    if (!actual || getAddress(actual).toLowerCase() !== address.toLowerCase()) {
      throw new Error('public_role_config_mismatch');
    }
  }
}

async function snapshotSourceIdentity(snapshotRoot: string) {
  const sourceCommit = await git(['rev-parse', 'HEAD']);
  const submodules = await git(['submodule', 'status', '--recursive']);
  if (submodules.split(/\r?\n/).some((line) => /^[+\-U]/.test(line))) {
    throw new Error('submodule_identity_mismatch');
  }
  const listed = await git([
    'ls-files',
    '--stage',
    '--',
    'chain/src',
    'chain/script/Deploy.s.sol',
    'chain/foundry.toml',
    'chain/foundry.lock',
    'chain/lib',
  ]);
  const entries: string[] = [];
  for (const line of listed.split(/\r?\n/).filter(Boolean)) {
    const match = /^(\d+) ([\da-f]+) \d+\t(.+)$/.exec(line);
    if (!match) throw new Error('source_identity_invalid');
    const [, mode, objectHash, path] = match;
    entries.push(
      mode === '160000'
        ? `${path}\0${objectHash}`
        : `${path}\0${sha256Bytes(await readFile(resolve(snapshotRoot, path!)))}`,
    );
  }
  const deployScript = await readFile(resolve(snapshotRoot, 'chain/script/Deploy.s.sol'));
  return {
    sourceCommit,
    sourceTreeHash: sha256Text(entries.sort().join('\n')),
    deployScriptHash: sha256Bytes(deployScript),
  };
}

async function readArtifacts(outPath: string): Promise<InspectedFoundryArtifacts> {
  const inputs = Object.fromEntries(
    await Promise.all(
      contractNames.map(async (name) => {
        const artifactJson = await readFile(resolve(outPath, artifactPaths[name]), 'utf8');
        return [name, { ...(JSON.parse(artifactJson) as FoundryArtifactInput), artifactJson }];
      }),
    ),
  ) as Record<ContractName, FoundryArtifactInput>;
  return inspectFoundryArtifacts(inputs);
}

function identity(snapshot: FrozenSnapshot): CandidateIdentity {
  return snapshot.identity as unknown as CandidateIdentity;
}

class LocalGuardStore implements GuardStorePort {
  candidateRoot(tokenId: string) {
    return resolve(candidatesRoot, tokenId);
  }

  async loadSecret() {
    try {
      const secret = await readFile(secretPath);
      if (secret.length !== 32) throw new Error('guard_secret_invalid');
      return new Uint8Array(secret);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async createSecret(secret: Uint8Array) {
    await writeRestricted(secretPath, secret, true);
  }

  async freezeCandidate(tokenId: string): Promise<FrozenSnapshot> {
    const candidateRoot = this.candidateRoot(tokenId);
    const snapshotRoot = resolve(candidateRoot, 'snapshot');
    const writablePath = resolve(candidateRoot, 'writable');
    await rm(candidateRoot, { recursive: true, force: true });
    await mkdir(resolve(snapshotRoot, 'chain'), { recursive: true });
    await mkdir(resolve(snapshotRoot, 'chain/broadcast'), { recursive: true });
    await mkdir(resolve(snapshotRoot, 'packages'), { recursive: true });
    await mkdir(resolve(writablePath, 'broadcast'), { recursive: true });
    await Promise.all([
      cp(resolve(chainRoot, 'src'), resolve(snapshotRoot, 'chain/src'), {
        recursive: true,
        dereference: true,
      }),
      cp(resolve(chainRoot, 'script'), resolve(snapshotRoot, 'chain/script'), {
        recursive: true,
        dereference: true,
      }),
      cp(resolve(chainRoot, 'test'), resolve(snapshotRoot, 'chain/test'), {
        recursive: true,
        dereference: true,
      }),
      cp(resolve(chainRoot, 'lib'), resolve(snapshotRoot, 'chain/lib'), {
        recursive: true,
        dereference: true,
      }),
      cp(
        resolve(root, 'packages/merkle/fixtures'),
        resolve(snapshotRoot, 'packages/merkle/fixtures'),
        { recursive: true },
      ),
      cp(
        resolve(root, 'packages/borrowing-base/fixtures'),
        resolve(snapshotRoot, 'packages/borrowing-base/fixtures'),
        { recursive: true },
      ),
    ]);
    await Promise.all([
      cp(resolve(chainRoot, 'foundry.toml'), resolve(snapshotRoot, 'chain/foundry.toml')),
      cp(resolve(chainRoot, 'foundry.lock'), resolve(snapshotRoot, 'chain/foundry.lock')),
      cp(expectedPath, resolve(snapshotRoot, 'chain/deployment-identities.json')),
      cp(configPath, resolve(snapshotRoot, 'chain/deploy-config.json')),
    ]);
    const config = await publicConfig();
    const expected = JSON.parse(
      await readFile(resolve(snapshotRoot, 'chain/deployment-identities.json'), 'utf8'),
    ) as ExpectedDeploymentIdentity;
    const source = await snapshotSourceIdentity(snapshotRoot);
    const context: DeploymentGuardContext = {
      ...source,
      deployScriptPath: 'script/Deploy.s.sol:Deploy',
      chainId: config.chainId,
      roles: config.roles,
    };
    const snapshotDigest = await directoryDigest(snapshotRoot);
    await restrictPath(candidateRoot, true);
    await restrictPath(writablePath, true);
    await freezeReadOnly(snapshotRoot);
    return {
      tokenId,
      sourcePath: snapshotRoot,
      writablePath,
      identity: {
        chainId: 421_614,
        ...source,
        snapshotDigest,
        roles: config.roles,
        expected,
        context,
      },
    };
  }

  async inspectCandidate(snapshot: FrozenSnapshot): Promise<CandidateRecord> {
    const candidateIdentity = identity(snapshot);
    const actual = await readArtifacts(resolve(snapshot.writablePath, 'out'));
    const deploymentDigest = deploymentCandidateDigest(
      candidateIdentity.expected,
      actual,
      candidateIdentity.context,
    );
    return {
      snapshot,
      candidateDigest: sha256Text(
        canonicalJson({ identity: candidateIdentity, actual, deploymentDigest }),
      ),
      details: actual,
    };
  }

  async validateEnvironment(snapshot: FrozenSnapshot, environment: CapturedDeploymentEnvironment) {
    assertPublicEnvironment(identity(snapshot).roles, environment);
  }

  async assertCandidateUnchanged(candidate: CandidateRecord) {
    const candidateIdentity = identity(candidate.snapshot);
    if (
      (await directoryDigest(candidate.snapshot.sourcePath)) !== candidateIdentity.snapshotDigest
    ) {
      throw new Error('candidate_source_changed');
    }
    const current = await this.inspectCandidate(candidate.snapshot);
    const baseCandidateDigest = candidate.baseCandidateDigest ?? candidate.candidateDigest;
    if (current.candidateDigest !== baseCandidateDigest)
      throw new Error('candidate_artifact_changed');
    if (candidate.environmentFingerprints) {
      const boundDigest = sha256Text(
        canonicalJson({
          baseCandidateDigest,
          fingerprints: candidate.environmentFingerprints,
        }),
      );
      if (boundDigest !== candidate.candidateDigest) throw new Error('candidate_binding_changed');
    }
  }

  async saveCandidate(candidate: CandidateRecord) {
    await writeAtomic(
      resolve(this.candidateRoot(candidate.snapshot.tokenId), 'candidate.json'),
      candidate,
    );
  }

  async loadCandidate(tokenId: string) {
    return JSON.parse(
      await readFile(resolve(this.candidateRoot(tokenId), 'candidate.json'), 'utf8'),
    ) as CandidateRecord;
  }

  async createState(state: GuardState) {
    await writeAtomic(resolve(this.candidateRoot(state.tokenId), 'state.json'), state);
  }

  async loadState(tokenId: string) {
    return JSON.parse(
      await readFile(resolve(this.candidateRoot(tokenId), 'state.json'), 'utf8'),
    ) as GuardState;
  }

  async transition(expected: GuardState, next: GuardState) {
    const lockPath = resolve(this.candidateRoot(next.tokenId), 'state.lock');
    let lock;
    try {
      lock = await open(lockPath, 'wx', 0o600);
      await restrictPath(lockPath);
    } catch {
      throw new Error('state_transition_locked');
    }
    try {
      const current = await this.loadState(next.tokenId);
      if (canonicalJson(current) !== canonicalJson(expected)) {
        throw new Error('state_transition_invalid');
      }
      await writeAtomic(resolve(this.candidateRoot(next.tokenId), 'state.json'), next);
    } finally {
      await lock.close();
      await unlink(lockPath).catch(() => undefined);
    }
  }

  async readBroadcastArtifact(candidate: CandidateRecord) {
    return JSON.parse(
      await readFile(
        resolve(candidate.snapshot.writablePath, 'broadcast/Deploy.s.sol/421614/run-latest.json'),
        'utf8',
      ),
    ) as unknown;
  }
}

class LocalProcess implements GuardProcessPort {
  run(request: ProcessRequest, environment?: CapturedDeploymentEnvironment) {
    const childEnvironment = environment ? { ...process.env, ...environment.values } : process.env;
    return runFile(request.executable, request.args, root, childEnvironment);
  }
}

class ReadOnlyRpc implements RpcChainPort {
  async chainId(environment: CapturedDeploymentEnvironment) {
    try {
      return await createPublicClient({
        transport: http(environment.values.CHAIN_RPC_URL),
      }).getChainId();
    } catch {
      throw new Error('rpc_unavailable');
    }
  }
}

class LocalEnvironment {
  capture() {
    return captureDeploymentEnvironment();
  }
}

interface ImmutableReference {
  readonly start: number;
  readonly length: number;
}

interface RuntimeArtifact {
  readonly deployedBytecode?: {
    readonly object?: unknown;
    readonly immutableReferences?: Readonly<Record<string, readonly ImmutableReference[]>>;
  };
}

function materializeRuntimeBytecode(artifact: RuntimeArtifact, values: readonly Address[]): Hex {
  const object = artifact.deployedBytecode?.object;
  if (typeof object !== 'string' || !/^0x[\da-fA-F]+$/.test(object)) {
    throw new Error('runtime_artifact_invalid');
  }
  let bytecode = object.slice(2).toLowerCase();
  const references = artifact.deployedBytecode?.immutableReferences ?? {};
  const orderedReferences = Object.entries(references).sort(
    ([left], [right]) => Number(left) - Number(right),
  );
  if (orderedReferences.length !== values.length) {
    throw new Error('runtime_immutable_binding_invalid');
  }
  for (const [[, locations], address] of orderedReferences.map(
    (entry, index) => [entry, values[index]] as const,
  )) {
    if (!address) throw new Error('runtime_immutable_binding_invalid');
    for (const location of locations) {
      if (
        !Number.isSafeInteger(location.start) ||
        !Number.isSafeInteger(location.length) ||
        location.start < 0 ||
        location.length < 20
      ) {
        throw new Error('runtime_immutable_reference_invalid');
      }
      const replacement = address
        .slice(2)
        .toLowerCase()
        .padStart(location.length * 2, '0');
      const start = location.start * 2;
      const end = start + location.length * 2;
      if (end > bytecode.length) throw new Error('runtime_immutable_reference_invalid');
      bytecode = `${bytecode.slice(0, start)}${replacement}${bytecode.slice(end)}`;
    }
  }
  return `0x${bytecode}` as Hex;
}

async function expectedLiveRuntimeHashes(
  candidate: CandidateRecord,
  addresses: DeploymentAddresses,
): Promise<RuntimeBytecodeHashes> {
  const immutableValues: Readonly<Record<ContractName, readonly Address[]>> = {
    assetRegistry: [],
    certificationAttestor: [addresses.assetRegistry, addresses.paiCertificate],
    paiCertificate: [addresses.assetRegistry],
    borrowingBaseEngine: [],
    collateralVault: [
      addresses.assetRegistry,
      addresses.paiCertificate,
      addresses.borrowingBaseEngine,
      addresses.mockUsdc,
    ],
    mockUsdc: [],
  };
  const entries = await Promise.all(
    contractNames.map(async (name) => {
      const artifact = JSON.parse(
        await readFile(
          resolve(candidate.snapshot.writablePath, 'out', artifactPaths[name]),
          'utf8',
        ),
      ) as RuntimeArtifact;
      return [
        name,
        keccak256(materializeRuntimeBytecode(artifact, immutableValues[name])),
      ] as const;
    }),
  );
  return Object.freeze(Object.fromEntries(entries) as RuntimeBytecodeHashes);
}

class StrictBroadcastValidator implements BroadcastValidationPort {
  async validate(
    artifact: unknown,
    candidate: CandidateRecord,
    environment: CapturedDeploymentEnvironment,
  ) {
    validateGuardedBroadcast(artifact);
    const candidateIdentity = identity(candidate.snapshot);
    try {
      const client = createPublicClient({
        chain: arbitrumSepolia,
        transport: http(environment.values.CHAIN_RPC_URL),
      });
      if ((await client.getChainId()) !== 421_614) throw new Error('chain');
      const deployment = await finalizeDeployment(
        artifact,
        421_614,
        candidateIdentity.roles,
        client,
      );
      verifyExpectedRuntimeBytecodeHashes(
        deployment.runtimeBytecodeHashes,
        await expectedLiveRuntimeHashes(candidate, deployment.addresses),
      );
      return { deploymentBlock: deployment.deploymentBlock };
    } catch {
      throw new Error('broadcast_validation_failed');
    }
  }
}

const store = new LocalGuardStore();
const workflow = new DeploymentGuardWorkflow({
  store,
  process: new LocalProcess(),
  rpc: new ReadOnlyRpc(),
  validator: new StrictBroadcastValidator(),
  environment: new LocalEnvironment(),
  clock: { now: () => Date.now() },
  random: { bytes: (length) => new Uint8Array(randomBytes(length)) },
});

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function readToken(): Promise<{ token: DeploymentAuthorization; path: string }> {
  const path = argument('token');
  if (!path) throw new Error('token_path_required');
  return {
    token: JSON.parse(await readFile(resolve(root, path), 'utf8')) as DeploymentAuthorization,
    path,
  };
}

async function prepare() {
  const result = await workflow.prepare();
  const candidateRoot = store.candidateRoot(result.token.tokenId);
  const tokenPath = resolve(candidateRoot, 'authorization.json');
  const noncePath = resolve(candidateRoot, 'authorization-nonce');
  await writeRestricted(tokenPath, `${JSON.stringify(result.token, null, 2)}\n`);
  await writeRestricted(noncePath, result.authorizationNonce);
  console.log(`Candidate: ${result.candidateDigest}`);
  console.log(`Token file: ${relative(root, tokenPath)}`);
  console.log(`Authorization nonce file: ${relative(root, noncePath)}`);
  console.log(`Expires at epoch ms: ${result.token.expiresAt}`);
}

async function inspect() {
  const { token } = await readToken();
  const result = await workflow.inspect(token);
  const candidate = await store.loadCandidate(token.tokenId);
  const actual = candidate.details as InspectedFoundryArtifacts;
  console.log(`Inspected candidate: ${result.candidateDigest}`);
  for (const name of contractNames) {
    console.log(`${name}: ${actual.artifacts[name].runtimeBytecodeHash}`);
  }
}

async function authorize() {
  const { token } = await readToken();
  const noncePath = argument('nonce-file');
  if (!noncePath) throw new Error('authorization_nonce_file_required');
  const absoluteNoncePath = resolve(root, noncePath);
  const nonce = (await readFile(absoluteNoncePath, 'utf8')).trim();
  await workflow.authorize(token, nonce);
  await unlink(absoluteNoncePath);
  console.log(`Authorized candidate: ${token.candidateDigest}`);
}

async function simulate() {
  const { token } = await readToken();
  const result = await workflow.simulate(token);
  console.log(`Guarded simulation gas: ${result.gasUsed}`);
}

async function broadcast() {
  const { token } = await readToken();
  await workflow.broadcast(token);
  console.log(`Guarded broadcast validated: ${token.candidateDigest}`);
}

async function main() {
  const operation = process.argv[2];
  if (operation === 'prepare') return prepare();
  if (operation === 'inspect') return inspect();
  if (operation === 'authorize') return authorize();
  if (operation === 'simulate') return simulate();
  if (operation === 'broadcast') return broadcast();
  throw new Error('Use prepare, inspect, authorize, simulate, or broadcast.');
}

void main().catch((error: unknown) => {
  const safe =
    error instanceof Error && /^[a-z0-9_ ]+$/i.test(error.message)
      ? error.message
      : 'deployment_guard_failed';
  console.error(safe);
  process.exitCode = 1;
});
