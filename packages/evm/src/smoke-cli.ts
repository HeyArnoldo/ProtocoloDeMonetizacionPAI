import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPublicClient, formatEther, http, type Address } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import {
  assetRegistryAbi,
  certificationAttestorAbi,
  collateralVaultAbi,
  mockUSDCAbi,
  paiCertificateAbi,
} from './generated/abis';
import { buildDemoPlan, DEMO_ASSET_ID, deriveRoleAccounts, validateSmokeConfig } from './smoke';
import { assertBroadcastRequest, hashDeploymentMetadata, hashSmokePlan } from './smoke-executor';
import { readSmokeState } from './smoke-live';
import { verifyRuntimeBytecodeHashes } from './deployments';
import { safeErrorLine, type SmokeOperation } from './operational-error';

let operation: SmokeOperation = 'startup';

async function main() {
  const mnemonic = process.env.DEMO_ROLE_MNEMONIC;
  const rpcUrl = process.env.CHAIN_RPC_URL;
  if (!mnemonic) throw new Error('DEMO_ROLE_MNEMONIC is required.');
  if (!rpcUrl) throw new Error('CHAIN_RPC_URL is required.');
  const accounts = deriveRoleAccounts(mnemonic);
  const metadataPath = resolve(process.cwd(), '../../chain/deployments/421614.json');
  const deployment = validateSmokeConfig(
    JSON.parse(await readFile(metadataPath, 'utf8')),
    accounts,
  );
  const valuationDate = BigInt(Math.floor(Date.now() / 86_400_000) * 86_400);
  const plan = buildDemoPlan(deployment, accounts, valuationDate);
  const args = process.argv.slice(2);
  const broadcast = args.includes('--broadcast');
  const planMode = args.includes('plan');
  const confirmationIndex = args.indexOf('--confirm-plan');
  const confirmedPlanHash = confirmationIndex < 0 ? undefined : args[confirmationIndex + 1];
  const known = new Set(['preflight', 'plan', '--broadcast', '--confirm-plan', confirmedPlanHash]);
  const unknown = args.filter((argument) => !known.has(argument));
  if (unknown.length > 0) throw new Error(`Unsupported argument: ${unknown[0]}`);
  if (confirmationIndex >= 0 && !confirmedPlanHash) {
    throw new Error('--confirm-plan requires a hash.');
  }

  operation = 'rpc-preflight';
  const client = createPublicClient({ chain: arbitrumSepolia, transport: http(rpcUrl) });
  const chainId = await client.getChainId();
  if (chainId !== deployment.chainId)
    throw new Error(`RPC chainId ${chainId} does not match metadata.`);
  const currentBlock = await client.getBlockNumber();
  if (currentBlock < BigInt(deployment.deploymentBlock))
    throw new Error('RPC is behind deploymentBlock.');
  await client.getBlock({ blockNumber: BigInt(deployment.deploymentBlock) });

  await verifyRuntimeBytecodeHashes(deployment, client);
  const [
    registryAttestor,
    registryVault,
    certificateRegistry,
    attestorRegistry,
    attestorCertificate,
    vaultRegistry,
    vaultCertificate,
    vaultEngine,
    vaultToken,
  ] = await Promise.all([
    client.readContract({
      address: deployment.addresses.assetRegistry,
      abi: assetRegistryAbi,
      functionName: 'ATTESTOR_ROLE',
    }),
    client.readContract({
      address: deployment.addresses.assetRegistry,
      abi: assetRegistryAbi,
      functionName: 'VAULT_ROLE',
    }),
    client.readContract({
      address: deployment.addresses.paiCertificate,
      abi: paiCertificateAbi,
      functionName: 'registry',
    }),
    client.readContract({
      address: deployment.addresses.certificationAttestor,
      abi: certificationAttestorAbi,
      functionName: 'registry',
    }),
    client.readContract({
      address: deployment.addresses.certificationAttestor,
      abi: certificationAttestorAbi,
      functionName: 'certificate',
    }),
    client.readContract({
      address: deployment.addresses.collateralVault,
      abi: collateralVaultAbi,
      functionName: 'registry',
    }),
    client.readContract({
      address: deployment.addresses.collateralVault,
      abi: collateralVaultAbi,
      functionName: 'certificate',
    }),
    client.readContract({
      address: deployment.addresses.collateralVault,
      abi: collateralVaultAbi,
      functionName: 'engine',
    }),
    client.readContract({
      address: deployment.addresses.collateralVault,
      abi: collateralVaultAbi,
      functionName: 'token',
    }),
  ]);
  const wiring = [
    [certificateRegistry, deployment.addresses.assetRegistry],
    [attestorRegistry, deployment.addresses.assetRegistry],
    [attestorCertificate, deployment.addresses.paiCertificate],
    [vaultRegistry, deployment.addresses.assetRegistry],
    [vaultCertificate, deployment.addresses.paiCertificate],
    [vaultEngine, deployment.addresses.borrowingBaseEngine],
    [vaultToken, deployment.addresses.mockUsdc],
  ] as const;
  if (wiring.some(([actual, expected]) => actual !== expected))
    throw new Error('Contract wiring mismatch.');

  const [adminRole, pauserRole, issuerRole, certifierRole] = await Promise.all([
    client.readContract({
      address: deployment.addresses.assetRegistry,
      abi: assetRegistryAbi,
      functionName: 'DEFAULT_ADMIN_ROLE',
    }),
    client.readContract({
      address: deployment.addresses.assetRegistry,
      abi: assetRegistryAbi,
      functionName: 'PAUSER_ROLE',
    }),
    client.readContract({
      address: deployment.addresses.paiCertificate,
      abi: paiCertificateAbi,
      functionName: 'ISSUER_ROLE',
    }),
    client.readContract({
      address: deployment.addresses.certificationAttestor,
      abi: certificationAttestorAbi,
      functionName: 'CERTIFIER_ROLE',
    }),
  ]);
  const roleChecks = await Promise.all([
    client.readContract({
      address: deployment.addresses.assetRegistry,
      abi: assetRegistryAbi,
      functionName: 'hasRole',
      args: [adminRole, deployment.roles.admin],
    }),
    client.readContract({
      address: deployment.addresses.assetRegistry,
      abi: assetRegistryAbi,
      functionName: 'hasRole',
      args: [pauserRole, deployment.roles.admin],
    }),
    client.readContract({
      address: deployment.addresses.assetRegistry,
      abi: assetRegistryAbi,
      functionName: 'hasRole',
      args: [registryAttestor, deployment.addresses.certificationAttestor],
    }),
    client.readContract({
      address: deployment.addresses.assetRegistry,
      abi: assetRegistryAbi,
      functionName: 'hasRole',
      args: [registryVault, deployment.addresses.collateralVault],
    }),
    client.readContract({
      address: deployment.addresses.paiCertificate,
      abi: paiCertificateAbi,
      functionName: 'hasRole',
      args: [issuerRole, deployment.addresses.certificationAttestor],
    }),
    ...deployment.roles.certifiers.map((certifier) =>
      client.readContract({
        address: deployment.addresses.certificationAttestor,
        abi: certificationAttestorAbi,
        functionName: 'hasRole',
        args: [certifierRole, certifier],
      }),
    ),
  ]);
  if (roleChecks.some((granted) => !granted)) throw new Error('Required role grant is missing.');

  const roleAddresses = [
    deployment.roles.admin,
    deployment.roles.borrower,
    deployment.roles.lender,
    ...deployment.roles.certifiers,
  ];
  const balances = await Promise.all(
    roleAddresses.map(async (address: Address) => ({
      address,
      native: await client.getBalance({ address }),
      mockUsdc: String(
        await client.readContract({
          address: deployment.addresses.mockUsdc,
          abi: mockUSDCAbi,
          functionName: 'balanceOf',
          args: [address],
        }),
      ),
    })),
  );
  if (balances.slice(1).some(({ native }) => native === 0n)) {
    throw new Error('A transaction signer has no native balance.');
  }
  const assetExists = await client.readContract({
    address: deployment.addresses.assetRegistry,
    abi: assetRegistryAbi,
    functionName: 'exists',
    args: [DEMO_ASSET_ID],
  });
  const state = assetExists
    ? {
        asset: await client.readContract({
          address: deployment.addresses.assetRegistry,
          abi: assetRegistryAbi,
          functionName: 'getAsset',
          args: [DEMO_ASSET_ID],
        }),
        certificateValid: await client.readContract({
          address: deployment.addresses.paiCertificate,
          abi: paiCertificateAbi,
          functionName: 'isValid',
          args: [DEMO_ASSET_ID],
        }),
        loan: await client.readContract({
          address: deployment.addresses.collateralVault,
          abi: collateralVaultAbi,
          functionName: 'getLoan',
          args: [DEMO_ASSET_ID],
        }),
      }
    : null;
  const planHash = hashSmokePlan(deployment, plan, valuationDate);
  await readSmokeState(client, deployment, accounts);
  console.log(
    JSON.stringify(
      {
        mode: broadcast ? 'broadcast-preflight' : planMode ? 'plan' : 'preflight',
        chainId,
        currentBlock: String(currentBlock),
        deploymentBlock: deployment.deploymentBlock,
        bytecodeHashes: deployment.runtimeBytecodeHashes,
        wiring: true,
        roles: true,
        balances: balances.map(({ address, native, mockUsdc }) => ({
          address,
          native: formatEther(native),
          mockUsdc,
        })),
        demo: { assetId: DEMO_ASSET_ID, exists: assetExists, state },
        plannedTransactions: plan.transactions.length,
        finalReadbackGoal: plan.readback,
        deploymentMetadataHash: hashDeploymentMetadata(deployment),
        planHash,
      },
      (_, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    ),
  );
  if (planMode) {
    console.log('Planned transactions (read-only; no transaction has been sent):');
    plan.transactions.forEach((step, index) =>
      console.log(`${index + 1}. ${step.action} | signer=${step.signer} | to=${step.intent.to}`),
    );
  }
  if (broadcast) {
    operation = 'broadcast';
    assertBroadcastRequest(chainId, planHash, confirmedPlanHash);
  }
}

void main().catch((error: unknown) => {
  console.error(safeErrorLine(operation, error));
  process.exitCode = 1;
});
