import { z } from 'zod';

/**
 * Contratos de la divulgación selectiva.
 *
 * Es el momento del demo donde la empresa prueba que N cuotas pertenecen al
 * expediente certificado **sin revelar las demás ni sus contrapartes**.
 */

/** Códigos numéricos ISO-4217. El mismo criterio que la hoja del árbol. */
export const CURRENCY_CODES = { USD: 840, PEN: 604 } as const;

const hex32 = z.string().regex(/^0x[0-9a-f]{64}$/, 'debe ser un bytes32 hexadecimal en minúsculas');

/** Monto en unidades menores, como string decimal: JSON no serializa bigint. */
const amountMinor = z
  .string()
  .regex(/^[1-9]\d*$/, 'debe ser un entero positivo en unidades menores, sin decimales');

export const receivableSchema = z.object({
  /** Solo se usa para derivar el hash: nunca sale del servidor en claro. */
  debtorTaxId: z.string().trim().min(1, 'el identificador del deudor es obligatorio'),
  /** Etiqueta legible para la UI. No entra en la hoja ni en el hash. */
  debtorLabel: z.string().trim().min(1).max(120),
  amountMinor,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'se espera YYYY-MM-DD sin hora'),
  currency: z.union([z.literal(CURRENCY_CODES.USD), z.literal(CURRENCY_CODES.PEN)]),
  docHash: hex32,
});

export type Receivable = z.infer<typeof receivableSchema>;

export const samplePortfolioSchema = z.object({
  salt: hex32,
  receivables: z.array(receivableSchema),
});

export type SamplePortfolio = z.infer<typeof samplePortfolioSchema>;

export const disclosurePreviewRequestSchema = z.object({
  /** Salt del expediente. Se pide explícito para que el root sea estable. */
  salt: hex32,
  receivables: z.array(receivableSchema).min(1, 'el expediente necesita al menos una cuota'),
  disclosedIndices: z.array(z.number().int().nonnegative()).min(1, 'hay que divulgar al menos una'),
});

export type DisclosurePreviewRequest = z.infer<typeof disclosurePreviewRequestSchema>;

/** Hoja divulgada tal como viaja al prestamista. Sin identificadores en claro. */
export const disclosedLeafSchema = z.object({
  debtorHash: hex32,
  amountMinor: z.string(),
  dueDate: z.number().int(),
  currency: z.number().int(),
  docHash: hex32,
  leafHash: hex32,
});

export const disclosurePreviewResponseSchema = z.object({
  /** Lo único del expediente que se escribe on-chain. */
  root: hex32,
  totalLeaves: z.number().int(),
  disclosedCount: z.number().int(),
  hiddenCount: z.number().int(),
  /** Suma de lo divulgado, en unidades menores. */
  disclosedNominalMinor: z.string(),
  disclosedLeaves: z.array(disclosedLeafSchema),
  proof: z.array(hex32),
  proofFlags: z.array(z.boolean()),
  /** El servidor verifica su propio proof antes de devolverlo. */
  verified: z.boolean(),
});

export type DisclosurePreviewResponse = z.infer<typeof disclosurePreviewResponseSchema>;
