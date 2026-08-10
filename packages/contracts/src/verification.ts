import { z } from 'zod';
import { bytes32Schema, chainAssetSnapshotSchema } from './assets';

const publicSnapshot = chainAssetSnapshotSchema.omit({ loan: true, blockNumber: true });

export const publicVerificationSchema = z.discriminatedUnion('supported', [
  z.object({
    supported: z.literal(false),
    network: z.literal('in-memory'),
    chainId: z.null(),
    safeBlock: z.null(),
    explorer: z.null(),
  }),
  publicSnapshot.extend({
    supported: z.literal(true),
    network: z.literal('arbitrum'),
    chainId: z.number().int().positive(),
    safeBlock: z.string().regex(/^\d+$/),
    certificate: z.object({
      supported: z.literal(true),
      valid: z.boolean(),
      owner: z
        .string()
        .regex(/^0x[0-9a-fA-F]{40}$/)
        .nullable(),
      issuanceCount: z.string().regex(/^\d+$/),
    }),
    explorer: z
      .object({
        baseUrl: z.url(),
        registryUrl: z.url(),
        controllerUrl: z.url(),
      })
      .nullable(),
  }),
]);

export const verificationAssetIdSchema = bytes32Schema;
export type PublicVerificationResponse = z.infer<typeof publicVerificationSchema>;
