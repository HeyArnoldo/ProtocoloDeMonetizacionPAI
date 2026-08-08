import { z } from 'zod';

const boolFlag = (defaultValue: boolean) =>
  z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .default(defaultValue);

// Schema de variables de entorno. Se valida una sola vez al arrancar:
// si falta algo requerido, la API no levanta (mejor fallar temprano).
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1),

    API_PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
    FRONTEND_URL: z.string().min(1).default('http://localhost:5173'),

    AUTH_LOCAL_ENABLED: boolFlag(true),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
    JWT_EXPIRES_IN: z.string().min(1).default('7d'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

    COOKIE_SECURE: boolFlag(false),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.string().optional(),

    // Google OAuth: opcional. Si CLIENT_ID + CLIENT_SECRET existen, se activa solo.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CALLBACK_URL: z.string().optional(),

    // Admin inicial (seed). Ver README: con password = admin local; sin password = whitelist Google.
    ADMIN_EMAIL: z.string().optional(),
    ADMIN_PASSWORD: z.string().optional(),
    ADMIN_NAME: z.string().optional(),

    // Cadena. in-memory = la API funciona sin cadena (dev, tests, demo Web2).
    CHAIN_ADAPTER: z.enum(['in-memory', 'arbitrum']).default('in-memory'),
    CHAIN_ID: z.coerce.number().int().positive().default(421614),
    CHAIN_RPC_URL: z.string().optional(),
    ASSET_REGISTRY_ADDRESS: z.string().optional(),
    CERTIFICATION_ATTESTOR_ADDRESS: z.string().optional(),
    BORROWING_BASE_ENGINE_ADDRESS: z.string().optional(),
    // Wallet del backend: SOLO firma atestaciones EIP-712, nunca mueve dinero.
    ATTESTOR_PRIVATE_KEY: z.string().optional(),

    // Storage S3-compatible. `STORAGE_ENDPOINT` es opcional para AWS S3 y R2.
    STORAGE_ENDPOINT: z.string().url().optional(),
    STORAGE_REGION: z.string().min(1),
    STORAGE_BUCKET: z.string().min(1),
    STORAGE_ACCESS_KEY: z.string().min(1),
    STORAGE_SECRET_KEY: z.string().min(1),
    STORAGE_FORCE_PATH_STYLE: boolFlag(true),
  })
  .superRefine((env, ctx) => {
    // Con el adapter real, estas dejan de ser opcionales. Mejor no levantar que
    // levantar y fallar en la primera transacción del demo.
    if (env.CHAIN_ADAPTER !== 'arbitrum') return;

    for (const key of [
      'CHAIN_RPC_URL',
      'ASSET_REGISTRY_ADDRESS',
      'CERTIFICATION_ATTESTOR_ADDRESS',
      'ATTESTOR_PRIVATE_KEY',
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `es obligatoria cuando CHAIN_ADAPTER=arbitrum`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

// Usado por ConfigModule.forRoot({ validate })
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  return parsed.data;
}
