import { CURRENCY_CODES, type CreateAssetInput, type CreateReceivableInput } from '@app/contracts';

/**
 * El borrador del expediente antes de convertirse en `CreateAssetInput`.
 *
 * Los campos son strings porque vienen de un formulario: un `number` en el
 * camino convertiría `amountMinor` en coma flotante, y el monto es dinero.
 * La conversión a la entrada de la API valida y normaliza en un solo lugar,
 * para que la pantalla no tenga que recordar ninguna de las dos reglas.
 */
export interface AssetDraftRow {
  evidenceId: string;
  debtorTaxId: string;
  debtorLabel: string;
  amountMinor: string;
  dueDate: string;
  currency: number;
}

export interface AssetDraft {
  controller: string;
  rows: AssetDraftRow[];
}

export function emptyRow(): AssetDraftRow {
  return {
    evidenceId: '',
    debtorTaxId: '',
    debtorLabel: '',
    amountMinor: '',
    dueDate: '',
    currency: CURRENCY_CODES.USD,
  };
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida el borrador y produce la entrada de `POST /assets`.
 *
 * Lanza con un mensaje que nombra la cuota exacta: en un expediente de doce
 * filas, «falta el monto» sin decir cuál obliga a revisarlas todas.
 */
export function buildCreateAssetInput(draft: AssetDraft): CreateAssetInput {
  const controller = draft.controller.trim();
  if (!ADDRESS.test(controller)) {
    throw new Error('Indica la wallet controladora del expediente (0x + 40 hexadecimales).');
  }
  if (draft.rows.length === 0) {
    throw new Error('Agrega al menos una cuota al expediente.');
  }

  const receivables = draft.rows.map((row, index): CreateReceivableInput => {
    const at = `Cuota ${index + 1}:`;
    const debtorTaxId = row.debtorTaxId.trim();
    const debtorLabel = row.debtorLabel.trim();

    if (!row.evidenceId) throw new Error(`${at} elige la evidencia que la respalda.`);
    if (!debtorTaxId) throw new Error(`${at} falta el RUC del deudor.`);
    if (!debtorLabel) throw new Error(`${at} falta la razón social del deudor.`);
    if (!POSITIVE_INTEGER.test(row.amountMinor)) {
      throw new Error(`${at} el monto debe ser un entero positivo en unidades menores.`);
    }
    if (!ISO_DATE.test(row.dueDate)) throw new Error(`${at} falta la fecha de vencimiento.`);

    return {
      evidenceId: row.evidenceId,
      debtorTaxId,
      debtorLabel,
      amountMinor: row.amountMinor,
      dueDate: row.dueDate,
      currency: row.currency as CreateReceivableInput['currency'],
    };
  });

  // Minúsculas a propósito: `addressSchema` las exige y MetaMask entrega la
  // cuenta en checksum. Sin esto, pegar la wallet conectada da un 400 opaco.
  return { controller: controller.toLowerCase(), receivables };
}
