// Flags de auth evaluados al cargar el módulo (antes del bootstrap de Nest),
// por eso main.ts y typeorm.config.ts importan load-env como PRIMERA línea.

/** Google OAuth se activa solo si hay credenciales configuradas. */
export const isGoogleEnabled = (): boolean =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** Login local (email + password). Default: activado. */
export const isLocalAuthEnabled = (): boolean =>
  (process.env.AUTH_LOCAL_ENABLED ?? 'true') !== 'false';
