/**
 * Genera `fixtures/golden-vectors.json`.
 *
 * Ese archivo es el contrato entre el lado Web2 y el lado Web3: los tests de
 * Foundry y los de Stylus lo cargan y deben reproducir los mismos bytes. Si
 * una codificación cambia de un lado, el test del otro se pone rojo en el CI.
 *
 *   pnpm --filter @app/merkle vectors:generate
 *
 * Regenerarlo es una decisión deliberada, no un efecto colateral: si el diff
 * toca `root` o algún `leafHash`, hay que avisar al lado Web3 en el mismo PR.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CURRENCY, hashDebtor, hashLeaf, toDueDate, type ReceivableLeaf } from '../src/leaf';
import { buildTree, serializeMultiProof } from '../src/tree';

// Salt fijo: los vectores tienen que ser reproducibles byte a byte.
const SALT = `0x${'a5'.repeat(32)}` as const;

// Cartera reducida del caso Contafácil SAC: 3 deudores, 6 cuotas.
const SOURCE = [
  { taxId: '20512345678', amountMinor: 800_000n, dueDate: '2026-03-15' },
  { taxId: '20512345678', amountMinor: 800_000n, dueDate: '2026-04-15' },
  { taxId: '20487654321', amountMinor: 1_250_000n, dueDate: '2026-03-31' },
  { taxId: '20487654321', amountMinor: 1_250_000n, dueDate: '2026-04-30' },
  { taxId: '20100200300', amountMinor: 450_000n, dueDate: '2026-05-01' },
  { taxId: '20100200300', amountMinor: 450_000n, dueDate: '2026-06-01' },
] as const;

const leaves: ReceivableLeaf[] = SOURCE.map((row, index) => ({
  debtorHash: hashDebtor(row.taxId, SALT),
  amountMinor: row.amountMinor,
  dueDate: toDueDate(row.dueDate),
  currency: CURRENCY.USD,
  docHash: `0x${index.toString(16).padStart(64, '0')}`,
}));

const tree = buildTree(leaves);
const disclosedIndices = [0, 2, 4];

const vectors = {
  version: 1,
  description:
    'Vectores dorados de la hoja canónica. Los tests de Solidity y Stylus deben reproducirlos.',
  leafAbiTypes: ['bytes32', 'uint256', 'uint64', 'uint16', 'bytes32'],
  debtorSalt: SALT,
  leaves: SOURCE.map((row, index) => ({
    // El RUC en claro solo existe acá: son datos sintéticos, y el otro lado
    // necesita poder verificar también la derivación de debtorHash.
    debtorTaxId: row.taxId,
    debtorHash: leaves[index]!.debtorHash,
    amountMinor: leaves[index]!.amountMinor.toString(),
    dueDate: leaves[index]!.dueDate,
    currency: leaves[index]!.currency,
    docHash: leaves[index]!.docHash,
    leafHash: hashLeaf(leaves[index]!),
  })),
  // Array plano de los mismos leafHash. Existe porque el jsonpath con comodín
  // (`.leaves[*].leafHash`) no devuelve un array en Foundry: los tests de
  // Solidity necesitan una lista real para saber cuántas hojas hay y contra
  // qué comparar. A Rust le va a servir por lo mismo.
  leafHashes: leaves.map(hashLeaf),
  root: tree.root,
  multiProof: {
    disclosedIndices,
    ...serializeMultiProof(tree.multiProof(disclosedIndices)),
    /** Hash de las hojas divulgadas, en el orden que devolvió el árbol. */
    leafHashes: tree.multiProof(disclosedIndices).leaves.map(hashLeaf),
  },
};

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/golden-vectors.json');
writeFileSync(target, `${JSON.stringify(vectors, null, 2)}\n`);
console.log(`✓ ${target}`);
console.log(`  root: ${tree.root}`);
