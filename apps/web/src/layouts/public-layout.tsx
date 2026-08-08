import { Link, Outlet } from 'react-router-dom';

/**
 * Shell mínimo de las páginas públicas.
 *
 * La maqueta renderiza `/verify/:code` dentro del panel, con sidebar y la
 * identidad de la sesión arriba a la derecha. En producción esa página es lo
 * contrario: un enlace que un banco abre sin cuenta, sin sesión y sin
 * pedirle nada a la plataforma. Por eso queda fuera de `ProtectedRoute` y
 * fuera de `AppLayout`, y su cabecera solo lleva la marca.
 */
export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-ink-800 flex-none border-b px-[26px] py-[13px]">
        <Link to="/" className="flex items-baseline gap-[7px]">
          <span className="text-[19px] font-medium tracking-[-0.02em]">PAI</span>
          <span className="mono text-primary text-[10px]">× ARBITRUM</span>
        </Link>
      </header>
      <main className="flex-1 px-[26px] pt-6 pb-[60px]">
        <Outlet />
      </main>
    </div>
  );
}
