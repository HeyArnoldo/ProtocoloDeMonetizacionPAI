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

/**
 * Estado de registro derivable **sin consultar la cadena**.
 *
 * El listado se pinta con una sola consulta a Postgres: pedirle a la cadena el
 * estado real de cada fila convertiría abrir una lista de veinte expedientes en
 * veinte llamadas RPC. Lo que la base sí sabe con certeza es si ya se emitió la
 * transacción y si se confirmó, y eso alcanza para elegir cuál abrir.
 */
export const ASSET_REGISTRATION_STATES = ['draft', 'submitted', 'registered'] as const;
export type AssetRegistrationState = (typeof ASSET_REGISTRATION_STATES)[number];

/**
 * Los hashes del listado se validan sin exigir minúsculas.
 *
 * `bytes32Schema` sí las exige porque gobierna lo que *entra* al dominio. Aquí
 * el `registrationTxHash` lo devuelve el adaptador de cadena y viene como venga:
 * atarlo a minúsculas haría que el navegador rechazara una lista correcta.
 */
const listHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'must be a hexadecimal bytes32');

export const assetListItemSchema = z.object({
  id: listHashSchema,
  createdAt: z.iso.datetime(),
  merkleRoot: listHashSchema,
  controller: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  registrationConfirmed: z.boolean(),
  registrationTxHash: listHashSchema.nullable(),
  registrationBlockNumber: z.number().int().nonnegative().nullable(),
  registrationState: z.enum(ASSET_REGISTRATION_STATES),
  receivableCount: z.number().int().nonnegative(),
  /** Suma en unidades menores. String para no perder precisión (numeric 78,0). */
  totalAmountMinor: z.string().regex(/^\d+$/),
  /**
   * Distingue «lo creé yo» de «lo veo porque soy ADMIN».
   * No expone quién es el creador: solo si el que mira lo es.
   */
  ownedByRequester: z.boolean(),
});
export type AssetListItemResponse = z.infer<typeof assetListItemSchema>;

export const assetListSchema = z.array(assetListItemSchema);
export type AssetListResponse = AssetListItemResponse[];

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
