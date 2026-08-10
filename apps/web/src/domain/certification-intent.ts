import { bytes32Schema } from '@app/contracts';

export const CERTIFICATION_KINDS = [
  { value: 0, key: 'REVENUE_VERIFIED', label: 'Revenue verified' },
  { value: 1, key: 'RIGHTS_ASSIGNABLE', label: 'Rights assignable' },
  { value: 2, key: 'SERVICE_CONTINUITY', label: 'Service continuity' },
] as const;
export type CertificationKind = (typeof CERTIFICATION_KINDS)[number]['value'];

export function buildCertificationIntent(
  action: 'attest' | 'revoke',
  assetId: string,
  kind: CertificationKind,
  certificateHash: string,
): Record<string, unknown> {
  if (!bytes32Schema.safeParse(assetId).success) throw new Error('Enter a valid asset ID.');
  if (action === 'revoke') return { assetId, kind };
  if (!bytes32Schema.safeParse(certificateHash).success) {
    throw new Error('Enter a valid certificate hash.');
  }
  return { assetId, kind, certificateHash };
}
