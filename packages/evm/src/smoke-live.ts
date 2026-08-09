import { getAddress, type Hex, type PublicClient } from 'viem';
import type { LiveDeployment } from './deployments';
import {
  assetRegistryAbi,
  certificationAttestorAbi,
  collateralVaultAbi,
  mockUSDCAbi,
  paiCertificateAbi,
} from './generated/abis';
import { type SmokeChainState } from './smoke-executor';
import { DEMO_ASSET_ID, type SmokeAccounts } from './smoke';

export async function readSmokeState(
  client: PublicClient,
  deployment: LiveDeployment,
  accounts: SmokeAccounts,
): Promise<SmokeChainState> {
  const { addresses } = deployment;
  const exists = await client.readContract({
    address: addresses.assetRegistry,
    abi: assetRegistryAbi,
    functionName: 'exists',
    args: [DEMO_ASSET_ID],
  });
  const [attestations, certificateValid, rawLoan, borrowerBalance, lenderBalance, vaultBalance] =
    await Promise.all([
      Promise.all(
        accounts.certifiers.map((certifier, kind) =>
          client.readContract({
            address: addresses.certificationAttestor,
            abi: certificationAttestorAbi,
            functionName: 'getAttestation',
            args: [DEMO_ASSET_ID, kind, certifier.address],
          }),
        ),
      ),
      client.readContract({
        address: addresses.paiCertificate,
        abi: paiCertificateAbi,
        functionName: 'isValid',
        args: [DEMO_ASSET_ID],
      }),
      client.readContract({
        address: addresses.collateralVault,
        abi: collateralVaultAbi,
        functionName: 'getLoan',
        args: [DEMO_ASSET_ID],
      }),
      ...[accounts.borrower.address, accounts.lender.address, addresses.collateralVault].map(
        (account) =>
          client.readContract({
            address: addresses.mockUsdc,
            abi: mockUSDCAbi,
            functionName: 'balanceOf',
            args: [account],
          }),
      ),
    ]);
  const [borrowerAllowance, lenderAllowance] = await Promise.all(
    [accounts.borrower.address, accounts.lender.address].map((owner) =>
      client.readContract({
        address: addresses.mockUsdc,
        abi: mockUSDCAbi,
        functionName: 'allowance',
        args: [owner, addresses.collateralVault],
      }),
    ),
  );
  const asset = exists
    ? await client.readContract({
        address: addresses.assetRegistry,
        abi: assetRegistryAbi,
        functionName: 'getAsset',
        args: [DEMO_ASSET_ID],
      })
    : null;
  return {
    asset: asset
      ? {
          merkleRoot: asset.merkleRoot,
          ownerIdHash: asset.ownerIdHash,
          controller: getAddress(asset.controller),
          status: asset.status,
        }
      : null,
    attestations: attestations.map((item) =>
      item.exists && item.revokedAt === 0n ? item.certificateHash : null,
    ) as [Hex | null, Hex | null, Hex | null],
    loan:
      rawLoan.state === 0
        ? null
        : {
            borrower: getAddress(rawLoan.borrower),
            lender: getAddress(rawLoan.lender),
            principal: rawLoan.principal,
            dueAt: rawLoan.dueAt,
            state: rawLoan.state,
          },
    certificateValid,
    balances: {
      borrower: borrowerBalance!,
      lender: lenderBalance!,
      vault: vaultBalance!,
    },
    allowances: { borrower: borrowerAllowance!, lender: lenderAllowance! },
  };
}
