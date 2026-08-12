import { chainStatusSchema } from '@app/contracts';
import { Test } from '@nestjs/testing';
import { ChainStatusController } from './chain-status.controller';
import { ChainStatusService } from './chain-status.service';
import { CHAIN_PORT, type ChainPort } from './chain.port';

describe('chain status endpoint', () => {
  const liveStatus = () => ({
    network: 'arbitrum-sepolia' as const,
    reachable: true,
    configured: true,
    deployed: true,
    expectedChainId: 421614,
    observedChainId: 421614,
    blockNumber: 296_600_000n,
    contractCount: 6,
    expectedContractCount: 6 as const,
    contracts: [
      'assetRegistry',
      'certificationAttestor',
      'paiCertificate',
      'borrowingBaseEngine',
      'collateralVault',
      'mockUsdc',
    ].map((name) => ({ name, configured: true, deployed: true })),
  });

  it('single-flights concurrent reads and caches success until TTL', async () => {
    jest.useFakeTimers().setSystemTime(1_000);
    let resolve!: (value: ReturnType<typeof liveStatus>) => void;
    const getStatus = jest.fn(
      () => new Promise<ReturnType<typeof liveStatus>>((done) => (resolve = done)),
    );
    const service = new ChainStatusService({ getStatus } as unknown as ChainPort);

    const first = service.get();
    const second = service.get();
    expect(getStatus).toHaveBeenCalledTimes(1);
    resolve(liveStatus());
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    await service.get();
    expect(getStatus).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60_001);
    getStatus.mockResolvedValueOnce(liveStatus());
    await service.get();
    expect(getStatus).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('caches a sanitized failure for a bounded interval', async () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const getStatus = jest.fn().mockRejectedValue(new Error('private RPC token'));
    const service = new ChainStatusService({ getStatus } as unknown as ChainPort);

    const first = await service.get();
    const second = await service.get();
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ reachable: false, reason: 'RPC_UNAVAILABLE' });
    expect(JSON.stringify([first, second])).not.toContain('private');

    jest.advanceTimersByTime(15_001);
    await service.get();
    expect(getStatus).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('returns a JSON-safe response that satisfies the public contract', async () => {
    const chain = {
      getStatus: jest.fn().mockResolvedValue(liveStatus()),
    } as unknown as ChainPort;

    const moduleRef = await Test.createTestingModule({
      controllers: [ChainStatusController],
      providers: [ChainStatusService, { provide: CHAIN_PORT, useValue: chain }],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    const body = await fetch(`${await app.getUrl()}/api/chain/status`).then((result) => {
      expect(result.status).toBe(200);
      return result.json();
    });
    const response = chainStatusSchema.parse(body);

    expect(response.blockNumber).toBe('296600000');
    await app.close();
  });

  it.each([
    { reason: 'RPC_UNAVAILABLE' as const, expectedChainId: 421614, observedChainId: null },
    { reason: 'WRONG_CHAIN' as const, expectedChainId: 421614, observedChainId: 1 },
  ])('returns typed $reason degradation over HTTP 200', async (degradation) => {
    const chain = {
      getStatus: jest.fn().mockResolvedValue({
        ...liveStatus(),
        ...degradation,
        reachable: false,
        deployed: false,
        blockNumber: null,
        contractCount: 0,
        contracts: liveStatus().contracts.map((contract) => ({ ...contract, deployed: false })),
      }),
    } as unknown as ChainPort;
    const moduleRef = await Test.createTestingModule({
      controllers: [ChainStatusController],
      providers: [ChainStatusService, { provide: CHAIN_PORT, useValue: chain }],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');

    const result = await fetch(`${await app.getUrl()}/api/chain/status`);
    expect(result.status).toBe(200);
    expect(chainStatusSchema.parse(await result.json())).toMatchObject(degradation);
    await app.close();
  });
});
