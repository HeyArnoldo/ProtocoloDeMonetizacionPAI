import { z } from 'zod';

export const chainContractNameSchema = z.enum([
  'assetRegistry',
  'certificationAttestor',
  'paiCertificate',
  'borrowingBaseEngine',
  'collateralVault',
  'mockUsdc',
]);

export const chainStatusReasonSchema = z.enum([
  'DEMO_MODE',
  'RPC_UNAVAILABLE',
  'WRONG_CHAIN',
  'CONTRACT_CODE_MISSING',
]);

export const chainStatusSchema = z.object({
  network: z.enum(['arbitrum-sepolia', 'in-memory']),
  reachable: z.boolean(),
  configured: z.boolean(),
  deployed: z.boolean(),
  expectedChainId: z.number().int().positive().nullable(),
  observedChainId: z.number().int().positive().nullable(),
  blockNumber: z.string().regex(/^\d+$/).nullable(),
  contractCount: z.number().int().min(0).max(6),
  expectedContractCount: z.literal(6),
  contracts: z
    .array(
      z.object({
        name: chainContractNameSchema,
        configured: z.boolean(),
        deployed: z.boolean(),
        explorerUrl: z.url().optional(),
      }),
    )
    .length(6),
  explorerUrl: z.url().optional(),
  reason: chainStatusReasonSchema.optional(),
});

export type ChainStatusResponse = z.infer<typeof chainStatusSchema>;
