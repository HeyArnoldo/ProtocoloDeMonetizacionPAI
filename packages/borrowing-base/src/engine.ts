import type { Hex, ReceivableLeaf } from '@app/merkle';

import {
  BPS_DENOMINATOR,
  DAYS_PER_YEAR,
  SECONDS_PER_DAY,
  assertValidParams,
  type BorrowingBaseParams,
} from './params';

/**
 * Motor de borrowing base — **especificación normativa**.
 *
 * Esto es lo que el `BorrowingBaseEngine` de Stylus debe reproducir byte a
 * byte. Los vectores dorados de `fixtures/golden-vectors.json` son el candado,
 * igual que con la hoja del árbol.
 *
 * Por qué importa que el motor viva on-chain: este número **no lo afirma el
 * backend**. El fondo toma el root certificado, las hojas divulgadas y el
 * proof, llama a la misma función `view` y obtiene lo mismo. Si el servidor
 * mintiera, el contrato lo contradiría.
 */

export type BreakdownConcept =
  | 'timeDiscount'
  | 'delinquency'
  | 'concentration'
  | 'serviceContinuity';

export interface BreakdownItem {
  concept: BreakdownConcept;
  amountMinor: bigint;
}

export interface BorrowingBaseResult {
  /** Suma de las cuotas divulgadas. */
  disclosedNominalMinor: bigint;
  /** Nominal menos todos los descuentos. */
  riskAdjustedMinor: bigint;
  /** Valor ajustado por el advance rate. Es el monto prestable. */
  borrowingBaseMinor: bigint;
  breakdown: BreakdownItem[];
}

/**
 * División entera hacia arriba.
 *
 * Se usa en los **descuentos**: redondear un descuento hacia abajo lo achica y
 * agranda la base prestable. El redondeo nunca puede favorecer al prestatario.
 */
function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator <= 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

/** División entera hacia abajo. Se usa en el advance rate, por lo mismo. */
function floorDiv(numerator: bigint, denominator: bigint): bigint {
  return numerator / denominator;
}

export function computeBorrowingBase(
  leaves: ReceivableLeaf[],
  params: BorrowingBaseParams,
): BorrowingBaseResult {
  if (leaves.length === 0) {
    throw new Error('Hay que divulgar al menos una cuota para calcular la base prestable.');
  }
  assertValidParams(params);

  const currency = leaves[0]!.currency;
  for (const leaf of leaves) {
    // Sumar USD con PEN daría un número sin significado. Mejor fallar que
    // devolver algo que parece un monto.
    if (leaf.currency !== currency) {
      throw new Error(
        `Todas las cuotas deben compartir moneda: llegaron ${currency} y ${leaf.currency}.`,
      );
    }
  }

  const disclosedNominalMinor = leaves.reduce((total, leaf) => total + leaf.amountMinor, 0n);

  // ─── 1. Descuento por plazo ─────────────────────────────────────────
  // Descuento simple (lineal), no compuesto: es como se descuenta en factoring
  // y además es exacto en aritmética entera. Se calcula **por cuota**, no
  // sobre una duración promedio de la cartera — que es justamente lo que el
  // árbol permite y un agregado no.
  const timeDiscount = leaves.reduce((total, leaf) => {
    const days = daysToMaturity(leaf, params.valuationDate);
    return (
      total +
      ceilDiv(
        leaf.amountMinor * BigInt(params.discountRateBps) * days,
        BPS_DENOMINATOR * DAYS_PER_YEAR,
      )
    );
  }, 0n);

  let running = disclosedNominalMinor - timeDiscount;

  // ─── 2. Mora histórica atestada ─────────────────────────────────────
  const delinquency = clampTo(
    ceilDiv(running * BigInt(params.delinquencyBps), BPS_DENOMINATOR),
    running,
  );
  running -= delinquency;

  // ─── 3. Concentración por deudor ────────────────────────────────────
  // El exceso se mide sobre la composición de la cartera (el nominal) y se
  // cobra sobre el saldo. El motor no necesita saber quién es el deudor: solo
  // qué cuotas comparten `debtorHash`. Por eso la privacidad no cuesta
  // funcionalidad.
  const concentration = clampTo(
    ceilDiv(
      concentrationExcess(leaves, disclosedNominalMinor, params.concentrationThresholdBps) *
        BigInt(params.concentrationPenaltyBps),
      BPS_DENOMINATOR,
    ),
    running,
  );
  running -= concentration;

  // ─── 4. Continuidad del servicio ────────────────────────────────────
  // Si el SaaS muere, los contratos no se cobran. El score lo atesta el
  // auditor técnico.
  const serviceContinuity = clampTo(
    ceilDiv(
      running *
        BigInt(100 - params.serviceContinuityScore) *
        BigInt(params.serviceContinuityWeightBps),
      100n * BPS_DENOMINATOR,
    ),
    running,
  );
  running -= serviceContinuity;

  const riskAdjustedMinor = running;

  return {
    disclosedNominalMinor,
    riskAdjustedMinor,
    borrowingBaseMinor: floorDiv(
      riskAdjustedMinor * BigInt(params.advanceRateBps),
      BPS_DENOMINATOR,
    ),
    breakdown: [
      { concept: 'timeDiscount', amountMinor: timeDiscount },
      { concept: 'delinquency', amountMinor: delinquency },
      { concept: 'concentration', amountMinor: concentration },
      { concept: 'serviceContinuity', amountMinor: serviceContinuity },
    ],
  };
}

/**
 * Días hasta el vencimiento, nunca negativos.
 *
 * Sin el clamp, una cuota ya vencida generaría un descuento negativo y la
 * cartera valdría **más** cuanto más atrasada estuviera. El tratamiento de la
 * mora efectiva (penalizar lo vencido) es una decisión de riesgo aparte y
 * todavía no está en el modelo.
 */
function daysToMaturity(leaf: ReceivableLeaf, valuationDate: number): bigint {
  const seconds = leaf.dueDate - valuationDate;
  if (seconds <= 0) return 0n;
  return BigInt(Math.floor(seconds / SECONDS_PER_DAY));
}

/** Suma, por deudor, lo que excede el umbral de concentración. */
function concentrationExcess(
  leaves: ReceivableLeaf[],
  nominal: bigint,
  thresholdBps: number,
): bigint {
  const byDebtor = new Map<Hex, bigint>();
  for (const leaf of leaves) {
    byDebtor.set(leaf.debtorHash, (byDebtor.get(leaf.debtorHash) ?? 0n) + leaf.amountMinor);
  }

  const allowance = floorDiv(nominal * BigInt(thresholdBps), BPS_DENOMINATOR);

  let excess = 0n;
  for (const amount of byDebtor.values()) {
    if (amount > allowance) excess += amount - allowance;
  }
  return excess;
}

/** Ningún descuento puede dejar el saldo en negativo. */
function clampTo(value: bigint, maximum: bigint): bigint {
  if (value < 0n) return 0n;
  return value > maximum ? maximum : value;
}
