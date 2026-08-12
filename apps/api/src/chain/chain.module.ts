import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation';
import { CHAIN_PORT, type ChainPort } from './chain.port';
import { ArbitrumChainAdapter } from './adapters/arbitrum.adapter';
import { InMemoryChainAdapter } from './adapters/in-memory.adapter';
import { ChainIntentController } from './chain-intent.controller';
import { ChainIntentService } from './chain-intent.service';
import { ChainStatusController } from './chain-status.controller';
import { ChainStatusService } from './chain-status.service';
import { CHAIN_RUNTIME_CONFIG, chainRuntimeConfig, type ChainRuntimeConfig } from './chain.config';

/**
 * Elige el adapter de cadena según `CHAIN_ADAPTER`.
 *
 * Es `@Global` porque varios módulos de dominio (assets, certifications) van a
 * inyectar `CHAIN_PORT` y no tiene sentido reimportarlo en cada uno.
 */
@Global()
@Module({
  controllers: [ChainIntentController, ChainStatusController],
  providers: [
    {
      provide: CHAIN_RUNTIME_CONFIG,
      inject: [ConfigService],
      useFactory: chainRuntimeConfig,
    },
    {
      provide: CHAIN_PORT,
      inject: [ConfigService, CHAIN_RUNTIME_CONFIG],
      useFactory: (config: ConfigService<Env, true>, runtime: ChainRuntimeConfig): ChainPort => {
        const adapter = config.get('CHAIN_ADAPTER', { infer: true });

        if (adapter === 'arbitrum') {
          Logger.log('Adapter de cadena: arbitrum', 'ChainModule');
          if (!runtime.rpcUrl || !runtime.deployment || runtime.deploymentBlock === undefined)
            throw new Error('Arbitrum is not configured.');
          return new ArbitrumChainAdapter(
            runtime.rpcUrl,
            runtime.deployment,
            runtime.deploymentBlock,
          );
        }

        // Se avisa fuerte a propósito: es fácil desplegar a producción con el
        // fake puesto y no notarlo hasta que un jurado pida ver la tx.
        Logger.warn(
          'Adapter de cadena: in-memory. No hay nada on-chain: los hashes son sintéticos.',
          'ChainModule',
        );
        return new InMemoryChainAdapter();
      },
    },
    ChainIntentService,
    ChainStatusService,
  ],
  exports: [CHAIN_PORT, CHAIN_RUNTIME_CONFIG, ChainIntentService],
})
export class ChainModule {}
