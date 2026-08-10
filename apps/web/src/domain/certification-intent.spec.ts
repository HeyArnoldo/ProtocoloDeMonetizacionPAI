import { describe, expect, it } from 'vitest';
import { buildCertificationIntent } from './certification-intent';

const ASSET_ID = `0x${'1'.repeat(64)}`;
const HASH = `0x${'2'.repeat(64)}`;

describe('certification intent input', () => {
  it('builds attest calldata input for every supported kind', () => {
    for (const kind of [0, 1, 2] as const) {
      expect(buildCertificationIntent('attest', ASSET_ID, kind, HASH)).toEqual({
        assetId: ASSET_ID,
        kind,
        certificateHash: HASH,
      });
    }
  });

  it('builds revoke input without a certificate hash', () => {
    expect(buildCertificationIntent('revoke', ASSET_ID, 1, '')).toEqual({
      assetId: ASSET_ID,
      kind: 1,
    });
  });

  it('rejects malformed bytes32 values', () => {
    expect(() => buildCertificationIntent('attest', 'bad', 0, HASH)).toThrow(/asset ID/);
    expect(() => buildCertificationIntent('attest', ASSET_ID, 0, 'bad')).toThrow(
      /certificate hash/,
    );
  });
});
