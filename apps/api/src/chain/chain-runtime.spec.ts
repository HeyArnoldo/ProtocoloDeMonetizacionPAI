import { assetRegistryAbi, parseDeployment } from '@app/evm';
import { BadRequestException } from '@nestjs/common';
import { decodeFunctionData, getAddress } from 'viem';
import { validateEnv } from '../config/env.validation';
import { AttestationKind } from './chain.port';
import type { User } from '../users/user.entity';
import { activeAttestations, ArbitrumChainAdapter } from './adapters/arbitrum.adapter';
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
const chainAsset = {
  merkleRoot: bytes32('b'),
  ownerIdHash: bytes32('c'),
  controller: address('7'),
  registeredAt: 1n,
  status: 1,
  exists: true,
};
const event = (
  eventName: 'Attested' | 'AttestationRevoked',
  block: number,
  kind: number,
  certifier = address(String(kind + 7)),
  assetId = bytes32('a'),
) => ({
  eventName,
  args: {
    assetId,
    kind,
    certifier,
    certificateHash: eventName === 'Attested' ? bytes32(String(kind + 1)) : undefined,
    attestedAt: eventName === 'Attested' ? BigInt(block) : undefined,
  },
  blockNumber: BigInt(block),
  transactionIndex: 0,
  logIndex: 0,
  transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
});
const reader = (overrides: Record<string, unknown> = {}) => ({
  getChainId: jest.fn().mockResolvedValue(421614),
  getBlock: jest.fn().mockResolvedValue({ number: 999n }),
  readContract: jest.fn().mockResolvedValue(chainAsset),
  getContractEvents: jest.fn().mockResolvedValue([]),
  ...overrides,
});
const adapter = (rpc: ReturnType<typeof reader>) =>
  new ArbitrumChainAdapter('https://rpc.example', deployment, 100n, rpc as never);

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
      CHAIN_DEPLOYMENT_BLOCK: 100,
      ASSET_REGISTRY_ADDRESS: addresses.assetRegistry,
      CERTIFICATION_ATTESTOR_ADDRESS: addresses.certificationAttestor,
      PAI_CERTIFICATE_ADDRESS: addresses.paiCertificate,
      BORROWING_BASE_ENGINE_ADDRESS: addresses.borrowingBaseEngine,
      COLLATERAL_VAULT_ADDRESS: addresses.collateralVault,
      MOCK_USDC_ADDRESS: addresses.mockUsdc,
    };
    const config = { get: (key: keyof typeof values) => values[key] };
    expect(chainRuntimeConfig(config as never).deployment).toEqual(deployment);
    expect(chainRuntimeConfig(config as never).deploymentBlock).toBe(100n);
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

  it('rejects an RPC connected to a different chain before reading', async () => {
    const rpc = reader({ getChainId: jest.fn().mockResolvedValue(1) });
    await expect(adapter(rpc).getAsset(bytes32('a'))).rejects.toThrow(/does not match/);
    expect(rpc.readContract).not.toHaveBeenCalled();
  });

  it('returns null for a missing asset and rejects unknown registry status', async () => {
    await expect(
      adapter(reader({ readContract: jest.fn().mockResolvedValue({ exists: false }) })).getAsset(
        bytes32('a'),
      ),
    ).resolves.toBeNull();
    await expect(
      adapter(
        reader({ readContract: jest.fn().mockResolvedValue({ ...chainAsset, status: 99 }) }),
      ).getAsset(bytes32('a')),
    ).rejects.toThrow(/Unknown on-chain asset status/);
  });

  it('reduces three active kinds with asset filtering and duplicate safety', () => {
    const logs = [event('Attested', 3, 2), event('Attested', 1, 0), event('Attested', 2, 1)];
    const removed = { ...event('AttestationRevoked', 4, 0), removed: true };
    expect(
      activeAttestations(bytes32('a'), [
        ...logs,
        logs[1]!,
        removed,
        event('Attested', 5, 0, address('9'), bytes32('f')),
      ] as never).map(({ kind }) => kind),
    ).toEqual([
      AttestationKind.RevenueVerified,
      AttestationKind.RightsAssignable,
      AttestationKind.ServiceContinuity,
    ]);
  });

  it('handles revocation and later re-attestation in chain order', () => {
    const certifier = address('7');
    const active = activeAttestations(bytes32('a'), [
      event('Attested', 30, 0, certifier),
      event('Attested', 10, 0, certifier),
      event('AttestationRevoked', 20, 0, certifier),
    ] as never);
    expect(active).toHaveLength(1);
    expect(active[0]?.attestedAt).toEqual(new Date(30_000));
  });

  it('uses bounded safe-block logs and propagates RPC log failures', async () => {
    const logs = [event('Attested', 101, 0), event('Attested', 102, 1), event('Attested', 103, 2)];
    const successfulEvents = jest.fn(({ eventName }: { eventName: string }) =>
      Promise.resolve(logs.filter((log) => log.eventName === eventName)),
    );
    const current = await adapter(reader({ getContractEvents: successfulEvents })).getAsset(
      bytes32('a'),
    );
    expect(current?.attestations).toHaveLength(3);
    expect(successfulEvents).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: 100n, toBlock: 999n }),
    );
    const getContractEvents = jest.fn().mockRejectedValueOnce(new Error('RPC logs unavailable'));
    await expect(adapter(reader({ getContractEvents })).getAsset(bytes32('a'))).rejects.toThrow(
      /RPC logs unavailable/,
    );
    expect(getContractEvents).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: 100n, toBlock: 999n }),
    );
    await expect(adapter(reader()).registerAsset({} as never)).rejects.toThrow(/never signs/);
  });
});
