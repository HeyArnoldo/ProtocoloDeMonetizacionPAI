import { describe, expect, it } from 'vitest';
import { CURRENCY, hashDebtor, toDueDate, type ReceivableLeaf } from '@app/merkle';

import { computeBorrowingBase } from './engine';
import { type BorrowingBaseParams } from './params';

const SALT = `0x${'0f'.repeat(32)}` as const;
const VALUATION = toDueDate('2026-01-01');

const DEBTOR_A = hashDebtor('20512345678', SALT);
const DEBTOR_B = hashDebtor('20487654321', SALT);
const DEBTOR_C = hashDebtor('20100200300', SALT);

function params(overrides: Partial<BorrowingBaseParams> = {}): BorrowingBaseParams {
  return {
    valuationDate: VALUATION,
    discountRateBps: 1800, // 18% anual
    delinquencyBps: 420, // mora historica atestada por el contador
    concentrationThresholdBps: 2500, // 25% por deudor
    concentrationPenaltyBps: 4000, // 40% sobre el exceso
    serviceContinuityScore: 78,
    serviceContinuityWeightBps: 1000,
    advanceRateBps: 5280, // 52.8%
    ...overrides,
  };
}

function leaf(
  debtorHash: string,
  amountMinor: bigint,
  dueDate: string,
  docSeed: number,
): ReceivableLeaf {
  return {
    debtorHash: debtorHash as ReceivableLeaf['debtorHash'],
    amountMinor,
    dueDate: toDueDate(dueDate),
    currency: CURRENCY.USD,
    docHash: `0x${docSeed.toString(16).padStart(64, '0')}` as ReceivableLeaf['docHash'],
  };
}

/** Cartera equilibrada: tres deudores, ninguno sobre el umbral. */
function balanced(): ReceivableLeaf[] {
  return [
    leaf(DEBTOR_A, 1_000_000n, '2026-04-01', 1),
    leaf(DEBTOR_B, 1_000_000n, '2026-07-01', 2),
    leaf(DEBTOR_C, 1_000_000n, '2026-10-01', 3),
  ];
}

