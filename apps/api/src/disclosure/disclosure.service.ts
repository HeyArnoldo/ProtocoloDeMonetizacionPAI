import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  DisclosurePreviewRequest,
  DisclosurePreviewResponse,
  Receivable,
  SamplePortfolio,
} from '@app/contracts';
import { CURRENCY_CODES } from '@app/contracts';
import {
  buildTree,
  hashDebtor,
  hashLeaf,
  randomDebtorSalt,
  toDueDate,
  verifyMultiProof,
  type Hex,
  type ReceivableLeaf,
} from '@app/merkle';

/**
 * Divulgación selectiva.
 *
 * La empresa elige qué cuotas mostrarle al prestamista y prueba que
 * pertenecen al expediente certificado **sin revelar las demás ni sus
 * contrapartes**. Es privacidad comercial real, sin ZK: solo Merkle.
 *
 * Sin estado a propósito: la cartera viaja en la request. El expediente
 * persistido llega con el módulo de `assets`; esto ya deja el cálculo — que es
 * la parte con reglas — cerrado y testeado.
 */
@Injectable()
export class DisclosureService {
  /** Cartera del caso Contafácil SAC, para tener algo cargable de una vez. */
  samplePortfolio(): SamplePortfolio {
    const contracts = [
      { taxId: '20512345678', label: 'Supermercados Andinos SAC', monthly: 800_000 },
      { taxId: '20487654321', label: 'Farmacias del Norte SAC', monthly: 1_250_000 },
      { taxId: '20100200300', label: 'Distribuidora Lima Sur EIRL', monthly: 450_000 },
      { taxId: '20655544433', label: 'Municipalidad de Ate', monthly: 620_000 },
    ];

    const receivables: Receivable[] = [];
    for (const [contractIndex, contract] of contracts.entries()) {
      // 4 cuotas por contrato: suficiente para que el selector tenga sentido
      // y el arbol tenga profundidad real.
      for (let installment = 0; installment < 4; installment++) {
        const month = String(installment * 3 + 1).padStart(2, '0');
        receivables.push({
          debtorTaxId: contract.taxId,
          debtorLabel: contract.label,
          amountMinor: String(contract.monthly),
          dueDate: `2026-${month}-15`,
          currency: CURRENCY_CODES.USD,
          docHash: `0x${(contractIndex * 4 + installment + 1).toString(16).padStart(64, '0')}`,
        });
      }
    }

    return { salt: randomDebtorSalt(), receivables };
  }

  preview(request: DisclosurePreviewRequest): DisclosurePreviewResponse {
    const leaves = this.toLeaves(request.receivables, request.salt as Hex);

    // Los errores de @app/merkle son de dominio (fecha imposible, cuota
    // duplicada, indice fuera de rango): todos son culpa del input, asi que
    // salen como 400 con el mensaje original en vez de un 500 opaco.
    try {
      const tree = buildTree(leaves);
      const multiProof = tree.multiProof(request.disclosedIndices);
      const disclosedCount = multiProof.leaves.length;

      const disclosedNominalMinor = multiProof.leaves.reduce(
        (total, leaf) => total + leaf.amountMinor,
        0n,
      );

      return {
        root: tree.root,
        totalLeaves: leaves.length,
        disclosedCount,
        hiddenCount: leaves.length - disclosedCount,
        disclosedNominalMinor: disclosedNominalMinor.toString(),
        disclosedLeaves: multiProof.leaves.map((leaf) => ({
          debtorHash: leaf.debtorHash,
          amountMinor: leaf.amountMinor.toString(),
          dueDate: leaf.dueDate,
          currency: leaf.currency,
          docHash: leaf.docHash,
          leafHash: hashLeaf(leaf),
        })),
        proof: multiProof.proof,
        proofFlags: multiProof.proofFlags,
        // El servidor verifica su propio proof antes de entregarlo. Si alguna
        // vez diera false, el bug esta aca y no en el prestamista.
        verified: verifyMultiProof(tree.root, multiProof),
      };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private toLeaves(receivables: Receivable[], salt: Hex): ReceivableLeaf[] {
    try {
      return receivables.map((item) => ({
        debtorHash: hashDebtor(item.debtorTaxId, salt),
        amountMinor: BigInt(item.amountMinor),
        dueDate: toDueDate(item.dueDate),
        currency: item.currency,
        docHash: item.docHash as Hex,
      }));
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }
}
