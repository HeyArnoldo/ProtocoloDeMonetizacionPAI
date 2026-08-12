/**
 * Regenera `chain/deployment-identities.json` para las fuentes actuales.
 *
 * El guard exige que las identidades esperadas se revisen y versionen **antes**
 * de un redeploy: si cambia una fuente, `prepare` corta con «Source tree hash
 * mismatch» y no continúa. Hasta ahora no existía forma de producir ese archivo,
 * así que la única salida era escribirlo a mano — justamente lo que el guard
 * intenta impedir.
 *
 * Dos reglas gobiernan este archivo:
 *
 * 1. **Los números salen del mismo código que los valida.** Se reutilizan
 *    `inspectFoundryArtifacts` y el mismo listado de `git ls-files` que usa
 *    `deployment-guard-cli`. Una segunda implementación del hash produciría un
 *    archivo que valida contra sí mismo y contra nada más.
 * 2. **Los artefactos vienen de la imagen fijada de Foundry**, no del `forge`
 *    local. El `compilerSettingsHash` y los bytecodes dependen del compilador
 *    exacto; generarlos con otra versión daría un archivo que el guard rechaza.
 *
 * Uso, desde la raíz del repo:
 *
 * ```bash
 * pnpm --filter @app/evm identities:regenerate -- --out=<ruta de artefactos>
 * ```
 */
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  inspectFoundryArtifacts,
  sha256Bytes,
  sha256Text,
  type FoundryArtifactInput,
} from './deployment-guard';
import { contractNames, type ContractName } from './deployments';

const root = resolve(import.meta.dirname, '../../..');
const chainRoot = resolve(root, 'chain');
const artifactPaths: Record<ContractName, string> = {
  assetRegistry: 'AssetRegistry.sol/AssetRegistry.json',
  certificationAttestor: 'CertificationAttestor.sol/CertificationAttestor.json',
  paiCertificate: 'PAICertificate.sol/PAICertificate.json',
  borrowingBaseEngine: 'BorrowingBaseEngine.sol/BorrowingBaseEngine.json',
  collateralVault: 'CollateralVault.sol/CollateralVault.json',
  mockUsdc: 'MockUSDC.sol/MockUSDC.json',
};

function git(args: readonly string[]): Promise<string> {
  return new Promise((resolveResult, reject) => {
    execFile('git', [...args], { cwd: root, shell: false }, (error, stdout) => {
      if (error || !String(stdout).trim()) return reject(new Error('source_identity_unavailable'));
      resolveResult(String(stdout).trim());
    });
  });
}

/**
 * Idéntico al de `deployment-guard-cli`: mismos paths, mismo orden, mismo hash.
 * Si los dos se separan, el archivo generado deja de valer.
 */
async function sourceIdentity() {
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
    if (!match) throw new Error('source_identity_unavailable');
    const [, mode, objectHash, path] = match;
    // Los submódulos se identifican por su commit; el resto por el contenido
    // real del archivo, no por el OID del índice. Confundirlos produce un hash
    // que no coincide con el del guard y bloquea el redeploy.
    entries.push(
      mode === '160000'
        ? `${path}\0${objectHash}`
        : `${path}\0${sha256Bytes(await readFile(resolve(root, path!)))}`,
    );
  }
  return {
    sourceTreeHash: sha256Text(entries.sort().join('\n')),
    deployScriptHash: sha256Bytes(await readFile(resolve(chainRoot, 'script/Deploy.s.sol'))),
  };
}

async function main() {
  const outFlag = process.argv.find((value) => value.startsWith('--out='))?.slice('--out='.length);
  if (!outFlag) throw new Error('Pass --out=<ruta al directorio out de la imagen fijada>');
  const outPath = resolve(process.cwd(), outFlag);

  const inputs = Object.fromEntries(
    await Promise.all(
      contractNames.map(async (name) => {
        const artifactJson = await readFile(resolve(outPath, artifactPaths[name]), 'utf8');
        return [name, { ...(JSON.parse(artifactJson) as FoundryArtifactInput), artifactJson }];
      }),
    ),
  ) as Record<ContractName, FoundryArtifactInput>;

  const inspected = inspectFoundryArtifacts(inputs);
  const source = await sourceIdentity();
  const identities = {
    version: 1,
    compilerVersion: inspected.compilerVersion,
    compilerSettingsHash: inspected.compilerSettingsHash,
    sourceTreeHash: source.sourceTreeHash,
    deployScriptHash: source.deployScriptHash,
    artifacts: Object.fromEntries(
      contractNames.map((name) => [
        name,
        {
          artifactSha256: inspected.artifacts[name].artifactSha256,
          creationBytecodeHash: inspected.artifacts[name].creationBytecodeHash,
          runtimeBytecodeHash: inspected.artifacts[name].runtimeBytecodeHash,
        },
      ]),
    ),
  };

  const target = resolve(chainRoot, 'deployment-identities.json');
  await writeFile(target, `${JSON.stringify(identities, null, 2)}\n`);
  console.log(`deployment-identities.json regenerado desde ${outPath}`);
  console.log(`  sourceTreeHash      ${identities.sourceTreeHash}`);
  console.log(`  compilerVersion     ${identities.compilerVersion}`);
  for (const name of contractNames) {
    console.log(`  ${name.padEnd(22)}${inspected.artifacts[name].runtimeBytecodeHash}`);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'identities_regeneration_failed');
  process.exitCode = 1;
});
