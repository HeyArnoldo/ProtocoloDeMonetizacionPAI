import { describe, expect, it } from 'vitest';

import {
  CURRENCY,
  LEAF_ABI_TYPES,
  hashDebtor,
  hashLeaf,
  randomDebtorSalt,
  toDueDate,
  toLeafTuple,
  type ReceivableLeaf,
} from './leaf';

const DOC_HASH = `0x${'ab'.repeat(32)}` as const;
const SALT = `0x${'0f'.repeat(32)}` as const;

function leaf(overrides: Partial<ReceivableLeaf> = {}): ReceivableLeaf {
  return {
    debtorHash: hashDebtor('20512345678', SALT),
    amountMinor: 800_000n,
    dueDate: toDueDate('2026-03-15'),
    currency: CURRENCY.USD,
    docHash: DOC_HASH,
    ...overrides,
  };
}

describe('LEAF_ABI_TYPES', () => {
  // Este orden es normativo: el contrato Solidity y el motor Stylus decodifican
  // exactamente esta tupla. Cambiarlo rompe la verificacion on-chain.
  it('fija el orden y los tipos ABI de la hoja', () => {
    expect(LEAF_ABI_TYPES).toEqual(['bytes32', 'uint256', 'uint64', 'uint16', 'bytes32']);
  });
});

describe('hashDebtor', () => {
  it('devuelve un bytes32', () => {
    expect(hashDebtor('20512345678', SALT)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('nunca deja el identificador en claro', () => {
    // La hoja puede publicarse dentro de un proof: el RUC no puede ser legible.
    expect(hashDebtor('20512345678', SALT)).not.toContain('20512345678');
  });

  it('normaliza espacios y mayusculas para que el mismo deudor de el mismo hash', () => {
    expect(hashDebtor('  20512345678  ', SALT)).toBe(hashDebtor('20512345678', SALT));
    expect(hashDebtor('pe20512345678', SALT)).toBe(hashDebtor('PE20512345678', SALT));
  });

  it('distingue deudores distintos', () => {
    expect(hashDebtor('20512345678', SALT)).not.toBe(hashDebtor('20512345679', SALT));
  });

  it('el mismo deudor bajo distinto salt da distinto hash', () => {
    // Sin esto, un RUC de 11 digitos (10^11 combinaciones) se saca por fuerza
    // bruta desde cualquier proof publicado y se revela la cartera de clientes.
    const otherSalt = `0x${'f0'.repeat(32)}` as const;
    expect(hashDebtor('20512345678', SALT)).not.toBe(hashDebtor('20512345678', otherSalt));
  });

  it('rechaza un identificador vacio', () => {
    expect(() => hashDebtor('   ', SALT)).toThrow(/identificador/i);
  });

  it('rechaza un salt que no sea bytes32', () => {
    expect(() => hashDebtor('20512345678', '0xabc' as never)).toThrow(/salt/i);
  });
});

describe('randomDebtorSalt', () => {
  it('devuelve un bytes32', () => {
    expect(randomDebtorSalt()).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('no se repite', () => {
    expect(randomDebtorSalt()).not.toBe(randomDebtorSalt());
  });
});

describe('toDueDate', () => {
  it('convierte una fecha ISO a medianoche UTC en segundos', () => {
    expect(toDueDate('2026-03-15')).toBe(Date.UTC(2026, 2, 15) / 1000);
  });

  it('produce un multiplo exacto de un dia', () => {
    expect(toDueDate('2026-03-15') % 86_400).toBe(0);
  });

  it('rechaza formatos que no sean YYYY-MM-DD', () => {
    expect(() => toDueDate('15/03/2026')).toThrow(/YYYY-MM-DD/);
    expect(() => toDueDate('2026-03-15T10:30:00Z')).toThrow(/YYYY-MM-DD/);
  });

  it('rechaza fechas inexistentes', () => {
    expect(() => toDueDate('2026-02-30')).toThrow(/no existe/i);
  });
});

describe('toLeafTuple', () => {
  it('serializa en el orden de LEAF_ABI_TYPES', () => {
    const value = leaf();
    expect(toLeafTuple(value)).toEqual([
      value.debtorHash,
      value.amountMinor,
      BigInt(value.dueDate),
      BigInt(value.currency),
      value.docHash,
    ]);
  });
});

describe('hashLeaf — invariantes', () => {
  it('devuelve un bytes32', () => {
    expect(hashLeaf(leaf())).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('es determinista', () => {
    expect(hashLeaf(leaf())).toBe(hashLeaf(leaf()));
  });

  it('cambia si cambia cualquier campo', () => {
    const base = hashLeaf(leaf());
    expect(hashLeaf(leaf({ amountMinor: 800_001n }))).not.toBe(base);
    expect(hashLeaf(leaf({ dueDate: toDueDate('2026-03-16') }))).not.toBe(base);
    expect(hashLeaf(leaf({ currency: CURRENCY.PEN }))).not.toBe(base);
    expect(hashLeaf(leaf({ docHash: `0x${'cd'.repeat(32)}` }))).not.toBe(base);
    expect(hashLeaf(leaf({ debtorHash: hashDebtor('20599999999', SALT) }))).not.toBe(base);
  });

  it('rechaza un vencimiento que no sea medianoche UTC', () => {
    // Sin esta guarda, dos personas cargando "15 de marzo" a horas distintas
    // producen hojas distintas y el multiproof falla sin decir por que.
    expect(() => hashLeaf(leaf({ dueDate: toDueDate('2026-03-15') + 3_600 }))).toThrow(
      /medianoche UTC/i,
    );
  });

  it('rechaza montos no positivos', () => {
    expect(() => hashLeaf(leaf({ amountMinor: 0n }))).toThrow(/monto/i);
    expect(() => hashLeaf(leaf({ amountMinor: -1n }))).toThrow(/monto/i);
  });

  it('rechaza una moneda fuera de ISO-4217 conocida', () => {
    expect(() => hashLeaf(leaf({ currency: 999 as never }))).toThrow(/moneda/i);
  });

  it('rechaza hashes que no sean bytes32', () => {
    expect(() => hashLeaf(leaf({ docHash: '0xabc' as never }))).toThrow(/bytes32/i);
    expect(() => hashLeaf(leaf({ debtorHash: '0xABC' as never }))).toThrow(/bytes32/i);
  });
});
