import { describe, expect, it } from 'vitest';
import {
  dossierErrorMessage,
  isAssetNotFound,
  resolveDossierAssetId,
  validateDossierAssetId,
} from './dossier-view';

const ASSET_ID = `0x${'a'.repeat(64)}`;

describe('dossier asset selection', () => {
  /**
   * La regla la aplica ahora `DisclosureSelectionProvider`, que es el único que
   * escribe la memoria de la sesión. Sigue probada aquí porque sigue siendo la
   * misma decisión de dominio: un enlace con `?assetId=` gana sobre lo
   * recordado, pase por donde pase.
   */
  it('prefers an explicit query value over remembered storage', () => {
    expect(resolveDossierAssetId('?assetId=query', 'stored')).toBe('query');
    expect(resolveDossierAssetId('', ASSET_ID)).toBe(ASSET_ID);
  });

  it('accepts only lowercase bytes32 identifiers', () => {
    expect(validateDossierAssetId(ASSET_ID)).toBeNull();
    expect(validateDossierAssetId('0xABC')).toMatch(/lowercase hexadecimal bytes32/);
  });

  it('maps ownership and absence responses without hiding other failures', () => {
    expect(dossierErrorMessage({ response: { status: 403 } })).toMatch(/permission/);
    expect(dossierErrorMessage({ response: { status: 404 } })).toMatch(/not found/);
    expect(dossierErrorMessage(new Error('offline'))).toBe('offline');
  });

  /** Solo el 404 se reinterpreta contra el listado; un 403 o una caída, no. */
  it('singles out the 404 the API returns for someone else assets', () => {
    expect(isAssetNotFound({ response: { status: 404 } })).toBe(true);
    expect(isAssetNotFound({ response: { status: 403 } })).toBe(false);
    expect(isAssetNotFound(new Error('offline'))).toBe(false);
  });
});
