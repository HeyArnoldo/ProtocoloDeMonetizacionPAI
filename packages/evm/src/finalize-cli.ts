import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getAddress } from 'viem';
import { finalizeDeployment } from './deployment-finalizer';

const requiredAddress = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return getAddress(value);
};
async function main() {
  const chainIdArgument = process.argv.find((value) => value.startsWith('--chain-id='));
  const chainId = Number(chainIdArgument?.split('=')[1] ?? 421_614);
  if (!Number.isSafeInteger(chainId) || chainId <= 0)
    throw new Error('--chain-id must be positive.');
  const roles = {
    admin: requiredAddress('ADMIN_ADDRESS'),
    borrower: requiredAddress('BORROWER_ADDRESS'),
    lender: requiredAddress('LENDER_ADDRESS'),
    certifiers: [
      requiredAddress('CERTIFIER_REVENUE_ADDRESS'),
      requiredAddress('CERTIFIER_RIGHTS_ADDRESS'),
      requiredAddress('CERTIFIER_SERVICE_ADDRESS'),
    ],
  } as const;
  const chainRoot = resolve(process.cwd(), '../../chain');
  const broadcastPath = resolve(chainRoot, `broadcast/Deploy.s.sol/${chainId}/run-latest.json`);
  const outputPath = resolve(chainRoot, `deployments/${chainId}.json`);
  const broadcast = JSON.parse(await readFile(broadcastPath, 'utf8')) as unknown;
  const deployment = finalizeDeployment(broadcast, chainId, roles);
  await writeFile(outputPath, `${JSON.stringify(deployment, null, 2)}\n`, { encoding: 'utf8' });
  console.log(
    `Deployment metadata finalized for chain ${chainId} at block ${deployment.deploymentBlock}.`,
  );
}

void main();
