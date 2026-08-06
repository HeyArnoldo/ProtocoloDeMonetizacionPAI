import { api } from '@/lib/api';
import type { AuthConfig, AuthUser, LoginInput, RegisterInput } from '@app/contracts';

export const authApi = {
  config: async (): Promise<AuthConfig> => (await api.get<AuthConfig>('/auth/config')).data,
  register: async (input: RegisterInput): Promise<AuthUser> =>
    (await api.post<AuthUser>('/auth/register', input)).data,
  login: async (input: LoginInput): Promise<AuthUser> =>
    (await api.post<AuthUser>('/auth/login', input)).data,
  me: async (): Promise<AuthUser> => (await api.get<AuthUser>('/auth/me')).data,
  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },
};

/** URL para iniciar el flujo de Google (redirect completo, no XHR). */
export const googleAuthUrl = `${import.meta.env.VITE_API_URL ?? ''}/api/auth/google`;
