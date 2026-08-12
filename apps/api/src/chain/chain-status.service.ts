import {
  chainStatusSchema,
  type ChainBytecodeState,
  type ChainContractRef,
  type ChainStatusResponse,
} from '@app/contracts';
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
        // La verificación va dentro del mismo `probe`, y `probe` solo corre
        // cuando la caché expiró: seis lecturas por ventana de 5s, no seis por
        // request. Sin eso, cada pestaña abierta multiplicaría por seis la
        // presión sobre el RPC público.
        ...this.deploymentView(status.chainId, await this.verifyBytecode()),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown RPC failure.';
      this.logger.warn(`No se pudo leer el estado de la cadena: ${reason}`);
      // Si la red no responde no se intenta leer bytecode: no habría nada que
      // aprender y sí seis llamadas más contra un RPC que ya está fallando.
      return chainStatusSchema.parse({
        status: 'unreachable',
        network: 'arbitrum',
        reason,
        ...this.deploymentView(this.runtime.deployment?.chainId ?? 0),
      });
    }
  }

  /**
   * Confirma que en cada dirección configurada hay código desplegado.
   *
   * Nunca lanza: un fallo de lectura degrada ese contrato a `unconfirmed` y
   * deja el resto del estado intacto. Propagarlo convertiría todo el status en
   * `unreachable` aunque la cadena sí esté respondiendo, que es una afirmación
   * más falsa que la duda que reemplaza.
   */
  private async verifyBytecode(): Promise<ReadonlyMap<string, ChainBytecodeState>> {
    const addresses = this.runtime.deployment?.addresses;
    if (!addresses) return new Map();

    const results = await Promise.allSettled(
      CONTRACT_NAMES.map((name) => this.chain.getCode(addresses[name])),
    );
    return new Map(
      CONTRACT_NAMES.map((name, index): [string, ChainBytecodeState] => {
        const result = results[index];
        if (result.status === 'rejected') {
          const reason =
            result.reason instanceof Error ? result.reason.message : 'Unknown RPC failure.';
          this.logger.warn(`No se pudo confirmar el bytecode de ${name}: ${reason}`);
          return [name, 'unconfirmed'];
        }
        // `0x` es lo que responde un nodo para una cuenta sin código. Eso sí es
        // un hecho: la dirección está configurada y ahí no hay nada.
        const code = result.value;
        return [name, code && code !== '0x' ? 'present' : 'absent'];
      }),
    );
  }

  /** Direcciones y enlaces del despliegue: se conocen sin tocar el RPC. */
  private deploymentView(
    chainId: number,
    bytecode: ReadonlyMap<string, ChainBytecodeState> = new Map(),
  ) {
    const baseUrl = this.runtime.explorerUrl?.replace(/\/$/, '') ?? null;
    const addresses = this.runtime.deployment?.addresses;
    const contracts: ChainContractRef[] = addresses
      ? CONTRACT_NAMES.map((name) => ({
          name,
          address: addresses[name],
          explorerUrl: baseUrl ? `${baseUrl}/address/${addresses[name]}` : null,
          bytecode: bytecode.get(name) ?? 'unconfirmed',
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
