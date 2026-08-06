import type { CookieOptions } from 'express';

/** Nombre de la cookie httpOnly de sesión. */
export const SESSION_COOKIE = 'app_session';

/** Convierte '7d' / '12h' / '30m' / '3600' (s) en milisegundos para maxAge. */
export function expiresToMs(value: string): number {
  const m = /^(\d+)([dhms])?$/.exec(value.trim());
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1] ?? '7', 10);
  const unit = m[2] ?? 's';
  const mult = { d: 86400, h: 3600, m: 60, s: 1 }[unit] ?? 1;
  return n * mult * 1000;
}

/**
 * Opciones de la cookie de sesión. En producción detrás de Traefik/Coolify:
 * COOKIE_SECURE=true (y main.ts ya setea trust proxy). Para compartir entre
 * subdominios: COOKIE_DOMAIN=.tudominio.com. Dominios distintos: SAMESITE=none.
 */
export function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') ?? 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
    maxAge: expiresToMs(process.env.JWT_EXPIRES_IN ?? '7d'),
  };
}