describe('computeBorrowingBase', () => {
  it('el nominal divulgado es la suma de las cuotas', () => {
    const result = computeBorrowingBase(balanced(), params());
    expect(result.disclosedNominalMinor).toBe(3_000_000n);
  });

  it('es determinista', () => {
    expect(computeBorrowingBase(balanced(), params())).toEqual(
      computeBorrowingBase(balanced(), params()),
    );
  });

  it('el desglose suma exactamente el valor ajustado por riesgo', () => {
    // Si el desglose no cuadra, la UI muestra un numero que no se puede
    // reconstruir sumando lo que ella misma lista. Un fondo lo nota.
    const result = computeBorrowingBase(balanced(), params());

    const deductions = result.breakdown.reduce((total, item) => total + item.amountMinor, 0n);
    expect(result.disclosedNominalMinor - deductions).toBe(result.riskAdjustedMinor);
  });

  it('el resultado final es el valor ajustado por el advance rate', () => {
    const result = computeBorrowingBase(balanced(), params({ advanceRateBps: 5000 }));
    expect(result.borrowingBaseMinor).toBe((result.riskAdjustedMinor * 5000n) / 10_000n);
  });

  // ─── Descuento por plazo ──────────────────────────────────────────────

  it('una cuota que vence mas tarde descuenta mas', () => {
    const near = [leaf(DEBTOR_A, 1_000_000n, '2026-02-01', 1)];
    const far = [leaf(DEBTOR_A, 1_000_000n, '2026-12-01', 1)];

    expect(computeBorrowingBase(far, params()).borrowingBaseMinor).toBeLessThan(
      computeBorrowingBase(near, params()).borrowingBaseMinor,
    );
  });

  it('una cuota que vence hoy no descuenta por plazo', () => {
    const today = [leaf(DEBTOR_A, 1_000_000n, '2026-01-01', 1)];
    const discount = computeBorrowingBase(today, params()).breakdown.find(
      (item) => item.concept === 'timeDiscount',
    );

    expect(discount?.amountMinor).toBe(0n);
  });

  it('una cuota ya vencida no genera descuento negativo', () => {
    // Sin el clamp, una cuota vencida sumaria valor en vez de restarlo: la
    // cartera valdria mas cuanto mas atrasada estuviera.
    const overdue = [leaf(DEBTOR_A, 1_000_000n, '2025-06-01', 1)];
    const discount = computeBorrowingBase(overdue, params()).breakdown.find(
      (item) => item.concept === 'timeDiscount',
    );

    expect(discount?.amountMinor).toBe(0n);
  });

  it('el descuento se calcula por cuota, no sobre una duracion promedio', () => {
    // Dos cuotas de 500k a plazos distintos no descuentan lo mismo que una de
    // 1M al plazo promedio, y la diferencia es el punto de tener el arbol.
    const split = [
      leaf(DEBTOR_A, 500_000n, '2026-02-01', 1),
      leaf(DEBTOR_A, 500_000n, '2026-12-01', 2),
    ];
    const lumped = [leaf(DEBTOR_A, 1_000_000n, '2026-07-01', 3)];

    const splitDiscount = computeBorrowingBase(split, params()).breakdown.find(
      (i) => i.concept === 'timeDiscount',
    )!.amountMinor;
    const lumpedDiscount = computeBorrowingBase(lumped, params()).breakdown.find(
      (i) => i.concept === 'timeDiscount',
    )!.amountMinor;

    expect(splitDiscount).not.toBe(lumpedDiscount);
  });

  // ─── Concentración ────────────────────────────────────────────────────

  it('no penaliza una cartera por debajo del umbral', () => {
    const concentration = computeBorrowingBase(balanced(), params()).breakdown.find(
      (item) => item.concept === 'concentration',
    );

    // Tres deudores al 33% cada uno... eso SI supera el umbral de 25%.
    expect(concentration!.amountMinor).toBeGreaterThan(0n);

    const spread = [
      leaf(DEBTOR_A, 1_000_000n, '2026-04-01', 1),
      leaf(DEBTOR_B, 1_000_000n, '2026-04-01', 2),
      leaf(DEBTOR_C, 1_000_000n, '2026-04-01', 3),
      leaf(DEBTOR_A, 1_000_000n, '2026-05-01', 4),
    ];
    const relaxed = computeBorrowingBase(spread, params({ concentrationThresholdBps: 5000 }));
    expect(relaxed.breakdown.find((i) => i.concept === 'concentration')!.amountMinor).toBe(0n);
  });

  it('penaliza al deudor que supera el umbral, no a toda la cartera', () => {
    const concentrated = [
      leaf(DEBTOR_A, 3_000_000n, '2026-04-01', 1),
      leaf(DEBTOR_B, 500_000n, '2026-04-01', 2),
      leaf(DEBTOR_C, 500_000n, '2026-04-01', 3),
    ];

    const penalty = computeBorrowingBase(concentrated, params()).breakdown.find(
      (item) => item.concept === 'concentration',
    )!.amountMinor;

    expect(penalty).toBeGreaterThan(0n);
  });

  it('un solo deudor concentra el 100% y penaliza mas que una cartera repartida', () => {
    const single = [
      leaf(DEBTOR_A, 2_000_000n, '2026-04-01', 1),
      leaf(DEBTOR_A, 1_000_000n, '2026-07-01', 2),
    ];

    const singlePenalty = computeBorrowingBase(single, params()).breakdown.find(
      (i) => i.concept === 'concentration',
    )!.amountMinor;
    const spreadPenalty = computeBorrowingBase(balanced(), params()).breakdown.find(
      (i) => i.concept === 'concentration',
    )!.amountMinor;

    expect(singlePenalty).toBeGreaterThan(spreadPenalty);
  });

  it('agrupa por deudor aunque las cuotas esten separadas', () => {
    // Es la razon de que debtorHash exista: el motor no necesita saber QUIEN
    // es el deudor, solo que cuotas comparten deudor.
    const grouped = [
      leaf(DEBTOR_A, 1_500_000n, '2026-04-01', 1),
      leaf(DEBTOR_A, 1_500_000n, '2026-04-01', 2),
      leaf(DEBTOR_B, 1_000_000n, '2026-04-01', 3),
    ];
    const lumped = [
      leaf(DEBTOR_A, 3_000_000n, '2026-04-01', 1),
      leaf(DEBTOR_B, 1_000_000n, '2026-04-01', 3),
    ];

    expect(
      computeBorrowingBase(grouped, params()).breakdown.find((i) => i.concept === 'concentration')!
        .amountMinor,
    ).toBe(
      computeBorrowingBase(lumped, params()).breakdown.find((i) => i.concept === 'concentration')!
        .amountMinor,
    );
  });

  // ─── Continuidad del servicio ─────────────────────────────────────────

  it('un score perfecto no genera ajuste', () => {
    const result = computeBorrowingBase(balanced(), params({ serviceContinuityScore: 100 }));
    expect(result.breakdown.find((i) => i.concept === 'serviceContinuity')!.amountMinor).toBe(0n);
  });

  it('peor score, mayor ajuste', () => {
    const good = computeBorrowingBase(balanced(), params({ serviceContinuityScore: 90 }));
    const bad = computeBorrowingBase(balanced(), params({ serviceContinuityScore: 40 }));

    expect(bad.borrowingBaseMinor).toBeLessThan(good.borrowingBaseMinor);
  });

  // ─── Redondeo ─────────────────────────────────────────────────────────

  it('el redondeo nunca favorece al prestatario', () => {
    // Los descuentos redondean hacia arriba y el advance hacia abajo. Un
    // centavo de mas en la base prestable es un centavo que el fondo presta
    // sin colateral.
    const odd = [leaf(DEBTOR_A, 1_000_001n, '2026-03-17', 1)];
    const result = computeBorrowingBase(odd, params());

    const deductions = result.breakdown.reduce((total, item) => total + item.amountMinor, 0n);
    expect(result.disclosedNominalMinor - deductions).toBe(result.riskAdjustedMinor);
    expect(result.borrowingBaseMinor).toBeLessThanOrEqual(
      (result.riskAdjustedMinor * BigInt(params().advanceRateBps)) / 10_000n,
    );
  });

  it('nunca devuelve un resultado negativo', () => {
    const brutal = params({
      delinquencyBps: 9_000,
      concentrationPenaltyBps: 10_000,
      serviceContinuityScore: 0,
      serviceContinuityWeightBps: 10_000,
    });

    const result = computeBorrowingBase(balanced(), brutal);
    expect(result.riskAdjustedMinor).toBeGreaterThanOrEqual(0n);
    expect(result.borrowingBaseMinor).toBeGreaterThanOrEqual(0n);
  });

  // ─── Validación ───────────────────────────────────────────────────────

  it('rechaza una divulgacion vacia', () => {
    expect(() => computeBorrowingBase([], params())).toThrow(/al menos una cuota/i);
  });

  it('rechaza mezclar monedas', () => {
    // Sumar USD con PEN daria un numero sin significado. Mejor fallar.
    const mixed = [
      leaf(DEBTOR_A, 1_000_000n, '2026-04-01', 1),
      { ...leaf(DEBTOR_B, 1_000_000n, '2026-04-01', 2), currency: CURRENCY.PEN },
    ];

    expect(() => computeBorrowingBase(mixed, params())).toThrow(/moneda/i);
  });

  it('rechaza parametros fuera de rango', () => {
    expect(() => computeBorrowingBase(balanced(), params({ advanceRateBps: 10_001 }))).toThrow(
      /advanceRateBps/,
    );
    expect(() => computeBorrowingBase(balanced(), params({ serviceContinuityScore: 101 }))).toThrow(
      /serviceContinuityScore/,
    );
    expect(() => computeBorrowingBase(balanced(), params({ delinquencyBps: -1 }))).toThrow(
      /delinquencyBps/,
    );
  });

  it('rechaza una fecha de valorizacion que no sea medianoche UTC', () => {
    expect(() =>
      computeBorrowingBase(balanced(), params({ valuationDate: VALUATION + 3600 })),
    ).toThrow(/medianoche UTC/i);
  });
});
