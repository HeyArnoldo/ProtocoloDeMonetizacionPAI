import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Envoltorio de login/register.
 *
 * Antes era una tarjeta sola sobre negro liso, sin marca y sin forma de
 * volver — un callejón sin salida si alguien entró por error o se
 * arrepiente. Reusa el mismo glow de marca que el Hero de la landing (más
 * tenue) para que no se sienta como una página aparte del resto del sitio.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-4">
      <div
        aria-hidden="true"
        className="bg-brand-600/15 absolute top-1/3 left-1/2 -z-10 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[130px]"
      />

      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground absolute top-6 left-6 inline-flex items-center gap-1.5 text-[13px] transition-colors"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Volver
      </Link>

      <Link to="/" className="mb-8 flex items-baseline gap-[7px]">
        <span className="text-[19px] font-medium tracking-[-0.02em]">PAI</span>
        <span className="mono text-primary text-[10px]">× ARBITRUM</span>
      </Link>

      {children}
    </div>
  );
}
