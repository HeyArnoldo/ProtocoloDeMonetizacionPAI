import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ArbitrumChainAdapter } from './adapters/arbitrum.adapter';
import { InMemoryChainAdapter } from './adapters/in-memory.adapter';
import { ChainModule } from './chain.module';
import { CHAIN_PORT, type ChainPort } from './chain.port';
import { VerificationModule } from '../verification/verification.module';
import { VerificationService } from '../verification/verification.service';

/**
 * `ChainModule` cuenta con que `ConfigService` sea global — en la app lo es,
 * porque `ConfigModule.forRoot({ isGlobal: true })`. El test reproduce esa
 * condición en vez de esquivarla: si alguien quita `isGlobal`, esto se rompe
 * acá y no en el arranque de producción.
 */
function fakeConfigModule(chainAdapter: string | undefined) {
  const address = `0x${'11'.repeat(20)}`;
  @Global()
  @Module({
    providers: [
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) =>
            ({
              CHAIN_ADAPTER: chainAdapter,
              CHAIN_ID: 421614,
              CHAIN_RPC_URL: 'https://rpc.example',
              CHAIN_DEPLOYMENT_BLOCK: 100,
              ASSET_REGISTRY_ADDRESS: address,
              CERTIFICATION_ATTESTOR_ADDRESS: address,
              PAI_CERTIFICATE_ADDRESS: address,
              BORROWING_BASE_ENGINE_ADDRESS: address,
              COLLATERAL_VAULT_ADDRESS: address,
              MOCK_USDC_ADDRESS: address,
            })[key],
        },
      },
    ],
    exports: [ConfigService],
  })
  class FakeConfigModule {}

  return FakeConfigModule;
}

async function resolvePort(chainAdapter: string | undefined): Promise<ChainPort> {
  const moduleRef = await Test.createTestingModule({
    imports: [fakeConfigModule(chainAdapter), ChainModule],
  }).compile();

  return moduleRef.get<ChainPort>(CHAIN_PORT);
}

describe('ChainModule', () => {
  it('resuelve VerificationService al iniciar la composición real de módulos', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [fakeConfigModule('in-memory'), ChainModule, VerificationModule],
    }).compile();
    const app = moduleRef.createNestApplication();

    await app.init();

    expect(moduleRef.get(VerificationService)).toBeInstanceOf(VerificationService);
    await app.close();
  });

  it('inyecta el adapter en memoria por defecto', async () => {
    expect(await resolvePort('in-memory')).toBeInstanceOf(InMemoryChainAdapter);
  });

  it('inyecta el adapter de Arbitrum cuando se pide', async () => {
    expect(await resolvePort('arbitrum')).toBeInstanceOf(ArbitrumChainAdapter);
  });

  it('cae al adapter en memoria ante un valor desconocido', async () => {
    // Fallar hacia el fake es lo seguro: nunca hacia el adapter que manda
    // transacciones reales por una variable de entorno mal escrita.
    expect(await resolvePort('arbitrium')).toBeInstanceOf(InMemoryChainAdapter);
    expect(await resolvePort(undefined)).toBeInstanceOf(InMemoryChainAdapter);
  });

  it('expone el puerto bajo el token CHAIN_PORT', async () => {
    const port = await resolvePort('in-memory');
    expect(typeof port.registerAsset).toBe('function');
    expect(typeof port.computeBorrowingBase).toBe('function');
  });
});
