import { describe, expect, it } from 'vitest';
import { CURRENCY_CODES, type Receivable } from '@app/contracts';
import { hashDebtor, toDueDate, type Hex } from '@app/merkle';
import {
  debtorIndices,
  parseStoredSelection,
  sanitizeSelection,
  sumNominalMinor,
  toReceivableLeaves,
} from './disclosure-selection';

/**
 * La selección divulgada es el estado que alimenta el proof y el borrowing
 * base. Todo lo que se derive de ella es lógica de dominio: si aquí se cuela
 * un índice fuera de rango o una hoja mal formada, las dos pantallas mienten a
 * la vez.
 */

const SALT = `0x${'a1b2c3d4'.repeat(8)}` as Hex;

function receivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    debtorTaxId: '20512345678',
    debtorLabel: 'Supermercados Andinos SAC',
    amountMinor: '800000',
    dueDate: '2026-01-15',
    currency: CURRENCY_CODES.USD,
    docHash: `0x${'0'.repeat(63)}1`,
    ...overrides,
  };
}

const PORTFOLIO: Receivable[] = [
  receivable({ docHash: `0x${'0'.repeat(63)}1` }),
  receivable({ dueDate: '2026-04-15', docHash: `0x${'0'.repeat(63)}2` }),
  receivable({
    debtorTaxId: '20487654321',
    debtorLabel: 'Farmacias del Norte SAC',
    amountMinor: '1250000',
    docHash: `0x${'0'.repeat(63)}3`,
  }),
];

describe('sanitizeSelection', () => {
  it('ordena, deduplica y descarta lo que no es un índice válido', () => {
    expect(sanitizeSelection([2, 0, 2, 1], 3)).toEqual([0, 1, 2]);
  });

  it('descarta índices fuera de la cartera', () => {
    // La cartera puede encogerse entre dos sesiones: un índice guardado que ya
    // no existe apuntaría a `undefined` y sumaría NaN al nominal.
    expect(sanitizeSelection([0, 5, -1], 3)).toEqual([0]);
  });

  it('descarta valores que no son enteros', () => {
    expect(sanitizeSelection([1.5, Number.NaN, Number.POSITIVE_INFINITY, 0], 3)).toEqual([0]);
  });

  it('devuelve una selección vacía cuando no hay cartera', () => {
    expect(sanitizeSelection([0, 1], 0)).toEqual([]);
  });
});

describe('parseStoredSelection', () => {
  it('recupera la selección guardada en la sesión', () => {
    expect(parseStoredSelection('[2,0]', 3)).toEqual([0, 2]);
  });

  it('trata la ausencia de valor como selección vacía', () => {
    expect(parseStoredSelection(null, 3)).toEqual([]);
  });

  it('no revienta con contenido corrupto en sessionStorage', () => {
    expect(parseStoredSelection('no es json', 3)).toEqual([]);
    expect(parseStoredSelection('{"a":1}', 3)).toEqual([]);
    expect(parseStoredSelection('["0","1"]', 3)).toEqual([]);
  });
});

describe('sumNominalMinor', () => {
  it('suma en bigint las cuotas seleccionadas', () => {
    expect(sumNominalMinor(PORTFOLIO, [0, 2])).toBe(2_050_000n);
  });

  it('devuelve cero sin selección', () => {
    expect(sumNominalMinor(PORTFOLIO, [])).toBe(0n);
  });

  it('ignora índices que no existen en vez de producir NaN', () => {
    expect(sumNominalMinor(PORTFOLIO, [0, 99])).toBe(800_000n);
  });
});

describe('toReceivableLeaves', () => {
  it('deriva la hoja canónica con los helpers de @app/merkle', () => {
    const [leaf] = toReceivableLeaves(PORTFOLIO, SALT, [0]);

    // El hash del deudor sale del paquete que define la hoja: replicarlo aquí
    // con otra fórmula es exactamente lo que rompe la verificación on-chain.
    expect(leaf).toEqual({
      debtorHash: hashDebtor('20512345678', SALT),
      amountMinor: 800_000n,
      dueDate: toDueDate('2026-01-15'),
      currency: CURRENCY_CODES.USD,
      docHash: PORTFOLIO[0]!.docHash,
    });
  });

  it('respeta el orden de los índices que recibe', () => {
    const leaves = toReceivableLeaves(PORTFOLIO, SALT, [2, 0]);
    expect(leaves.map((leaf) => leaf.amountMinor)).toEqual([1_250_000n, 800_000n]);
  });

  it('da el mismo debtorHash a dos cuotas del mismo deudor', () => {
    const leaves = toReceivableLeaves(PORTFOLIO, SALT, [0, 1]);
    expect(leaves[0]!.debtorHash).toBe(leaves[1]!.debtorHash);
  });

  it('da distinto debtorHash a deudores distintos', () => {
    const leaves = toReceivableLeaves(PORTFOLIO, SALT, [0, 2]);
    expect(leaves[0]!.debtorHash).not.toBe(leaves[1]!.debtorHash);
  });

  it('sin índices convierte la cartera entera', () => {
    expect(toReceivableLeaves(PORTFOLIO, SALT)).toHaveLength(PORTFOLIO.length);
  });
});

describe('debtorIndices', () => {
  it('devuelve todas las posiciones de un deudor', () => {
    expect(debtorIndices(PORTFOLIO, 'Supermercados Andinos SAC')).toEqual([0, 1]);
  });

  it('devuelve vacío para un deudor que no está en la cartera', () => {
    expect(debtorIndices(PORTFOLIO, 'Municipalidad de Ate')).toEqual([]);
  });
});
