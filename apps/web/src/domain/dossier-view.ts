import { bytes32Schema } from '@app/contracts';

export const DOSSIER_ASSET_STORAGE_KEY = 'pai:disclosure-asset-id';

export function resolveDossierAssetId(search: string, remembered: string | null): string | null {
  const requested = new URLSearchParams(search).get('assetId');
  return requested !== null ? requested : remembered;
}

export function validateDossierAssetId(value: string): string | null {
  const result = bytes32Schema.safeParse(value.trim());
  return result.success ? null : result.error.issues[0]?.message || 'Invalid asset ID.';
}

export function dossierErrorMessage(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 403) return 'You do not have permission to view this asset.';
  if (status === 404) return 'Asset not found.';
  return error instanceof Error ? error.message : 'Asset request failed.';
}

export function formatDossierDate(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(
    new Date(value),
  );
}
