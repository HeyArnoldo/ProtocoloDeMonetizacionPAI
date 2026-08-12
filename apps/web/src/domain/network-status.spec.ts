import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ChainStatusResponse } from '@app/contracts';
import { networkStatusView } from './network-status';
import { NetworkStatusContent } from '@/components/panel/network-status';

const status = (overrides: Partial<ChainStatusResponse> = {}): ChainStatusResponse => ({
  network: 'arbitrum-sepolia',
  reachable: true,
  configured: true,
  deployed: true,
  expectedChainId: 421614,
  observedChainId: 421614,
  blockNumber: '296600000',
  contractCount: 6,
  expectedContractCount: 6,
  contracts: [
    'assetRegistry',
    'certificationAttestor',
    'paiCertificate',
    'borrowingBaseEngine',
    'collateralVault',
    'mockUsdc',
  ].map((name) => ({ name: name as never, configured: true, deployed: true })),
  ...overrides,
});

describe('network status view', () => {
  const rendered = (data: Parameters<typeof NetworkStatusContent>[0]['state']) =>
    renderToStaticMarkup(createElement(NetworkStatusContent, { state: data }));

  it('renders loading and query failure states', () => {
    expect(rendered({ state: 'loading' })).toContain('Verificando Arbitrum');
    expect(rendered({ state: 'error' })).toContain('Estado no disponible');
  });

  it('renders demo, wrong-chain, partial, and live states', () => {
    expect(
      rendered({
        state: 'ready',
        data: status({ network: 'in-memory', expectedChainId: null, observedChainId: null }),
      }),
    ).toContain('Modo demostración');
    expect(
      rendered({
        state: 'ready',
        data: status({
          reachable: false,
          deployed: false,
          contractCount: 0,
          expectedChainId: 421614,
          observedChainId: 1,
          reason: 'WRONG_CHAIN',
        }),
      }),
    ).toContain('Conectada a chain 1; se esperaba 421614.');
    expect(
      rendered({
        state: 'ready',
        data: status({ deployed: false, contractCount: 5, reason: 'CONTRACT_CODE_MISSING' }),
      }),
    ).toContain('5/6 contratos');
    expect(rendered({ state: 'ready', data: status() })).toContain('6/6 contratos');
  });

  it('covers loading and query failure', () => {
    expect(networkStatusView({ state: 'loading' })).toMatchObject({ tone: 'loading' });
    expect(networkStatusView({ state: 'error' })).toMatchObject({
      tone: 'unavailable',
      label: 'Estado no disponible',
    });
  });

  it('shows verified live values', () =>
    expect(networkStatusView({ state: 'ready', data: status() })).toMatchObject({
      tone: 'live',
      metric: '6/6 contratos',
    }));

  it('reports in-memory and wrong-chain states without mixing chain IDs', () => {
    expect(
      networkStatusView({
        state: 'ready',
        data: status({ network: 'in-memory', expectedChainId: null, observedChainId: null }),
      }),
    ).toMatchObject({ tone: 'demo' });
    expect(
      networkStatusView({
        state: 'ready',
        data: status({
          reachable: false,
          deployed: false,
          contractCount: 0,
          expectedChainId: 421614,
          observedChainId: 1,
          reason: 'WRONG_CHAIN',
        }),
      }),
    ).toMatchObject({
      tone: 'warning',
      label: 'RPC en la red incorrecta',
      detail: 'Conectada a chain 1; se esperaba 421614.',
    });
  });

  it('distinguishes incomplete deployment from unavailable RPC', () => {
    expect(
      networkStatusView({
        state: 'ready',
        data: status({ deployed: false, contractCount: 5, reason: 'CONTRACT_CODE_MISSING' }),
      }).tone,
    ).toBe('warning');
    expect(
      networkStatusView({
        state: 'ready',
        data: status({
          reachable: false,
          deployed: false,
          contractCount: 0,
          reason: 'RPC_UNAVAILABLE',
        }),
      }).tone,
    ).toBe('unavailable');
  });
});
