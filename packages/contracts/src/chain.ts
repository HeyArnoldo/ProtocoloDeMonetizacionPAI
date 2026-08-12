import { z } from 'zod';

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const blockSchema = z.string().regex(/^\d+$/);

/** Contract of the deployment, with its explorer link when one is configured. */
export const chainContractSchema = z.object({
  name: z.enum([
    'assetRegistry',
    'certificationAttestor',
    'paiCertificate',
    'borrowingBaseEngine',
    'collateralVault',
    'mockUsdc',
  ]),
  address: addressSchema,
  explorerUrl: z.url().nullable(),
});

/**
 * Live state of the API's link to the chain.
 *
 * Three states, not two. `unreachable` exists on purpose: an API configured
 * against Arbitrum whose RPC is failing must not render as connected. A green
 * dot that survives a dead RPC is the worst kind of false data — it looks alive.
 */
export const chainStatusSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('offline'),
    network: z.literal('in-memory'),
    chainId: z.null(),
  }),
  z.object({
    status: z.literal('unreachable'),
    network: z.literal('arbitrum'),
    chainId: z.number().int().positive(),
    deploymentBlock: blockSchema.nullable(),
    contracts: z.array(chainContractSchema),
    explorerBaseUrl: z.url().nullable(),
    reason: z.string().min(1),
  }),
  z.object({
    status: z.literal('live'),
    network: z.literal('arbitrum'),
    chainId: z.number().int().positive(),
    /** Highest block the RPC considers safe. Every read is anchored here. */
    safeBlock: blockSchema,
    headBlock: blockSchema,
    deploymentBlock: blockSchema.nullable(),
    contracts: z.array(chainContractSchema),
    explorerBaseUrl: z.url().nullable(),
  }),
]);

export type ChainContractRef = z.infer<typeof chainContractSchema>;
export type ChainStatusResponse = z.infer<typeof chainStatusSchema>;
