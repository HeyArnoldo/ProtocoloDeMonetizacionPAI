import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/services/auth.api';

const ME_KEY = ['auth', 'me'] as const;

/** Flags de auth del backend: el login se renderiza según esto. */
export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth', 'config'],
    queryFn: authApi.config,
    staleTime: Infinity,
  });
}

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: authApi.me,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => qc.clear(),
  });
}
