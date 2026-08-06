import { StandardMerkleTree } from '@openzeppelin/merkle-tree';

import {
  LEAF_ABI_TYPES,
  assertValidLeaf,
  hashLeaf,
  toLeafTuple,
  type Hex,
  type ReceivableLeaf,
} from './leaf';

/**
 * Prueba de que un subconjunto de cuotas pertenece al expediente certificado,
 * sin revelar las demás.
 *
 * El formato (`proof` + `proofFlags`) es el que consume `MerkleProof
 * .multiProofVerify` de OpenZeppelin on-chain. El orden de `leaves` es el que
 * devolvió el árbol y **no debe reordenarse**: la verificación depende de él.
 */
export interface ReceivableMultiProof {
  leaves: ReceivableLeaf[];
  proof: Hex[];
  proofFlags: boolean[];
}

export interface ReceivableTree {
  /** Root del expediente. Es lo único que se escribe on-chain. */
  root: Hex;
  /** Hash de cada hoja, en el orden en que se pasaron a `buildTree`. */
  leafHashes: Hex[];
  /** Construye el multiproof de las hojas indicadas por índice de entrada. */
  multiProof(indices: number[]): ReceivableMultiProof;
}

type OzValue = unknown[];

const toOzValue = (leaf: ReceivableLeaf): OzValue => toLeafTuple(leaf) as unknown as OzValue;

/**
 * Construye el árbol del expediente.
 *
 * El root es independiente del orden de entrada: `StandardMerkleTree` ordena
 * las hojas por hash internamente. Eso importa porque el backend y el fondo
 * pueden listar la cartera distinto, y la certificación no puede depender de
 * en qué orden alguien exportó un CSV.
 */
export function buildTree(leaves: ReceivableLeaf[]): ReceivableTree {
  if (leaves.length === 0) {
    throw new Error('El expediente necesita al menos una hoja.');
  }

  for (const leaf of leaves) {
    assertValidLeaf(leaf);
  }

  const leafHashes = leaves.map(hashLeaf);

  // Dos hojas idénticas serían la misma cuota contada dos veces: inflan la
  // base prestable y ningún proof lo delata, porque ambas son válidas.
  const seen = new Set<Hex>();
  for (const [index, leafHash] of leafHashes.entries()) {
    if (seen.has(leafHash)) {
      throw new Error(`Hoja duplicada en la posición ${index}: la misma cuota aparece dos veces.`);
    }
    seen.add(leafHash);
  }

  const tree = StandardMerkleTree.of(leaves.map(toOzValue), [...LEAF_ABI_TYPES]);
  const byLeafHash = new Map(leafHashes.map((leafHash, index) => [leafHash, leaves[index]!]));

  return {
    root: tree.root as Hex,
    leafHashes,

    multiProof(indices: number[]): ReceivableMultiProof {
      if (indices.length === 0) {
        throw new Error('Hay que divulgar al menos una hoja.');
      }
      for (const index of indices) {
        if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
          throw new Error(
            `Índice fuera de rango: ${index}. El expediente tiene ${leaves.length} hojas.`,
          );
        }
      }

      const unique = [...new Set(indices)];
      const {
        leaves: disclosed,
        proof,
        proofFlags,
      } = tree.getMultiProof(unique.map((index) => toOzValue(leaves[index]!)));

      return {
        // Se traduce de vuelta a hojas de dominio respetando el orden que
        // devolvió el árbol, no el orden en que se pidieron los índices.
        leaves: disclosed.map((value) => {
          const leaf = byLeafHash.get(tree.leafHash(value) as Hex);
          /* c8 ignore next 3 */
          if (!leaf) {
            throw new Error('El árbol devolvió una hoja que no pertenece al expediente.');
          }
          return leaf;
        }),
        proof: proof as Hex[],
        proofFlags,
      };
    },
  };
}

/** Multiproof listo para viajar por HTTP: sin `bigint`, que JSON no serializa. */
export interface SerializedMultiProof {
  leaves: Array<{
    debtorHash: Hex;
    /** Decimal en unidades menores. String para no perder precisión ni usar float. */
    amountMinor: string;
    dueDate: number;
    currency: number;
    docHash: Hex;
  }>;
  proof: Hex[];
  proofFlags: boolean[];
}

/**
 * Serializa el multiproof para enviarlo al prestamista.
 *
 * El monto va como string y no como number: `Number` pierde precisión sobre
 * 2^53 y en dinero eso no se negocia.
 */
export function serializeMultiProof(multiProof: ReceivableMultiProof): SerializedMultiProof {
  return {
    leaves: multiProof.leaves.map((leaf) => ({
      debtorHash: leaf.debtorHash,
      amountMinor: leaf.amountMinor.toString(),
      dueDate: leaf.dueDate,
      currency: leaf.currency,
      docHash: leaf.docHash,
    })),
    proof: multiProof.proof,
    proofFlags: multiProof.proofFlags,
  };
}

/** Inverso de `serializeMultiProof`. El orden de las hojas se preserva tal cual. */
export function deserializeMultiProof(multiProof: SerializedMultiProof): ReceivableMultiProof {
  return {
    leaves: multiProof.leaves.map((leaf) => {
      const parsed: ReceivableLeaf = {
        debtorHash: leaf.debtorHash,
        amountMinor: BigInt(leaf.amountMinor),
        dueDate: leaf.dueDate,
        currency: leaf.currency as ReceivableLeaf['currency'],
        docHash: leaf.docHash,
      };
      assertValidLeaf(parsed);
      return parsed;
    }),
    proof: multiProof.proof,
    proofFlags: multiProof.proofFlags,
  };
}

/**
 * Verifica un multiproof contra un root.
 *
 * Es la operación que hace el prestamista: toma el root certificado on-chain,
 * las hojas que la empresa decidió divulgar y el proof, y comprueba que
 * pertenecen al expediente. Devuelve `false` ante cualquier inconsistencia —
 * un verificador no lanza excepciones, decide.
 */
export function verifyMultiProof(root: Hex, multiProof: ReceivableMultiProof): boolean {
  try {
    return StandardMerkleTree.verifyMultiProof(root, [...LEAF_ABI_TYPES], {
      leaves: multiProof.leaves.map(toOzValue),
      proof: multiProof.proof,
      proofFlags: multiProof.proofFlags,
    });
  } catch {
    return false;
  }
}
