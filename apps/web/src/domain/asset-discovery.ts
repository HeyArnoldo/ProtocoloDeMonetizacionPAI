import type { AssetListItemResponse, AssetListResponse } from '@app/contracts';
import { dossierErrorMessage, formatDossierDate } from '@/domain/dossier-view';
import { formatMinorUnits } from '@/domain/money';

/**
 * Descubrimiento de expedientes: qué puede afirmar la pantalla sobre el listado.
 *
 * **El problema de producto que resuelve.** Hasta ahora la única puerta al
 * expediente era pegar su identificador, y cualquier fallo terminaba en la
 * misma pantalla vacía. Eso hace indistinguibles dos hechos opuestos:
 *
 * - *lista vacía*: la API respondió y esta cuenta no tiene ningún expediente;
 * - *expediente invisible*: hay expedientes, pero el que se pidió no está entre
 *   los que esta cuenta puede ver —o el listado ni siquiera se pudo consultar—.
 *
 * Ante el primero se crea el primer expediente; ante el segundo se revisa el
 * identificador o se reintenta. Enseñar «no hay expedientes» cuando en realidad
 * el listado falló le dice a quien acaba de registrar uno que perdió el
 * trabajo, y esa es la mentira que este módulo hace imposible: `empty` solo se
 * alcanza desde una respuesta correcta.
 */
export type AssetDiscovery =
  /** El listado todavía viaja. */
  | { kind: 'loading' }
  /** El listado falló: la pantalla no afirma nada sobre cuántos hay. */
  | { kind: 'unavailable'; message: string }
  /** El listado respondió y no hay NINGUNO. */
  | { kind: 'empty' }
  /** Hay `total` expedientes visibles para quien mira. */
  | { kind: 'ready'; total: number };

/**
 * Qué se sabe del listado, a partir del estado de la query.
 *
 * El error se comprueba **antes** que los datos a propósito: una query con
 * error puede arrastrar datos viejos, y dejar que un array vacío obsoleto se
 * cuele como `empty` sería exactamente el fallo que este módulo previene.
 */
export function assetDiscovery(query: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: AssetListResponse | undefined;
}): AssetDiscovery {
  if (query.isPending) return { kind: 'loading' };
  if (query.isError) return { kind: 'unavailable', message: dossierErrorMessage(query.error) };
  // Sin error y sin datos no hay respuesta que interpretar. Tampoco es un
  // vacío: es un listado que no llegó.
  if (query.data === undefined) {
    return { kind: 'unavailable', message: 'El listado de expedientes no devolvió datos.' };
  }
  if (query.data.length === 0) return { kind: 'empty' };
  return { kind: 'ready', total: query.data.length };
}

/**
 * Mensaje cuando el id pedido no se resuelve, sabiendo cuántos SÍ se ven.
 *
 * Es la frase que separa «no existe» de «no lo ves». Solo con el listado en
 * mano puede la pantalla contar; sin él se limita a decir que no pudo
 * comprobarlo, porque afirmar la inexistencia de un expediente que no se pudo
 * buscar sería inventar un hecho.
 */
export function unresolvedAssetMessage(discovery: AssetDiscovery): string {
  if (discovery.kind === 'empty') {
    return 'Todavía no hay ningún expediente en esta cuenta. Crea el primero para empezar.';
  }

  if (discovery.kind === 'ready') {
    return discovery.total === 1
      ? 'Ese identificador no aparece en el único expediente que puedes ver.'
      : `Ese identificador no aparece entre los ${discovery.total} expedientes que puedes ver.`;
  }

  return 'No se pudo comprobar el listado de expedientes, así que no se sabe si este identificador es tuyo.';
}

/** Resumen de una fila del listado: cuotas, total y fecha de creación. */
export function formatAssetListEntry(item: AssetListItemResponse): string {
  const count = `${item.receivableCount} ${item.receivableCount === 1 ? 'cuota' : 'cuotas'}`;
  // El total va sin moneda: `GET /assets` suma todas las cuotas sin agruparla.
  return `${count} · ${formatMinorUnits(item.totalAmountMinor)} · ${formatDossierDate(item.createdAt)}`;
}
