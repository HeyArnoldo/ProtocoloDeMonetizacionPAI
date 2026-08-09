import {
  DEFAULT_PARAMS,
  SECONDS_PER_DAY,
  computeBorrowingBase,
  type BorrowingBaseParams,
  type BorrowingBaseResult,
  type BreakdownConcept,
} from '@app/borrowing-base';
import type { ReceivableLeaf } from '@app/merkle';
import { formatBps } from './money';

/**
 * Adaptación del motor de borrowing base a lo que la pantalla enseña.
 *
 * Las cifras las produce `@app/borrowing-base` —la especificación normativa
 * que el `BorrowingBaseEngine` de Stylus debe reproducir— y este archivo no
 * recalcula ninguna. Lo que aporta es el orden de las líneas, sus rótulos y
 * las guardas que la maqueta no tiene.
 */

/** Rótulo de cada descuento del motor, en el orden en que se aplican. */
export const BREAKDOWN_LABELS: Record<BreakdownConcept, string> = {
  timeDiscount: 'Valor presente por plazo',
  delinquency: 'Haircut de morosidad',
  concentration: 'Haircut de concentración',
  serviceContinuity: 'Ajuste de continuidad',
};

/** Papel de cada línea en el desglose. La UI decide el color a partir de esto. */
export type BreakdownRowKind = 'nominal' | 'discount' | 'subtotal' | 'total';

export interface BreakdownRow {
  /** Clave estable para React y para localizar la fila en un test. */
  key: string;
  label: string;
  /** Qué parámetro produjo la cifra. Vacío cuando la línea es un total. */
  hint: string;
  amountMinor: bigint;
  kind: BreakdownRowKind;
}

/**
 * Fecha de valorización de hoy, anclada a medianoche UTC.
 *
 * El motor rechaza cualquier fecha con hora, y con razón: si la valorización
 * llevara la hora del navegador, el mismo cálculo hecho a las 9 y a las 18
 * daría dos números distintos y el fondo no reproduciría ninguno.
 */
export function currentValuationDate(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / SECONDS_PER_DAY) * SECONDS_PER_DAY;
}

/**
 * Parámetros del cálculo.
 *
 * Salen tal cual de `DEFAULT_PARAMS`: son el caso Contafácil SAC, ilustrativos
 * y sin calibrar, y se leen del paquete en vez de reescribirse aquí para que
 * la pantalla y el motor no puedan divergir.
 */
export function buildBorrowingBaseParams(valuationDate: number): BorrowingBaseParams {
  return { ...DEFAULT_PARAMS, valuationDate };
}

/**
 * Ejecuta el motor sobre las hojas divulgadas.
 *
 * Devuelve `null` sin hojas: `computeBorrowingBase` lanza a propósito en ese
 * caso, y la pantalla necesita un estado vacío, no una excepción en el render.
 */
export function computeSelectionBorrowingBase(
  leaves: readonly ReceivableLeaf[],
  params: BorrowingBaseParams,
): BorrowingBaseResult | null {
  if (leaves.length === 0) return null;
  return computeBorrowingBase([...leaves], params);
}

/**
 * Peso del deudor más grande sobre el nominal divulgado, en porcentaje.
 *
 * Agrupa por `debtorHash` —no por cuota— porque es exactamente lo que hace el
 * motor: el fondo ve que dos cuotas comparten deudor sin saber quién es.
 * Devuelve `null` sin hojas, en vez de dividir por cero.
 */
export function topDebtorSharePercent(leaves: readonly ReceivableLeaf[]): number | null {
  if (leaves.length === 0) return null;

  const byDebtor = new Map<string, bigint>();
  let nominal = 0n;

  for (const leaf of leaves) {
    byDebtor.set(leaf.debtorHash, (byDebtor.get(leaf.debtorHash) ?? 0n) + leaf.amountMinor);
    nominal += leaf.amountMinor;
  }

  if (nominal <= 0n) return null;

  const top = [...byDebtor.values()].reduce((max, amount) => (amount > max ? amount : max), 0n);
  return (Number(top) / Number(nominal)) * 100;
}

/**
 * Las siete líneas del desglose: nominal, los cuatro descuentos, el valor
 * ajustado y la base prestable.
 *
 * Es el mismo orden del handoff y del caso de referencia, y no es cosmético:
 * cada descuento se aplica sobre el saldo que dejó el anterior, así que leer
 * las líneas de arriba abajo es leer el algoritmo.
 */
export function toBreakdownRows(
  leaves: readonly ReceivableLeaf[],
  params: BorrowingBaseParams,
): BreakdownRow[] {
  const result = computeSelectionBorrowingBase(leaves, params);
  if (!result) return [];

  const share = topDebtorSharePercent(leaves);
  const threshold = formatBps(params.concentrationThresholdBps);

  const hints: Record<BreakdownConcept, string> = {
    timeDiscount: `${formatBps(params.discountRateBps)} anual · descuento simple`,
    delinquency: `${params.delinquencyBps} bps atestados`,
    concentration:
      share === null ? `umbral ${threshold}` : `top ${Math.round(share)}% · umbral ${threshold}`,
    serviceContinuity: `score ${params.serviceContinuityScore}/100`,
  };

  return [
    {
      key: 'disclosedNominal',
      label: 'Nominal divulgado',
      hint: `${leaves.length} ${leaves.length === 1 ? 'cuota divulgada' : 'cuotas divulgadas'}`,
      amountMinor: result.disclosedNominalMinor,
      kind: 'nominal',
    },
    ...result.breakdown.map<BreakdownRow>((item) => ({
      key: item.concept,
      label: BREAKDOWN_LABELS[item.concept],
      hint: hints[item.concept],
      amountMinor: item.amountMinor,
      kind: 'discount',
    })),
    {
      key: 'riskAdjusted',
      label: 'Valor ajustado por riesgo',
      hint: 'nominal menos los cuatro descuentos',
      amountMinor: result.riskAdjustedMinor,
      kind: 'subtotal',
    },
    {
      key: 'borrowingBase',
      label: 'Base prestable',
      hint: `advance rate ${formatBps(params.advanceRateBps)}`,
      amountMinor: result.borrowingBaseMinor,
      kind: 'total',
    },
  ];
}
