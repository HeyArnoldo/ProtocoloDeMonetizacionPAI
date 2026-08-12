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

const CODE = '0x60806040' as const;

/** Por defecto toda dirección responde con bytecode: el caso feliz. */
const port = (status: unknown, fail?: Error, code?: ChainPort['getCode']) =>
  ({
    getNetworkStatus: jest.fn(() => (fail ? Promise.reject(fail) : Promise.resolve(status))),
    getCode: jest.fn(code ?? (() => Promise.resolve(CODE))),
  }) as unknown as jest.Mocked<ChainPort>;

const live = { network: 'arbitrum', chainId: 421614, safeBlock: 297262745n, headBlock: 297265110n };

const bytecodeOf = (status: unknown) =>
  (status as { contracts: Array<{ name: string; bytecode: string }> }).contracts.map((contract) => [
    contract.name,
    contract.bytecode,
  ]);

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
      contracts: (Object.keys(addresses) as Array<keyof typeof addresses>).map((name) => ({
        name,
        address: addresses[name],
        explorerUrl: `https://sepolia.arbiscan.io/address/${addresses[name]}`,
        bytecode: 'present',
      })),
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

  it('marks a contract as absent when its address holds no bytecode', async () => {
    // `0x` es la respuesta literal de un nodo para una cuenta sin código: la
    // dirección está configurada pero ahí no hay nada desplegado.
    const chain = port(live, undefined, (address) =>
      Promise.resolve(address === addresses.collateralVault ? '0x' : CODE),
    );
    const service = new ChainStatusService(chain, runtime());

    const status = await service.get();

    expect(bytecodeOf(status)).toEqual([
      ['assetRegistry', 'present'],
      ['certificationAttestor', 'present'],
      ['paiCertificate', 'present'],
      ['borrowingBaseEngine', 'present'],
      ['collateralVault', 'absent'],
      ['mockUsdc', 'present'],
    ]);
    expect(chainStatusSchema.parse(status)).toEqual(status);
  });

  it('treats a null bytecode as absent: an account with no code is not a deployment', async () => {
    const service = new ChainStatusService(
      port(live, undefined, () => Promise.resolve(null)),
      runtime(),
    );

    const status = await service.get();

    expect(bytecodeOf(status).every(([, bytecode]) => bytecode === 'absent')).toBe(true);
  });

  it('reports unconfirmed — not absent — when the bytecode read fails, and stays live', async () => {
    // "No se pudo confirmar" y "confirmado que no está" son cosas distintas.
    // Colapsarlas en un booleano haría que un RPC con hipo pinte el despliegue
    // como inexistente, que es justo la afirmación falsa que este panel evita.
    const chain = port(live, undefined, (address) =>
      address === addresses.mockUsdc
        ? Promise.reject(new Error('rate limited'))
        : Promise.resolve(CODE),
    );
    const service = new ChainStatusService(chain, runtime());

    const status = await service.get();

    expect(status).toMatchObject({ status: 'live' });
    expect(bytecodeOf(status)).toEqual([
      ['assetRegistry', 'present'],
      ['certificationAttestor', 'present'],
      ['paiCertificate', 'present'],
      ['borrowingBaseEngine', 'present'],
      ['collateralVault', 'present'],
      ['mockUsdc', 'unconfirmed'],
    ]);
    expect(chainStatusSchema.parse(status)).toEqual(status);
  });

  it('leaves every contract unconfirmed when the chain itself is unreachable', async () => {
    const chain = port(null, new Error('fetch failed'));
    const service = new ChainStatusService(chain, runtime());

    const status = await service.get();

    expect(status).toMatchObject({ status: 'unreachable' });
    expect(bytecodeOf(status).every(([, bytecode]) => bytecode === 'unconfirmed')).toBe(true);
    // Si la red no responde, no se gasta una llamada por contrato para nada.
    expect(chain.getCode).not.toHaveBeenCalled();
  });

  it('reads the six bytecodes once per cache window, not once per request', async () => {
    jest.useFakeTimers().setSystemTime(0);
    const chain = port(live);
    const service = new ChainStatusService(chain, runtime());

    await service.get();
    await service.get();
    await service.get();

    expect(chain.getCode).toHaveBeenCalledTimes(6);

    jest.setSystemTime(CHAIN_STATUS_TTL_MS + 1);
    await service.get();
    expect(chain.getCode).toHaveBeenCalledTimes(12);
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
