import { Link, Outlet } from 'react-router-dom';

/**
 * Shell mínimo de las páginas públicas.
 *
 * La maqueta renderiza `/verify/:code` dentro del panel, con sidebar y la
 * identidad de la sesión arriba a la derecha. En producción esa página es lo
 * contrario: un enlace que un banco abre sin cuenta, sin sesión y sin
 * pedirle nada a la plataforma. Por eso queda fuera de `ProtectedRoute` y
 * fuera de `AppLayout`, y su cabecera solo lleva la marca.
 *
 * A diferencia del panel, este shell **sí** deja scrollear el documento: es la
 * pantalla que más se abre desde un teléfono y el scroll nativo es el que hace
 * que la barra del navegador se retraiga. `min-h-dvh` en vez de `min-h-screen`
 * por la misma razón que en el panel: `vh` no cuenta el cromo del navegador.
 */
export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-ink-800 flex-none border-b px-4 py-3 lg:px-[26px] lg:py-[13px]">
        {/* `min-h-11` (44px): el mínimo táctil del resto del panel
            (`PanelBrand`, los botones del cajón). Sin esto, en móvil el
            enlace mide 29px de alto — por debajo de lo que exige la
            accesibilidad táctil. */}
        <Link to="/" className="flex min-h-11 items-center gap-[7px] lg:min-h-0 lg:items-baseline">
          <span className="text-[19px] font-medium tracking-[-0.02em]">PAI</span>
          <span className="mono text-primary text-[10px]">× ARBITRUM</span>
        </Link>
      </header>
      <main className="flex-1 px-4 pt-5 pb-10 lg:px-[26px] lg:pt-6 lg:pb-[60px]">
        <Outlet />
      </main>
    </div>
  );
}
