export const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

export function evidenceFileError(file: { size: number }): string | null {
  if (file.size === 0) return 'The selected file is empty.';
  if (file.size > MAX_EVIDENCE_BYTES) return 'The file exceeds the 25 MiB API limit.';
  return null;
}

export function formatFileSize(value: string): string {
  const bytes = BigInt(value);
  if (bytes < 1024n) return `${bytes} B`;
  if (bytes < 1024n * 1024n) return `${bytes / 1024n} KiB`;
  return `${bytes / (1024n * 1024n)} MiB`;
}

export function formatEvidenceDate(value: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeZone: 'America/Lima',
  }).format(new Date(value));
}
