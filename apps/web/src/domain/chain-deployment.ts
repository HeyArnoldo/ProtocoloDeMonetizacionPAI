import type { ChainContractRef } from '@app/contracts';

/**
 * Tamaño del despliegue canónico. El panel no cuenta "los que haya": cuenta
 * contra este número. Cinco contratos con bytecode no son un despliegue sano,
 * son un despliegue incompleto — y sin un esperado fijo esa diferencia se
 * pierde en el conteo.
 */
export const EXPECTED_CONTRACT_COUNT = 6;

export type DeploymentVerdict = 'verified' | 'missing' | 'unconfirmed';

export interface DeploymentSummary {
  verdict: DeploymentVerdict;
  /** Contratos con bytecode leído en su dirección configurada. */
  verified: number;
  expected: number;
  /** Confirmados sin código: la dirección apunta a una cuenta vacía. */
  missing: ChainContractRef['name'][];
  /** No se pudo leer su bytecode. Es una duda, no una ausencia. */
  unconfirmed: ChainContractRef['name'][];
}

/**
 * Reduce el estado por contrato a un veredicto para el panel.
 *
 * Dos reglas que no son obvias:
 *
 * 1. **Un ausente confirmado manda sobre una duda.** Si un contrato está
 *    comprobadamente vacío, el panel lo dice aunque otro no se haya podido
 *    leer: un hecho pesa más que una incógnita.
 * 2. **`verified` exige los seis.** Es lo único que autoriza pintar verde.
 *    Cualquier otra cosa —falta uno, no se pudo confirmar uno, la lista llega
 *    corta— deja de ser una afirmación y pasa a ser una advertencia.
 */
export function summarizeDeployment(contracts: ChainContractRef[]): DeploymentSummary {
  const expected = EXPECTED_CONTRACT_COUNT;
  const verified = contracts.filter((contract) => contract.bytecode === 'present').length;
  const missing = contracts
    .filter((contract) => contract.bytecode === 'absent')
    .map((contract) => contract.name);
  const unconfirmed = contracts
    .filter((contract) => contract.bytecode === 'unconfirmed')
    .map((contract) => contract.name);

  return { verdict: verdictOf(), verified, expected, missing, unconfirmed };

  function verdictOf(): DeploymentVerdict {
    // Lista vacía: no hay despliegue configurado que juzgar. Decir "falta todo"
    // sería inventar un diagnóstico sobre algo que nadie declaró.
    if (contracts.length === 0) return 'unconfirmed';
    if (verified === expected) return 'verified';
    // Los que ni siquiera aparecen en la lista cuentan como faltantes: un
    // despliegue truncado no puede leerse como "solo faltó confirmar".
    if (missing.length > 0 || verified + unconfirmed.length < expected) return 'missing';
    return 'unconfirmed';
  }
}
