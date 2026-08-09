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
export interface DeploymentRoles {
  readonly admin: Address;
  readonly borrower: Address;
  readonly lender: Address;
  readonly certifiers: readonly [Address, Address, Address];
}
export interface LiveDeployment extends Deployment {
  readonly deploymentBlock: number;
  readonly roles: DeploymentRoles;
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

export function parseLiveDeployment(value: unknown): LiveDeployment {
  const input = object(value);
  const deployment = parseDeployment(input);
  if (!Number.isSafeInteger(input.deploymentBlock) || Number(input.deploymentBlock) <= 0) {
    throw new RangeError('deploymentBlock must be a positive safe integer.');
  }
  const roleInput = object(input.roles);
  const roleAddress = (name: string): Address => {
    if (typeof roleInput[name] !== 'string')
      throw new TypeError(`roles.${name} must be an address.`);
    return getAddress(roleInput[name]);
  };
  if (!Array.isArray(roleInput.certifiers) || roleInput.certifiers.length !== 3) {
    throw new TypeError('roles.certifiers must contain exactly three addresses.');
  }
  const certifiers = roleInput.certifiers.map((value, index) => {
    if (typeof value !== 'string')
      throw new TypeError(`roles.certifiers[${index}] must be an address.`);
    return getAddress(value);
  }) as [Address, Address, Address];
  return Object.freeze({
    ...deployment,
    deploymentBlock: Number(input.deploymentBlock),
    roles: Object.freeze({
      admin: roleAddress('admin'),
      borrower: roleAddress('borrower'),
      lender: roleAddress('lender'),
      certifiers: Object.freeze(certifiers),
    }),
  });
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
