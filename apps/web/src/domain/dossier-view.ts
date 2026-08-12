import { bytes32Schema } from '@app/contracts';

/**
 * Resolución del expediente activo: la query gana, lo recordado es el respaldo.
 *
 * Aquí vivía además `DOSSIER_ASSET_STORAGE_KEY`, una clave de `sessionStorage`
 * sin ámbito de usuario que `/expediente` y `/prestamo` copiaban por su cuenta.
 * Convivía con la clave por usuario del proveedor, así que dos pantallas del
 * mismo panel podían recordar expedientes distintos. La única clave es ahora
 * `operationalStorageKeys(userId).asset`, que escribe solo el proveedor.
 */
export function resolveDossierAssetId(search: string, remembered: string | null): string | null {
  const requested = new URLSearchParams(search).get('assetId');
  return requested !== null ? requested : remembered;
}

export function validateDossierAssetId(value: string): string | null {
  const result = bytes32Schema.safeParse(value.trim());
  return result.success ? null : result.error.issues[0]?.message || 'Invalid asset ID.';
}

function httpStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

export function dossierErrorMessage(error: unknown): string {
  const status = httpStatus(error);
  if (status === 403) return 'You do not have permission to view this asset.';
  if (status === 404) return 'Asset not found.';
  return error instanceof Error ? error.message : 'Asset request failed.';
}

/**
 * El 404 es «no lo ves», no «se rompió».
 *
 * La API responde 404 —nunca 403— cuando el expediente es de otra cuenta,
 * justamente para no revelar que existe. Por eso el panel no puede quedarse en
 * «Asset not found»: solo el listado sabe cuántos expedientes sí se ven, y esa
 * cuenta es lo que separa «no existe» de «no es tuyo».
 */
export function isAssetNotFound(error: unknown): boolean {
  return httpStatus(error) === 404;
}

export function formatDossierDate(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(
    new Date(value),
  );
}
