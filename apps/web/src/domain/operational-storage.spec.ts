import { describe, expect, it } from 'vitest';
import {
  operationalStorageKeys,
  clearOperationalStorage,
  resetProgressForAssetChange,
  shouldCompleteBorrowingBase,
} from './operational-storage';

describe('operational progress scoping', () => {
  it('namespaces persisted state by authenticated user', () => {
    expect(operationalStorageKeys('user-a')).not.toEqual(operationalStorageKeys('user-b'));
  });

  it('clears only the authenticated account operational keys on logout', () => {
    const removed: string[] = [];
    clearOperationalStorage({ removeItem: (key) => removed.push(key) }, 'user-a');
    expect(removed).toEqual(Object.values(operationalStorageKeys('user-a')));
    expect(removed).not.toEqual(Object.values(operationalStorageKeys('user-b')));
  });

  it('clears selection, proof, and borrowing-base progress on asset switch', () => {
    expect(resetProgressForAssetChange('asset-a', 'asset-b')).toEqual({
      selection: [],
      resetPreview: true,
      computedSelectionKey: null,
    });
    expect(resetProgressForAssetChange('asset-a', 'asset-a')).toBeNull();
  });

  it('completes borrowing base only when the successful result is fully present', () => {
    expect(shouldCompleteBorrowingBase(7, 1)).toBe(false);
    expect(shouldCompleteBorrowingBase(7, 7)).toBe(true);
    expect(shouldCompleteBorrowingBase(0, 0)).toBe(false);
  });
});
