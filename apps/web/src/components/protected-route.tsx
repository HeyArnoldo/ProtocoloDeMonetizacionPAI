import { Navigate, Outlet } from 'react-router-dom';
import { useMe } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';

/** Envuelve las rutas privadas: sin sesión válida redirige a /login. */
export function ProtectedRoute() {
  const { data: user, isLoading } = useMe();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-3 p-6">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
