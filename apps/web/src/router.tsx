import { lazy } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from '@/components/protected-route';
import { AppLayout } from '@/layouts/app-layout';
import { PublicLayout } from '@/layouts/public-layout';

// Páginas lazy-loaded: cada una es un chunk separado.
const LoginPage = lazy(() => import('@/pages/login'));
const RegisterPage = lazy(() => import('@/pages/register'));
const OverviewPage = lazy(() => import('@/pages/overview'));
const DossierPage = lazy(() => import('@/pages/dossier'));
const EvidencePage = lazy(() => import('@/pages/evidence'));
const DisclosurePage = lazy(() => import('@/pages/disclosure'));
const BorrowingBasePage = lazy(() => import('@/pages/borrowing-base'));
const CertificationPage = lazy(() => import('@/pages/certification'));
const LoanPage = lazy(() => import('@/pages/loan'));
const CreditHistoryPage = lazy(() => import('@/pages/credit-history'));
const ActivityPage = lazy(() => import('@/pages/activity'));
const VerifyPage = lazy(() => import('@/pages/verify'));

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },

  // La verificación pública va fuera de `ProtectedRoute` **y** fuera de
  // `AppLayout`: su razón de ser es que un tercero sin cuenta pueda abrirla.
  // Si dependiera de la sesión, el enlace no serviría para nada.
  {
    element: <PublicLayout />,
    children: [{ path: '/verify/:code', element: <VerifyPage /> }],
  },

  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <OverviewPage /> },
          { path: '/expediente', element: <DossierPage /> },
          { path: '/evidencias', element: <EvidencePage /> },
          { path: '/divulgacion', element: <DisclosurePage /> },
          { path: '/borrowing-base', element: <BorrowingBasePage /> },
          { path: '/certificacion', element: <CertificationPage /> },
          { path: '/prestamo', element: <LoanPage /> },
          { path: '/historial', element: <CreditHistoryPage /> },
          { path: '/actividad', element: <ActivityPage /> },

          // La divulgación selectiva vivía en `/disclosure` antes de que las
          // rutas se fijaran en español. El redirect evita romper los enlaces
          // ya compartidos.
          { path: '/disclosure', element: <Navigate to="/divulgacion" replace /> },
        ],
      },
    ],
  },
]);
