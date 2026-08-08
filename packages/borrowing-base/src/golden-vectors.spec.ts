import { describe, expect, it } from 'vitest';
import { type ReceivableLeaf } from '@app/merkle';

import vectors from '../fixtures/golden-vectors.json';
import { computeBorrowingBase } from './engine';
import { type BorrowingBaseParams } from './params';

/**
 * Candado del motor de riesgo, equivalente al de la hoja de Merkle.
 *
 * Estos numeros son exactos a proposito: cualquier cambio de formula o de
 * direccion de redondeo los mueve, y este test lo detecta. Si se ponen rojos
 * NO se regenera el fixture sin mas — se decide si el cambio era intencional
 * y se avisa al lado Rust en el mismo PR.
 */
const leaves: ReceivableLeaf[] = vectors.leaves.map((row) => ({
  debtorHash: row.debtorHash as ReceivableLeaf['debtorHash'],
  amountMinor: BigInt(row.amountMinor),
  dueDate: Number(row.dueDate),
  currency: Number(row.currency) as ReceivableLeaf['currency'],
  docHash: row.docHash as ReceivableLeaf['docHash'],
}));

const params = vectors.params as BorrowingBaseParams;

describe('vectores dorados del motor', () => {
  it('reproduce el nominal divulgado', () => {
    expect(computeBorrowingBase(leaves, params).disclosedNominalMinor.toString()).toBe(
      vectors.expected.disclosedNominalMinor,
    );
  });

  it('reproduce cada linea del desglose', () => {
    const result = computeBorrowingBase(leaves, params);

    expect(
      result.breakdown.map((item) => ({
        concept: item.concept,
        amountMinor: item.amountMinor.toString(),
      })),
    ).toEqual(vectors.expected.breakdown);
  });

  it('reproduce el valor ajustado por riesgo', () => {
    expect(computeBorrowingBase(leaves, params).riskAdjustedMinor.toString()).toBe(
      vectors.expected.riskAdjustedMinor,
    );
  });

  it('reproduce la base prestable', () => {
    // Este es EL numero: el que el fondo recomputa en vivo durante la demo.
    expect(computeBorrowingBase(leaves, params).borrowingBaseMinor.toString()).toBe(
      vectors.expected.borrowingBaseMinor,
    );
  });

  it('el desglose del fixture cuadra con su propio valor ajustado', () => {
    const deductions = vectors.expected.breakdown.reduce(
      (total, item) => total + BigInt(item.amountMinor),
      0n,
    );

    expect(BigInt(vectors.expected.disclosedNominalMinor) - deductions).toBe(
      BigInt(vectors.expected.riskAdjustedMinor),
    );
  });
});
