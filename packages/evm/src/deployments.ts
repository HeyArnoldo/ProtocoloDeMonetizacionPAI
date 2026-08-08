import { getAddress, type Address } from 'viem';

export const contractNames = [
  'assetRegistry',
  'certificationAttestor',
  'paiCertificate',
  'borrowingBaseEngine',
  'collateralVault',
  'mockUsdc',
] as const;

export type ContractName = (typeof contractNames)[number];
export type DeploymentAddresses = Readonly<Record<ContractName, Address>>;
export interface Deployment {
  readonly chainId: number;
  readonly addresses: DeploymentAddresses;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Deployment metadata must be an object.');
  }
  return value as Record<string, unknown>;
}

export function parseDeployment(value: unknown): Deployment {
  const input = object(value);
  if (!Number.isSafeInteger(input.chainId) || Number(input.chainId) <= 0) {
    throw new RangeError('chainId must be a positive safe integer.');
  }
  const entries = object(input.addresses);
  const addresses = Object.fromEntries(
    contractNames.map((name) => {
      if (typeof entries[name] !== 'string') {
        throw new TypeError(`${name} must be an address.`);
      }
      return [name, getAddress(entries[name])];
    }),
  ) as DeploymentAddresses;
  return Object.freeze({ chainId: Number(input.chainId), addresses: Object.freeze(addresses) });
}

export function parseDeployments(values: readonly unknown[]): Readonly<Record<number, Deployment>> {
  const result: Record<number, Deployment> = {};
  for (const value of values) {
    const deployment = parseDeployment(value);
    if (result[deployment.chainId]) throw new Error(`Duplicate chainId ${deployment.chainId}.`);
    result[deployment.chainId] = deployment;
  }
  return Object.freeze(result);
}
