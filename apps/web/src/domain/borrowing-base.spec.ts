import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, SECONDS_PER_DAY, assertValidParams } from '@app/borrowing-base';
import { CURRENCY_CODES, type Receivable } from '@app/contracts';
import type { Hex } from '@app/merkle';
import { toReceivableLeaves } from './disclosure-selection';
import {
  BREAKDOWN_LABELS,
  buildBorrowingBaseParams,
  currentValuationDate,
  toBreakdownRows,
  topDebtorSharePercent,
} from './borrowing-base';

/**
 * El desglose que ve el jurado. Las cifras las produce `@app/borrowing-base`,
 * pero el orden de las líneas, sus rótulos y las guardas de ratio son de esta
 * capa, y son justamente donde la maqueta se equivoca (llega a renderizar
 * «Infinity%»).
 */

const SALT = `0x${'a1b2c3d4'.repeat(8)}` as Hex;

function receivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    debtorTaxId: '20512345678',
    debtorLabel: 'Supermercados Andinos SAC',
    amountMinor: '800000',
    dueDate: '2026-04-15',
    currency: CURRENCY_CODES.USD,
    docHash: `0x${'0'.repeat(63)}1`,
    ...overrides,
  };
}

const PORTFOLIO: Receivable[] = [
  receivable(),
  receivable({
    debtorTaxId: '20487654321',
    debtorLabel: 'Farmacias del Norte SAC',
    amountMinor: '1250000',
    docHash: `0x${'0'.repeat(63)}2`,
  }),
];

describe('currentValuationDate', () => {
  it('ancla la valorización a medianoche UTC exacta', () => {
    // El motor rechaza cualquier fecha con hora: el mismo cálculo hecho a
    // distinta hora daría distinto resultado y el fondo no lo reproduciría.
    const date = currentValuationDate(Date.parse('2026-08-07T17:42:13.512Z'));

    expect(date).toBe(Date.parse('2026-08-07T00:00:00.000Z') / 1000);
    expect(date % SECONDS_PER_DAY).toBe(0);
  });

  it('no retrocede de día por un instante justo en la medianoche', () => {
    expect(currentValuationDate(Date.parse('2026-08-07T00:00:00.000Z'))).toBe(
      Date.parse('2026-08-07T00:00:00.000Z') / 1000,
    );
  });
});

describe('buildBorrowingBaseParams', () => {
  it('toma los parámetros del paquete y solo añade la fecha de valorización', () => {
    const valuationDate = currentValuationDate(Date.parse('2026-08-07T00:00:00.000Z'));
    const params = buildBorrowingBaseParams(valuationDate);

    expect(params).toEqual({ ...DEFAULT_PARAMS, valuationDate });
  });

  it('produce parámetros que el motor acepta sin retoques', () => {
    const params = buildBorrowingBaseParams(
      currentValuationDate(Date.parse('2026-08-07T09:00:00.000Z')),
    );

    expect(() => assertValidParams(params)).not.toThrow();
  });
});

describe('topDebtorSharePercent', () => {
  it('mide el peso del deudor más grande sobre el nominal divulgado', () => {
    const leaves = toReceivableLeaves(PORTFOLIO, SALT);

    // 1,250,000 sobre 2,050,000 = 60.97…%
    expect(topDebtorSharePercent(leaves)).toBeCloseTo(60.9756, 3);
  });

  it('agrupa por deudor y no por cuota', () => {
    const leaves = toReceivableLeaves(
      [...PORTFOLIO, receivable({ docHash: `0x${'0'.repeat(63)}3` })],
      SALT,
    );

    // Dos cuotas del primer deudor suman 1,600,000 sobre 2,850,000.
    expect(topDebtorSharePercent(leaves)).toBeCloseTo(56.1403, 3);
  });

  it('devuelve null sin hojas en vez de dividir por cero', () => {
    expect(topDebtorSharePercent([])).toBeNull();
  });
});

describe('toBreakdownRows', () => {
  const valuationDate = currentValuationDate(Date.parse('2026-01-05T00:00:00.000Z'));
  const params = buildBorrowingBaseParams(valuationDate);
  const leaves = toReceivableLeaves(PORTFOLIO, SALT);

  it('devuelve las siete líneas en el orden en que se aplican', () => {
    const rows = toBreakdownRows(leaves, params);

    expect(rows.map((row) => row.label)).toEqual([
      'Nominal divulgado',
      BREAKDOWN_LABELS.timeDiscount,
      BREAKDOWN_LABELS.delinquency,
      BREAKDOWN_LABELS.concentration,
      BREAKDOWN_LABELS.serviceContinuity,
      'Valor ajustado por riesgo',
      'Base prestable',
    ]);
  });

  it('marca los cuatro descuentos y deja los totales sin signo', () => {
    const rows = toBreakdownRows(leaves, params);

    expect(rows.map((row) => row.kind)).toEqual([
      'nominal',
      'discount',
      'discount',
      'discount',
      'discount',
      'subtotal',
      'total',
    ]);
  });

  it('cuadra: el nominal menos los cuatro descuentos es el valor ajustado', () => {
    const rows = toBreakdownRows(leaves, params);
    const discounts = rows
      .filter((row) => row.kind === 'discount')
      .reduce((total, row) => total + row.amountMinor, 0n);

    expect(rows[0]!.amountMinor - discounts).toBe(rows[5]!.amountMinor);
  });

  it('cuenta el umbral de concentración y el peso del deudor mayor en la pista', () => {
    const rows = toBreakdownRows(leaves, params);

    expect(rows[3]!.hint).toBe('top 61% · umbral 25%');
  });

  it('describe la línea final con el advance rate de los parámetros', () => {
    const rows = toBreakdownRows(leaves, params);

    expect(rows[6]!.hint).toBe('advance rate 52.8%');
  });

  it('devuelve una lista vacía sin hojas, en vez de propagar el error del motor', () => {
    // `computeBorrowingBase` lanza con cero hojas a propósito. La pantalla
    // necesita un estado vacío, no una excepción durante el render.
    expect(toBreakdownRows([], params)).toEqual([]);
  });
});
