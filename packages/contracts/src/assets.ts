import { z } from 'zod';
import { CURRENCY_CODES } from './disclosure';

export const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-f]{64}$/, 'must be a lowercase hexadecimal bytes32');
export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-f]{40}$/, 'must be a lowercase hexadecimal address');
export const amountMinorSchema = z
  .string()
  .regex(/^[1-9]\d*$/, 'must be a positive integer in minor units');

export const createReceivableSchema = z.object({
  evidenceId: z.uuid(),
  debtorTaxId: z.string().trim().min(1),
  debtorLabel: z.string().trim().min(1).max(120),
  amountMinor: amountMinorSchema,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must use YYYY-MM-DD'),
  currency: z.union([z.literal(CURRENCY_CODES.USD), z.literal(CURRENCY_CODES.PEN)]),
});
export type CreateReceivableInput = z.infer<typeof createReceivableSchema>;

export const createAssetSchema = z.object({
  controller: addressSchema,
  receivables: z.array(createReceivableSchema).min(1),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export interface AssetReceivableResponse extends CreateReceivableInput {
  id: string;
  position: number;
  docHash: string;
}

export interface AssetResponse {
  id: string;
  ownerIdHash: string;
  controller: string;
  merkleRoot: string;
  registrationTxHash: string | null;
  registrationConfirmed: boolean;
  registrationBlockNumber: number | null;
  receivables: AssetReceivableResponse[];
  createdAt: string;
}

const chainAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const chainIntegerSchema = z.string().regex(/^\d+$/);
export const chainAssetSnapshotSchema = z.object({
  blockNumber: chainIntegerSchema.nullable(),
  registry: z.object({
    assetId: bytes32Schema,
    merkleRoot: bytes32Schema,
    ownerIdHash: bytes32Schema,
    controller: chainAddressSchema,
    registeredAt: z.iso.datetime(),
    status: z.enum([
      'Registered',
      'Attested',
      'Pledged',
      'Funded',
      'Repaid',
      'Revoked',
      'Defaulted',
      'Executed',
    ]),
  }),
  attestations: z.array(
    z.object({
      kind: z.enum(['REVENUE_VERIFIED', 'RIGHTS_ASSIGNABLE', 'SERVICE_CONTINUITY']),
      certifier: chainAddressSchema,
      certificateHash: bytes32Schema,
      attestedAt: z.iso.datetime(),
    }),
  ),
  certificate: z.discriminatedUnion('supported', [
    z.object({ supported: z.literal(false) }),
    z.object({
      supported: z.literal(true),
      valid: z.boolean(),
      owner: chainAddressSchema.nullable(),
      issuanceCount: chainIntegerSchema,
    }),
  ]),
  loan: z.discriminatedUnion('supported', [
    z.object({ supported: z.literal(false) }),
    z.object({
      supported: z.literal(true),
      value: z
        .object({
          borrower: chainAddressSchema,
          lender: chainAddressSchema,
          principal: chainIntegerSchema,
          dueAt: z.iso.datetime(),
          state: z.enum(['Pledged', 'Funded', 'Repaid', 'Defaulted']),
        })
        .nullable(),
    }),
  ]),
});
export type ChainAssetSnapshotResponse = z.infer<typeof chainAssetSnapshotSchema>;

export interface EvidenceResponse {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  sha256: string;
  createdAt: string;
}
