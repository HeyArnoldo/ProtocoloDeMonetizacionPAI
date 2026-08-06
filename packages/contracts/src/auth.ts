import { z } from 'zod';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export const registerSchema = z.object({
  email: z.email().max(160),
  password: z.string().min(8).max(72),
  name: z.string().min(1).max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().max(160),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.enum(UserRole),
  createdAt: z.string(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/** Respuesta de GET /api/auth/config — el login del frontend se renderiza según esto. */
export interface AuthConfig {
  localEnabled: boolean;
  googleEnabled: boolean;
}
