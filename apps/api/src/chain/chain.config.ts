import { parseDeployment, type Deployment } from '@app/evm';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation';

export interface ChainRuntimeConfig {
  readonly rpcUrl?: string;
  readonly deployment?: Deployment;
  readonly deploymentBlock?: bigint;
}

export function chainRuntimeConfig(config: ConfigService<Env, true>): ChainRuntimeConfig {
  const deploymentBlock = config.get('CHAIN_DEPLOYMENT_BLOCK', { infer: true });
  const addressKeys = {
    assetRegistry: 'ASSET_REGISTRY_ADDRESS',
    certificationAttestor: 'CERTIFICATION_ATTESTOR_ADDRESS',
    paiCertificate: 'PAI_CERTIFICATE_ADDRESS',
    borrowingBaseEngine: 'BORROWING_BASE_ENGINE_ADDRESS',
    collateralVault: 'COLLATERAL_VAULT_ADDRESS',
    mockUsdc: 'MOCK_USDC_ADDRESS',
  } as const;
  const addresses = Object.fromEntries(
    Object.entries(addressKeys).map(([name, key]) => [name, config.get(key, { infer: true })]),
  );
  const configured = Object.values(addresses).some(Boolean);
  return {
    rpcUrl: config.get('CHAIN_RPC_URL', { infer: true }),
    deploymentBlock: deploymentBlock === undefined ? undefined : BigInt(deploymentBlock),
    deployment: configured
      ? parseDeployment({ chainId: config.get('CHAIN_ID', { infer: true }), addresses })
      : undefined,
  };
}

export const CHAIN_RUNTIME_CONFIG = Symbol('CHAIN_RUNTIME_CONFIG');
