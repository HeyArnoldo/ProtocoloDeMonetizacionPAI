import { describe, expect, it } from 'vitest';
import type { ChainContractRef } from '@app/contracts';
import { EXPECTED_CONTRACT_COUNT, summarizeDeployment } from './chain-deployment';

const contract = (
  name: ChainContractRef['name'],
  bytecode: ChainContractRef['bytecode'],
): ChainContractRef => ({
  name,
  address: `0x${'11'.repeat(20)}`,
  explorerUrl: null,
  bytecode,
});

const NAMES = [
  'assetRegistry',
  'certificationAttestor',
  'paiCertificate',
  'borrowingBaseEngine',
  'collateralVault',
  'mockUsdc',
] as const;

const all = (bytecode: ChainContractRef['bytecode']) =>
  NAMES.map((name) => contract(name, bytecode));

describe('summarizeDeployment', () => {
  it('espera seis contratos: es el tamaño del despliegue canónico', () => {
    expect(EXPECTED_CONTRACT_COUNT).toBe(6);
  });

  it('solo declara el despliegue verificado cuando los seis tienen bytecode', () => {
    expect(summarizeDeployment(all('present'))).toEqual({
      verdict: 'verified',
      verified: 6,
      expected: 6,
      missing: [],
      unconfirmed: [],
    });
  });

  it('nombra los contratos sin bytecode en vez de contar solo los buenos', () => {
    const contracts = all('present');
    contracts[4] = contract('collateralVault', 'absent');

    expect(summarizeDeployment(contracts)).toEqual({
      verdict: 'missing',
      verified: 5,
      expected: 6,
      missing: ['collateralVault'],
      unconfirmed: [],
    });
  });

  it('distingue "no se pudo confirmar" de "no está desplegado"', () => {
    const contracts = all('present');
    contracts[5] = contract('mockUsdc', 'unconfirmed');

    expect(summarizeDeployment(contracts)).toEqual({
      verdict: 'unconfirmed',
      verified: 5,
      expected: 6,
      missing: [],
      unconfirmed: ['mockUsdc'],
    });
  });

  it('un contrato confirmado ausente manda sobre uno sin confirmar', () => {
    // Un hecho comprobado pesa más que una duda: si el despliegue está roto,
    // el panel lo dice, no lo suaviza a "no se pudo confirmar".
    const contracts = all('present');
    contracts[0] = contract('assetRegistry', 'unconfirmed');
    contracts[1] = contract('certificationAttestor', 'absent');

    expect(summarizeDeployment(contracts)).toMatchObject({
      verdict: 'missing',
      verified: 4,
      missing: ['certificationAttestor'],
      unconfirmed: ['assetRegistry'],
    });
  });

  it('nunca declara verificado un despliegue incompleto, aunque todo lo listado tenga código', () => {
    // Cinco contratos con bytecode no son un despliegue de seis. Contar solo
    // los presentes dejaría pasar un despliegue truncado como sano.
    const contracts = all('present').slice(0, 5);

    expect(summarizeDeployment(contracts)).toMatchObject({ verdict: 'missing', verified: 5 });
  });

  it('sin contratos no afirma nada: cero verificados y verdict sin confirmar', () => {
    expect(summarizeDeployment([])).toEqual({
      verdict: 'unconfirmed',
      verified: 0,
      expected: 6,
      missing: [],
      unconfirmed: [],
    });
  });
});
