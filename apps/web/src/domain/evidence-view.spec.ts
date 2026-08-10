import { describe, expect, it } from 'vitest';
import {
  MAX_EVIDENCE_BYTES,
  evidenceFileError,
  formatEvidenceDate,
  formatFileSize,
} from './evidence-view';

describe('evidenceFileError', () => {
  it('accepts a non-empty file up to the API limit', () => {
    expect(evidenceFileError({ size: MAX_EVIDENCE_BYTES })).toBeNull();
  });

  it('rejects empty and oversized files before upload', () => {
    expect(evidenceFileError({ size: 0 })).toContain('empty');
    expect(evidenceFileError({ size: MAX_EVIDENCE_BYTES + 1 })).toContain('25 MiB');
  });
});

describe('evidence metadata formatting', () => {
  it('formats persisted byte counts without floating point noise', () => {
    expect(formatFileSize('2048')).toBe('2 KiB');
    expect(formatFileSize('18')).toBe('18 B');
  });

  it('formats an API timestamp for the Peruvian locale', () => {
    expect(formatEvidenceDate('2026-08-08T15:00:00.000Z')).toContain('2026');
  });
});
