export interface OperationalStorageKeys {
  asset: string;
  selection: string;
}

export function operationalStorageKeys(userId: string): OperationalStorageKeys {
  return {
    asset: `pai:${userId}:disclosure-asset-id`,
    selection: `pai:${userId}:disclosure-selection`,
  };
}

export function resetProgressForAssetChange(previous: string | null, next: string | null) {
  if (previous === next) return null;
  return { selection: [] as number[], resetPreview: true, computedSelectionKey: null };
}

export function shouldCompleteBorrowingBase(resultRows: number, revealedRows: number): boolean {
  return resultRows > 0 && revealedRows >= resultRows;
}

export function clearOperationalStorage(
  storage: Pick<Storage, 'removeItem'>,
  userId: string,
): void {
  const keys = operationalStorageKeys(userId);
  storage.removeItem(keys.asset);
  storage.removeItem(keys.selection);
}
