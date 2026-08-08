import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const contracts = [
  ['AssetRegistry', 'assetRegistryAbi'],
  ['CertificationAttestor', 'certificationAttestorAbi'],
  ['PAICertificate', 'paiCertificateAbi'],
  ['BorrowingBaseEngine', 'borrowingBaseEngineAbi'],
  ['CollateralVault', 'collateralVaultAbi'],
  ['MockUSDC', 'mockUSDCAbi'],
];
const lines = ["import type { Abi } from 'viem';", ''];

for (const [name, symbol] of contracts) {
  const artifactPath = resolve(root, `chain/out/${name}.sol/${name}.json`);
  const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
  if (!Array.isArray(artifact.abi)) throw new Error(`Artifact has no ABI: ${artifactPath}`);
  lines.push(
    '// prettier-ignore',
    `export const ${symbol} = ${JSON.stringify(artifact.abi)} as const satisfies Abi;`,
  );
}

const output = resolve(root, 'packages/evm/src/generated/abis.ts');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${lines.join('\n')}\n`);
console.log(`Generated ${contracts.length} ABIs from chain/out`);
