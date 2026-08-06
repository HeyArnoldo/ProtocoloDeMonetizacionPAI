import { describe, expect, it } from 'vitest';

import vectors from '../fixtures/golden-vectors.json';
import {
  CURRENCY,
  LEAF_ABI_TYPES,
  hashDebtor,
  hashLeaf,
  type Hex,
  type ReceivableLeaf,
} from './leaf';
import { buildTree, deserializeMultiProof, verifyMultiProof } from './tree';

/**
 * Estos tests son el candado de la frontera Web2 ↔ Web3.
 *
 * Si alguno se pone rojo, la codificacion de la hoja cambio y la verificacion
 * on-chain va a fallar. No se arregla regenerando los vectores sin mas: se
 * regeneran a proposito y se avisa al lado Web3 en el mismo PR.
 */
const leaves: ReceivableLeaf[] = vectors.leaves.map((row) => ({
  debtorHash: row.debtorHash as Hex,
  amountMinor: BigInt(row.amountMinor),
  dueDate: row.dueDate,
  currency: row.currency as typeof CURRENCY.USD,
  docHash: row.docHash as Hex,
}));

describe('vectores dorados', () => {
  it('los tipos ABI del fixture coinciden con los del codigo', () => {
    expect(vectors.leafAbiTypes).toEqual([...LEAF_ABI_TYPES]);
  });

  it('reproduce cada debtorHash desde el RUC y el salt', () => {
    for (const row of vectors.leaves) {
      expect(hashDebtor(row.debtorTaxId, vectors.debtorSalt as Hex)).toBe(row.debtorHash);
    }
  });

  it('reproduce cada leafHash', () => {
    for (const [index, row] of vectors.leaves.entries()) {
      expect(hashLeaf(leaves[index]!)).toBe(row.leafHash);
    }
  });

  it('reproduce el root', () => {
    expect(buildTree(leaves).root).toBe(vectors.root);
  });

  it('el multiproof del fixture verifica contra el root del fixture', () => {
    const proof = deserializeMultiProof({
      leaves: vectors.multiProof.leaves.map((leaf) => ({
        debtorHash: leaf.debtorHash as Hex,
        amountMinor: leaf.amountMinor,
        dueDate: leaf.dueDate,
        currency: leaf.currency,
        docHash: leaf.docHash as Hex,
      })),
      proof: vectors.multiProof.proof as Hex[],
      proofFlags: vectors.multiProof.proofFlags,
    });

    expect(verifyMultiProof(vectors.root as Hex, proof)).toBe(true);
  });

  it('el multiproof recien construido coincide con el del fixture', () => {
    const built = buildTree(leaves).multiProof(vectors.multiProof.disclosedIndices);
    expect(built.proof).toEqual(vectors.multiProof.proof);
    expect(built.proofFlags).toEqual(vectors.multiProof.proofFlags);
  });
});
