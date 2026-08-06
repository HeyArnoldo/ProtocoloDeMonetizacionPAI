import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation';
import { CHAIN_PORT, type ChainPort } from './chain.port';
import { ArbitrumChainAdapter } from './adapters/arbitrum.adapter';
import { InMemoryChainAdapter } from './adapters/in-memory.adapter';

/**
 * Elige el adapter de cadena según `CHAIN_ADAPTER`.
 *
 * Es `@Global` porque varios módulos de dominio (assets, certifications) van a
 * inyectar `CHAIN_PORT` y no tiene sentido reimportarlo en cada uno.
 */
@Global()
@Module({
  providers: [
    {
      provide: CHAIN_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): ChainPort => {
        const adapter = config.get('CHAIN_ADAPTER', { infer: true });

        if (adapter === 'arbitrum') {
          Logger.log('Adapter de cadena: arbitrum', 'ChainModule');
          return new ArbitrumChainAdapter();
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
  ],
  exports: [CHAIN_PORT],
})
export class ChainModule {}
