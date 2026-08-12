import type { ChainStatusResponse } from '@app/contracts';

export interface NetworkStatusView {
  tone: 'loading' | 'live' | 'warning' | 'demo' | 'unavailable';
  label: string;
  detail: string;
  metric: string;
}

export type NetworkStatusState =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; data: ChainStatusResponse };

export function networkStatusView(input: NetworkStatusState): NetworkStatusView {
  if (input.state === 'loading') {
    return {
      tone: 'loading',
      label: 'Verificando Arbitrum',
      detail: 'Consultando la API de red.',
      metric: 'Estado pendiente',
    };
  }
  if (input.state === 'error') {
    return {
      tone: 'unavailable',
      label: 'Estado no disponible',
      detail: 'No se pudo consultar la API. Intenta de nuevo.',
      metric: 'Estado no comprobado',
    };
  }
  const status = input.data;
  if (status.network === 'in-memory') {
    return {
      tone: 'demo',
      label: 'Modo demostración',
      detail: 'La API usa estado local, no la red.',
      metric: '0/6 contratos verificados',
    };
  }
  if (status.reason === 'WRONG_CHAIN') {
    return {
      tone: 'warning',
      label: 'RPC en la red incorrecta',
      detail: `Conectada a chain ${status.observedChainId}; se esperaba ${status.expectedChainId}.`,
      metric: 'Contratos no verificados',
    };
  }
  if (!status.reachable) {
    return {
      tone: 'unavailable',
      label: 'Arbitrum Sepolia no disponible',
      detail: 'La API no pudo verificar la red. Intenta de nuevo.',
      metric: 'Estado no comprobado',
    };
  }
  if (!status.deployed) {
    return {
      tone: 'warning',
      label: 'Despliegue incompleto',
      detail: `Bloque ${Number(status.blockNumber).toLocaleString('es-PE')}`,
      metric: `${status.contractCount}/${status.expectedContractCount} contratos`,
    };
  }
  return {
    tone: 'live',
    label: 'Arbitrum Sepolia',
    detail: `Bloque ${Number(status.blockNumber).toLocaleString('es-PE')}`,
    metric: `${status.contractCount}/${status.expectedContractCount} contratos`,
  };
}
