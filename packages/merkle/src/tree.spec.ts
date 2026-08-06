import { describe, expect, it } from 'vitest';

import { CURRENCY, hashDebtor, hashLeaf, toDueDate, type ReceivableLeaf } from './leaf';
import { buildTree, deserializeMultiProof, serializeMultiProof, verifyMultiProof } from './tree';

const SALT = `0x${'0f'.repeat(32)}` as const;

function portfolio(count: number): ReceivableLeaf[] {
  return Array.from({ length: count }, (_, i) => ({
    debtorHash: hashDebtor(`2051234500${i % 5}`, SALT),
    amountMinor: BigInt(500_000 + i * 1_000),
    dueDate: toDueDate(`2026-${String((i % 12) + 1).padStart(2, '0')}-01`),
    currency: CURRENCY.USD,
    docHash: `0x${i.toString(16).padStart(64, '0')}` as `0x${string}`,
  }));
}

describe('buildTree', () => {
  it('produce un root bytes32', () => {
    expect(buildTree(portfolio(18)).root).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('el root no depende del orden de entrada', () => {
    // El fondo y el backend pueden ordenar la cartera distinto. Si el root
    // cambiara por eso, la certificacion dejaria de valer al reordenar.
    const leaves = portfolio(18);
    const reversed = [...leaves].reverse();
    expect(buildTree(reversed).root).toBe(buildTree(leaves).root);
  });

  it('el root cambia si cambia una sola hoja', () => {
    const leaves = portfolio(18);
    const tampered = [...leaves];
    tampered[7] = { ...tampered[7]!, amountMinor: tampered[7]!.amountMinor + 1n };
    expect(buildTree(tampered).root).not.toBe(buildTree(leaves).root);
  });

  it('expone el hash de cada hoja, consistente con hashLeaf', () => {
    const leaves = portfolio(4);
    const tree = buildTree(leaves);
    expect(tree.leafHashes).toEqual(leaves.map(hashLeaf));
  });

  it('rechaza una cartera vacia', () => {
    expect(() => buildTree([])).toThrow(/al menos una hoja/i);
  });

  it('rechaza hojas duplicadas', () => {
    // Dos hojas identicas serian la misma cuota contada dos veces: infla la
    // base prestable sin que ningun proof lo delate.
    const [first] = portfolio(1);
    expect(() => buildTree([first!, { ...first! }])).toThrow(/duplicada/i);
  });
});

describe('multiproof — divulgacion selectiva', () => {
  it('un subconjunto divulgado verifica contra el root', () => {
    const leaves = portfolio(216);
    const tree = buildTree(leaves);
    const disclosed = [0, 5, 17, 100, 215];

    const proof = tree.multiProof(disclosed);

    expect(proof.leaves).toHaveLength(disclosed.length);
    expect(verifyMultiProof(tree.root, proof)).toBe(true);
  });

  it('no revela el CONTENIDO de las hojas no divulgadas', () => {
    // Este es el argumento de privacidad comercial, y hay que enunciarlo con
    // precision: un multiproof SI incluye hashes de hojas hermanas ocultas —
    // es como funciona un arbol de Merkle. Lo que no revela es su contenido:
    // ni deudor, ni monto, ni vencimiento, ni documento.
    const leaves = portfolio(216);
    const tree = buildTree(leaves);
    const proof = tree.multiProof([0, 1, 2]);

    const serialized = JSON.stringify(serializeMultiProof(proof));
    for (const hidden of leaves.slice(3)) {
      expect(serialized).not.toContain(hidden.docHash.slice(2));
      expect(serialized).not.toContain(hidden.amountMinor.toString());
    }
  });

  it('solo entrega las hojas divulgadas, nunca mas', () => {
    const leaves = portfolio(216);
    const tree = buildTree(leaves);
    const disclosed = [0, 1, 2];

    const returned = new Set(tree.multiProof(disclosed).leaves.map(hashLeaf));
    const expected = new Set(disclosed.map((i) => hashLeaf(leaves[i]!)));

    expect(returned).toEqual(expected);
  });

  it('un proof valido no verifica contra otro root', () => {
    const tree = buildTree(portfolio(18));
    const other = buildTree(portfolio(20));
    expect(verifyMultiProof(other.root, tree.multiProof([0, 3]))).toBe(false);
  });

  it('una hoja alterada dentro del proof no verifica', () => {
    const tree = buildTree(portfolio(18));
    const proof = tree.multiProof([0, 3]);
    const tampered = {
      ...proof,
      leaves: [{ ...proof.leaves[0]!, amountMinor: 999_999_999n }, proof.leaves[1]!],
    };
    expect(verifyMultiProof(tree.root, tampered)).toBe(false);
  });

  it('rechaza indices fuera de rango', () => {
    const tree = buildTree(portfolio(4));
    expect(() => tree.multiProof([9])).toThrow(/fuera de rango/i);
  });

  it('rechaza una divulgacion vacia', () => {
    const tree = buildTree(portfolio(4));
    expect(() => tree.multiProof([])).toThrow(/al menos una hoja/i);
  });
});

describe('serializacion — el proof viaja por HTTP hasta el prestamista', () => {
  it('sobrevive el round-trip por JSON', () => {
    const tree = buildTree(portfolio(18));
    const proof = tree.multiProof([0, 4, 9]);

    const rebuilt = deserializeMultiProof(
      JSON.parse(JSON.stringify(serializeMultiProof(proof))) as ReturnType<
        typeof serializeMultiProof
      >,
    );

    expect(rebuilt).toEqual(proof);
    expect(verifyMultiProof(tree.root, rebuilt)).toBe(true);
  });

  it('serializa el monto como string, no como number', () => {
    // Number pierde precision sobre 2^53 y esto es dinero.
    const tree = buildTree(portfolio(2));
    const [first] = serializeMultiProof(tree.multiProof([0])).leaves;
    expect(typeof first!.amountMinor).toBe('string');
  });

  it('rechaza al deserializar una hoja que viola los invariantes', () => {
    const tree = buildTree(portfolio(2));
    const serialized = serializeMultiProof(tree.multiProof([0]));
    serialized.leaves[0]!.amountMinor = '-1';
    expect(() => deserializeMultiProof(serialized)).toThrow(/monto/i);
  });
});
