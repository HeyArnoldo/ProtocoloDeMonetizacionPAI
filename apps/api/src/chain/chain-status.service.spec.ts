import { parseDeployment } from '@app/evm';
import { chainStatusSchema } from '@app/contracts';
import { ChainStatusService, CHAIN_STATUS_TTL_MS } from './chain-status.service';
import type { ChainPort } from './chain.port';
import type { ChainRuntimeConfig } from './chain.config';

const address = (digit: string) => `0x${digit.repeat(40)}`;
const addresses = {
  assetRegistry: address('1'),
  certificationAttestor: address('2'),
  paiCertificate: address('3'),
  borrowingBaseEngine: address('4'),
  collateralVault: address('5'),
  mockUsdc: address('6'),
};
const deployment = parseDeployment({ chainId: 421614, addresses });

const runtime = (overrides: Partial<ChainRuntimeConfig> = {}): ChainRuntimeConfig => ({
  rpcUrl: 'https://rpc.example',
  deployment,
  deploymentBlock: 296546459n,
  explorerUrl: 'https://sepolia.arbiscan.io',
  ...overrides,
});

const port = (status: unknown, fail?: Error) =>
  ({
    getNetworkStatus: jest.fn(() => (fail ? Promise.reject(fail) : Promise.resolve(status))),
  }) as unknown as jest.Mocked<ChainPort>;

const live = { network: 'arbitrum', chainId: 421614, safeBlock: 297262745n, headBlock: 297265110n };

describe('ChainStatusService', () => {
  it('reports the chain as live with both block heights as decimal strings', async () => {
    const service = new ChainStatusService(port(live), runtime());

    const status = await service.get();

    expect(status).toEqual({
      status: 'live',
      network: 'arbitrum',
      chainId: 421614,
      safeBlock: '297262745',
      headBlock: '297265110',
      deploymentBlock: '296546459',
      explorerBaseUrl: 'https://sepolia.arbiscan.io',
      contracts: [
        {
          name: 'assetRegistry',
          address: addresses.assetRegistry,
          explorerUrl: `https://sepolia.arbiscan.io/address/${addresses.assetRegistry}`,
        },
        {
          name: 'certificationAttestor',
          address: addresses.certificationAttestor,
          explorerUrl: `https://sepolia.arbiscan.io/address/${addresses.certificationAttestor}`,
        },
        {
          name: 'paiCertificate',
          address: addresses.paiCertificate,
          explorerUrl: `https://sepolia.arbiscan.io/address/${addresses.paiCertificate}`,
        },
        {
          name: 'borrowingBaseEngine',
          address: addresses.borrowingBaseEngine,
          explorerUrl: `https://sepolia.arbiscan.io/address/${addresses.borrowingBaseEngine}`,
        },
        {
          name: 'collateralVault',
          address: addresses.collateralVault,
          explorerUrl: `https://sepolia.arbiscan.io/address/${addresses.collateralVault}`,
        },
        {
          name: 'mockUsdc',
          address: addresses.mockUsdc,
          explorerUrl: `https://sepolia.arbiscan.io/address/${addresses.mockUsdc}`,
        },
      ],
    });
    expect(chainStatusSchema.parse(status)).toEqual(status);
  });

  it('declares the chain unreachable instead of pretending to be live when the RPC fails', async () => {
    const service = new ChainStatusService(port(null, new Error('fetch failed')), runtime());

    const status = await service.get();

    expect(status).toMatchObject({
      status: 'unreachable',
      network: 'arbitrum',
      chainId: 421614,
      reason: 'fetch failed',
      deploymentBlock: '296546459',
    });
    expect(chainStatusSchema.parse(status)).toEqual(status);
  });

  it('reports offline when no chain is configured at all', async () => {
    const service = new ChainStatusService(
      port({ network: 'in-memory', chainId: null, safeBlock: null, headBlock: null }),
      runtime({ deployment: undefined, deploymentBlock: undefined, rpcUrl: undefined }),
    );

    const status = await service.get();

    expect(status).toEqual({ status: 'offline', network: 'in-memory', chainId: null });
    expect(chainStatusSchema.parse(status)).toEqual(status);
  });

  it('leaves explorer links null when no explorer is configured', async () => {
    const service = new ChainStatusService(port(live), runtime({ explorerUrl: undefined }));

    const status = await service.get();

    expect(status).toMatchObject({ status: 'live', explorerBaseUrl: null });
    expect(
      (status as { contracts: Array<{ explorerUrl: null }> }).contracts[0].explorerUrl,
    ).toBeNull();
  });

  it('serves a cached answer inside the TTL so a public panel cannot hammer the RPC', async () => {
    jest.useFakeTimers().setSystemTime(0);
    const chain = port(live);
    const service = new ChainStatusService(chain, runtime());

    await service.get();
    await service.get();
    expect(chain.getNetworkStatus).toHaveBeenCalledTimes(1);

    jest.setSystemTime(CHAIN_STATUS_TTL_MS + 1);
    await service.get();
    expect(chain.getNetworkStatus).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('does not cache a failure: the next poll retries the RPC', async () => {
    jest.useFakeTimers().setSystemTime(0);
    const chain = port(null, new Error('fetch failed'));
    const service = new ChainStatusService(chain, runtime());

    await service.get();
    await service.get();

    expect(chain.getNetworkStatus).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
