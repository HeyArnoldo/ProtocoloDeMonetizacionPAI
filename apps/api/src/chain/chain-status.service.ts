import { Inject, Injectable } from '@nestjs/common';
import { CHAIN_PORT, type ChainPort, type ChainStatus } from './chain.port';

const SUCCESS_TTL_MS = 60_000;
const FAILURE_TTL_MS = 15_000;

@Injectable()
export class ChainStatusService {
  private cached: { value: ChainStatus; expiresAt: number } | null = null;
  private pending: Promise<ChainStatus> | null = null;

  constructor(@Inject(CHAIN_PORT) private readonly chain: ChainPort) {}

  get(): Promise<ChainStatus> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) return Promise.resolve(this.cached.value);
    if (this.pending) return this.pending;

    this.pending = this.chain
      .getStatus()
      .catch(() => this.unavailableStatus())
      .then((value) => {
        const ttl = value.reachable ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
        this.cached = { value, expiresAt: Date.now() + ttl };
        return value;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  private unavailableStatus(): ChainStatus {
    return {
      network: 'arbitrum-sepolia',
      reachable: false,
      configured: false,
      deployed: false,
      expectedChainId: null,
      observedChainId: null,
      blockNumber: null,
      contractCount: 0,
      expectedContractCount: 6,
      contracts: [
        'assetRegistry',
        'certificationAttestor',
        'paiCertificate',
        'borrowingBaseEngine',
        'collateralVault',
        'mockUsdc',
      ].map((name) => ({ name, configured: false, deployed: false })) as ChainStatus['contracts'],
      reason: 'RPC_UNAVAILABLE',
    };
  }
}
