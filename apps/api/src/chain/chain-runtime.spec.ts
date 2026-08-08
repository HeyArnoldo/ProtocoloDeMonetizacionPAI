import { assetRegistryAbi, parseDeployment } from '@app/evm';
import { BadRequestException } from '@nestjs/common';
import { decodeFunctionData, getAddress } from 'viem';
import { validateEnv } from '../config/env.validation';
import type { User } from '../users/user.entity';
import { ArbitrumChainAdapter } from './adapters/arbitrum.adapter';
import { ChainIntentController } from './chain-intent.controller';
import { ChainIntentService } from './chain-intent.service';
import { chainRuntimeConfig } from './chain.config';

const address = (digit: string) => `0x${digit.repeat(40)}`;
const bytes32 = (digit: string) => `0x${digit.repeat(64)}` as const;
const addresses = {
  assetRegistry: address('1'),
  certificationAttestor: address('2'),
  paiCertificate: address('3'),
  borrowingBaseEngine: address('4'),
  collateralVault: address('5'),
  mockUsdc: address('6'),
};
const deployment = parseDeployment({ chainId: 421614, addresses });

describe('chain runtime boundary', () => {
  it('accepts an empty optional RPC URL for the in-memory example', () => {
    expect(
      validateEnv({
        DB_HOST: 'localhost',
        DB_USER: 'app',
        DB_PASSWORD: 'app',
        DB_NAME: 'app',
        JWT_SECRET: '0123456789abcdef',
        STORAGE_REGION: 'local',
        STORAGE_BUCKET: 'bucket',
        STORAGE_ACCESS_KEY: 'key',
        STORAGE_SECRET_KEY: 'secret',
        CHAIN_ADAPTER: 'in-memory',
        CHAIN_RPC_URL: '',
      }).CHAIN_RPC_URL,
    ).toBeUndefined();
  });

  it('validates configured deployment metadata', () => {
    const values = {
      CHAIN_ID: 421614,
      CHAIN_RPC_URL: 'https://rpc.example',
      ASSET_REGISTRY_ADDRESS: addresses.assetRegistry,
      CERTIFICATION_ATTESTOR_ADDRESS: addresses.certificationAttestor,
      PAI_CERTIFICATE_ADDRESS: addresses.paiCertificate,
      BORROWING_BASE_ENGINE_ADDRESS: addresses.borrowingBaseEngine,
      COLLATERAL_VAULT_ADDRESS: addresses.collateralVault,
      MOCK_USDC_ADDRESS: addresses.mockUsdc,
    };
    const config = { get: (key: keyof typeof values) => values[key] };
    expect(chainRuntimeConfig(config as never).deployment).toEqual(deployment);
    expect(() =>
      chainRuntimeConfig({ get: (key: string) => (key === 'CHAIN_ID' ? 421614 : 'bad') } as never),
    ).toThrow();
  });

  it('derives register ownership from CurrentUser and returns JSON-safe value', () => {
    const service = new ChainIntentService({ deployment });
    const intent = service.build('register', 'user-1', {
      assetId: bytes32('a'),
      merkleRoot: bytes32('b'),
      ownerIdHash: bytes32('f'),
    });
    const decoded = decodeFunctionData({ abi: assetRegistryAbi, data: intent.data });
    expect(decoded.functionName).toBe('registerAsset');
    expect(decoded.args?.[2]).not.toBe(bytes32('f'));
    expect(intent).toMatchObject({
      chainId: 421614,
      to: getAddress(addresses.assetRegistry),
      value: '0',
    });
  });

  it('converts currency strings and rejects malformed calldata input', () => {
    const service = new ChainIntentService({ deployment });
    expect(service.build('approve', 'user-1', { amount: '1000000' }).data).toMatch(/^0x/);
    expect(() => service.build('fund', 'user-1', { assetId: 'bad' })).toThrow(BadRequestException);
  });

  it.each(['attest', 'revoke'] as const)('rejects coerced %s kinds', (action) => {
    const service = new ChainIntentService({ deployment });
    for (const kind of [undefined, null, '', '0', false]) {
      expect(() =>
        service.build(action, 'user-1', {
          assetId: bytes32('a'),
          certificateHash: bytes32('b'),
          kind,
        }),
      ).toThrow(BadRequestException);
    }
  });

  it('controller passes authenticated identity to the service', () => {
    const service = { build: jest.fn(() => ({ value: '0' })) } as never;
    const controller = new ChainIntentController(service);
    controller.build({ id: 'user-7' } as User, 'repay', { assetId: bytes32('a') });
    expect((service as unknown as { build: jest.Mock }).build).toHaveBeenCalledWith(
      'repay',
      'user-7',
      { assetId: bytes32('a') },
    );
  });

  it('uses public reads and refuses server-side writes', async () => {
    const readContract = jest.fn().mockResolvedValue({
      merkleRoot: bytes32('b'),
      ownerIdHash: bytes32('c'),
      controller: address('7'),
      registeredAt: 1n,
      status: 0,
      exists: true,
    });
    const adapter = new ArbitrumChainAdapter('https://rpc.example', deployment, {
      readContract,
    });
    await expect(adapter.getAsset(bytes32('a'))).rejects.toThrow(/attestation aggregation/);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'getAsset' }),
    );
    readContract.mockResolvedValueOnce({ exists: false });
    await expect(adapter.getAsset(bytes32('f'))).resolves.toBeNull();
    await expect(adapter.registerAsset({} as never)).rejects.toThrow(/never signs/);
  });
});
