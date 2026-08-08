/**
 * Genera `fixtures/golden-vectors.json`.
 *
 * Mismo rol que los vectores de la hoja de Merkle, para el motor de riesgo:
 * los tests de Stylus cargan este JSON y deben producir exactamente los mismos
 * enteros. Si un lado cambia una fórmula o una dirección de redondeo, el test
 * del otro se pone rojo.
 *
 *   pnpm --filter @app/borrowing-base vectors:generate
 *
 * Si el diff toca cualquier monto, hay que avisarlo en el mismo PR: significa
 * que el motor calcula distinto que antes.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CURRENCY, hashDebtor, toDueDate, type ReceivableLeaf } from '@app/merkle';

import { computeBorrowingBase } from '../src/engine';
import { DEFAULT_PARAMS, type BorrowingBaseParams } from '../src/params';

const SALT = `0x${'a5'.repeat(32)}` as const;

const DEBTORS = [
  { taxId: '20512345678', label: 'Supermercados Andinos SAC', monthly: 800_000n },
  { taxId: '20487654321', label: 'Farmacias del Norte SAC', monthly: 1_250_000n },
  { taxId: '20100200300', label: 'Distribuidora Lima Sur EIRL', monthly: 450_000n },
  { taxId: '20655544433', label: 'Municipalidad de Ate', monthly: 620_000n },
] as const;

const params: BorrowingBaseParams = {
  valuationDate: toDueDate('2026-01-01'),
  ...DEFAULT_PARAMS,
};

const leaves: ReceivableLeaf[] = [];
const readable: Array<Record<string, string | number>> = [];

for (const [debtorIndex, debtor] of DEBTORS.entries()) {
  for (let installment = 0; installment < 4; installment++) {
    const month = String(installment * 3 + 2).padStart(2, '0');
    const dueDate = `2026-${month}-15`;
    const docHash = `0x${(debtorIndex * 4 + installment + 1).toString(16).padStart(64, '0')}`;

    leaves.push({
      debtorHash: hashDebtor(debtor.taxId, SALT),
      amountMinor: debtor.monthly,
      dueDate: toDueDate(dueDate),
      currency: CURRENCY.USD,
      docHash: docHash as ReceivableLeaf['docHash'],
    });

    readable.push({
      debtorTaxId: debtor.taxId,
      debtorHash: hashDebtor(debtor.taxId, SALT),
      amountMinor: debtor.monthly.toString(),
      dueDate: toDueDate(dueDate),
      dueDateIso: dueDate,
      currency: CURRENCY.USD,
      docHash,
    });
  }
}

const result = computeBorrowingBase(leaves, params);

const vectors = {
  version: 1,
  description:
    'Vectores dorados del motor de borrowing base. Los tests de Stylus deben reproducir estos enteros.',
  note: 'Los parámetros son ilustrativos y necesitan calibración de un analista de riesgo real.',
  debtorSalt: SALT,
  params,
  leaves: readable,
  expected: {
    disclosedNominalMinor: result.disclosedNominalMinor.toString(),
    riskAdjustedMinor: result.riskAdjustedMinor.toString(),
    borrowingBaseMinor: result.borrowingBaseMinor.toString(),
    breakdown: result.breakdown.map((item) => ({
      concept: item.concept,
      amountMinor: item.amountMinor.toString(),
    })),
  },
};

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/golden-vectors.json');
writeFileSync(target, `${JSON.stringify(vectors, null, 2)}\n`);

console.log(`✓ ${target}`);
console.log(`  nominal        ${result.disclosedNominalMinor}`);
console.log(`  ajustado       ${result.riskAdjustedMinor}`);
console.log(`  base prestable ${result.borrowingBaseMinor}`);
