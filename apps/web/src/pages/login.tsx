import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { loginSchema, type LoginInput } from '@app/contracts';
import { useAuthConfig, useLogin, useMe } from '@/hooks/use-auth';
import { googleAuthUrl } from '@/services/auth.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const { data: me } = useMe();
  const { data: config } = useAuthConfig();
  const login = useLogin();
  const navigate = useNavigate();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (me) return <Navigate to="/" replace />;

  const onSubmit = (input: LoginInput) => {
    login.mutate(input, {
      onSuccess: () => navigate('/'),
      onError: () => toast.error('Credenciales inválidas'),
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>Accede a tu cuenta</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {config?.localEnabled && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="tu@email.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contraseña</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={login.isPending}>
                  {login.isPending ? 'Entrando…' : 'Entrar'}
                </Button>
              </form>
            </Form>
          )}

          {config?.googleEnabled && (
            <Button variant="outline" className="w-full" asChild>
              <a href={googleAuthUrl}>Continuar con Google</a>
            </Button>
          )}

          {config?.localEnabled && (
            <p className="text-center text-sm text-muted-foreground">
              ¿Sin cuenta?{' '}
              <Link to="/register" className="underline">
                Regístrate
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
