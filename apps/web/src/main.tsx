import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from '@/lib/query-client';
import { router } from '@/router';
import { Toaster } from '@/components/ui/sonner';
import { WalletProvider } from '@/context/wallet-provider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <Suspense fallback={null}>
          <RouterProvider router={router} />
        </Suspense>
      </WalletProvider>
      <Toaster richColors />
    </QueryClientProvider>
  </StrictMode>,
);
