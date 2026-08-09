import type { Receivable } from '@app/contracts';
import {
  hashDebtor,
  toDueDate,
  type CurrencyCode,
  type Hex,
  type ReceivableLeaf,
} from '@app/merkle';

/**
 * Derivaciones de la selección divulgada.
 *
 * La selección es un puñado de índices sobre la cartera, y de ahí salen tres
 * cosas que dos pantallas distintas muestran a la vez: el nominal divulgado,
 * las hojas que van al multiproof y las hojas que entran al motor de borrowing
 * base. Vive aquí, fuera de React, porque es aritmética de dominio y se prueba
 * como tal.
 */

/**
 * Deja la selección en forma canónica: enteros únicos dentro de la cartera y
 * en orden ascendente.
 *
 * El orden importa más de lo que parece: `POST /api/disclosure/preview` espera
 * índices ordenados para construir el multiproof, y el mismo orden hace que
 * dos selecciones iguales produzcan el mismo payload.
 *
 * El filtro por rango no es defensa paranoica: la selección sobrevive a un
 * refresco en `sessionStorage`, y una cartera más corta dejaría índices
 * apuntando a `undefined` que sumarían `NaN` al nominal.
 */
export function sanitizeSelection(indices: readonly unknown[], total: number): number[] {
  const valid = new Set<number>();

  for (const index of indices) {
    if (typeof index !== 'number') continue;
    if (!Number.isInteger(index)) continue;
    if (index < 0 || index >= total) continue;
    valid.add(index);
  }

  return [...valid].sort((a, b) => a - b);
}

/**
 * Lee la selección persistida en la sesión.
 *
 * Cualquier contenido que no sea un array de enteros se trata como «sin
 * selección»: `sessionStorage` es editable por quien abra las herramientas del
 * navegador, y una demo no puede caerse en el render por eso.
 */
export function parseStoredSelection(raw: string | null, total: number): number[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sanitizeSelection(parsed, total);
  } catch {
    return [];
  }
}

/** Suma en bigint el nominal de las cuotas seleccionadas. */
export function sumNominalMinor(
  receivables: readonly Receivable[],
  indices: readonly number[],
): bigint {
  return indices.reduce((total, index) => {
    const item = receivables[index];
    return item ? total + BigInt(item.amountMinor) : total;
  }, 0n);
}

/**
 * Convierte cuotas de la cartera en hojas canónicas del árbol.
 *
 * Es la misma conversión que hace `DisclosureService.toLeaves()` en la API, y
 * usa los helpers de `@app/merkle` —no una réplica local— porque la
 * codificación de la hoja es la frontera Web2/Web3: replicarla con otra
 * fórmula rompe la verificación on-chain sin dar un error legible.
 *
 * Sin `indices`, convierte la cartera entera.
 */
export function toReceivableLeaves(
  receivables: readonly Receivable[],
  salt: Hex,
  indices?: readonly number[],
): ReceivableLeaf[] {
  const positions = indices ?? receivables.map((_, index) => index);

  return positions.flatMap((index) => {
    const item = receivables[index];
    if (!item) return [];

    return [
      {
        debtorHash: hashDebtor(item.debtorTaxId, salt),
        amountMinor: BigInt(item.amountMinor),
        dueDate: toDueDate(item.dueDate),
        currency: item.currency as CurrencyCode,
        docHash: item.docHash as Hex,
      },
    ];
  });
}

/** Posiciones de todas las cuotas de un deudor, para seleccionarlo de una vez. */
export function debtorIndices(receivables: readonly Receivable[], debtorLabel: string): number[] {
  return receivables.reduce<number[]>((positions, item, index) => {
    if (item.debtorLabel === debtorLabel) positions.push(index);
    return positions;
  }, []);
}
