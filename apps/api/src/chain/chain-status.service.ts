import { chainStatusSchema, type ChainContractRef, type ChainStatusResponse } from '@app/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CHAIN_PORT, type ChainPort } from './chain.port';
import { CHAIN_RUNTIME_CONFIG, type ChainRuntimeConfig } from './chain.config';

/**
 * Ventana de caché. El panel consulta este endpoint en bucle y la ruta es
 * pública: sin caché, cada pestaña abierta multiplica las llamadas al RPC
 * público de Arbitrum, que sí limita por tasa. Cinco segundos son más cortos
 * que el intervalo de bloque percibido y bastan para colapsar la ráfaga.
 */
export const CHAIN_STATUS_TTL_MS = 5_000;

const CONTRACT_NAMES = [
  'assetRegistry',
  'certificationAttestor',
  'paiCertificate',
  'borrowingBaseEngine',
  'collateralVault',
  'mockUsdc',
] as const;

@Injectable()
export class ChainStatusService {
  private readonly logger = new Logger(ChainStatusService.name);
  private cached: { at: number; value: ChainStatusResponse } | null = null;

  constructor(
    @Inject(CHAIN_PORT) private readonly chain: ChainPort,
    @Inject(CHAIN_RUNTIME_CONFIG) private readonly runtime: ChainRuntimeConfig,
  ) {}

  async get(): Promise<ChainStatusResponse> {
    const now = Date.now();
    if (this.cached && now - this.cached.at < CHAIN_STATUS_TTL_MS) return this.cached.value;

    const value = await this.probe();
    // Un fallo no se cachea: si el RPC vuelve, el siguiente poll debe verlo.
    if (value.status !== 'unreachable') this.cached = { at: now, value };
    return value;
  }

  private async probe(): Promise<ChainStatusResponse> {
    try {
      const status = await this.chain.getNetworkStatus();
      if (status.network === 'in-memory') {
        return chainStatusSchema.parse({ status: 'offline', network: 'in-memory', chainId: null });
      }
      return chainStatusSchema.parse({
        status: 'live',
        network: 'arbitrum',
        safeBlock: status.safeBlock.toString(),
        headBlock: status.headBlock.toString(),
        ...this.deploymentView(status.chainId),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown RPC failure.';
      this.logger.warn(`No se pudo leer el estado de la cadena: ${reason}`);
      return chainStatusSchema.parse({
        status: 'unreachable',
        network: 'arbitrum',
        reason,
        ...this.deploymentView(this.runtime.deployment?.chainId ?? 0),
      });
    }
  }

  /** Direcciones y enlaces del despliegue: se conocen sin tocar el RPC. */
  private deploymentView(chainId: number) {
    const baseUrl = this.runtime.explorerUrl?.replace(/\/$/, '') ?? null;
    const addresses = this.runtime.deployment?.addresses;
    const contracts: ChainContractRef[] = addresses
      ? CONTRACT_NAMES.map((name) => ({
          name,
          address: addresses[name],
          explorerUrl: baseUrl ? `${baseUrl}/address/${addresses[name]}` : null,
        }))
      : [];
    return {
      chainId: this.runtime.deployment?.chainId ?? chainId,
      deploymentBlock: this.runtime.deploymentBlock?.toString() ?? null,
      contracts,
      explorerBaseUrl: baseUrl,
    };
  }
}
