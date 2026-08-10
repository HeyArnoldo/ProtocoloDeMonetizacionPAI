import { describe, expect, it } from 'vitest';
import { dossierErrorMessage, resolveDossierAssetId, validateDossierAssetId } from './dossier-view';

const ASSET_ID = `0x${'a'.repeat(64)}`;

describe('dossier asset selection', () => {
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
});
