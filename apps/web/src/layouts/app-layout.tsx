import { useEffect, useId, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, X } from 'lucide-react';
import { useLogout, useMe } from '@/hooks/use-auth';
import { DisclosureSelectionProvider } from '@/context/disclosure-selection-provider';
import {
  canAccessPanelRoute,
  findPanelRoute,
  navigationForRole,
  roleLandingPath,
  type NavGroup,
} from '@/config/navigation';
import { ChainBadge } from '@/components/panel/chain-badge';
import { NetworkStatus } from '@/components/panel/network-status';
import { PageHeader } from '@/components/panel/page-header';
import { WalletControl } from '@/components/panel/wallet-control';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * Shell del panel: dos columnas a alto de viewport a partir de `lg`.
 *
 * El shell no scrollea nunca (`h-dvh overflow-hidden`); scrollean el sidebar y
 * el contenido por separado, cada uno con su barra. Así la cabecera y la marca
 * quedan fijas mientras se recorre una tabla de 216 filas.
 *
 * **Por qué `dvh` y no `vh`.** En un navegador móvil `100vh` mide el viewport
 * *sin* la barra de direcciones, que se retrae al scrollear: el shell queda
 * más alto que la ventana y la última franja de contenido cae debajo del
 * cromo del navegador. `dvh` sigue el viewport dinámico y elimina el recorte.
 *
 * **Por debajo de `lg` el sidebar es un cajón.** 244px fijos sobre 393px de
 * ancho dejarían 149px de contenido, así que la navegación se retira a un
 * `Sheet` y el contenido ocupa la pantalla entera. El cajón se monta solo
 * cuando está abierto, de modo que en móvil no hay dos `<nav>` con el mismo
 * nombre accesible compitiendo en el árbol.
 */
export function AppLayout() {
  const { data: user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const route = findPanelRoute(pathname);
  const navGroups = user ? navigationForRole(user.role) : [];
  const allowed = user ? canAccessPanelRoute(pathname, user.role) : false;

  const [menuOpen, setMenuOpen] = useState(false);

  // Navegar cierra el cajón. Radix no lo hace solo: para él, pulsar un enlace
  // del contenido es una interacción más y el diálogo sigue abierto sobre la
  // pantalla nueva.
  useEffect(() => setMenuOpen(false), [pathname]);

  const handleLogout = () => {
    logout.mutate(undefined, { onSuccess: () => navigate('/login') });
  };

  const initials = (user?.name ?? '')
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  if (user && pathname === '/' && !allowed) {
    return <Navigate to={roleLandingPath(user.role)} replace />;
  }

  return (
    // El proveedor envuelve el shell entero y no cada página: `/divulgacion` y
    // `/borrowing-base` comparten la misma selección, y montarlo aquí es lo
    // que hace que navegar entre las dos no la borre.
    <DisclosureSelectionProvider>
      <div className="flex h-dvh overflow-hidden">
        <aside
          data-testid="panel-sidebar"
          className="border-ink-800 hidden w-[244px] flex-none flex-col gap-[18px] overflow-y-auto border-r px-3.5 py-[18px] lg:flex"
        >
          <PanelBrand />

          <nav aria-label="Secciones del panel" className="flex flex-col gap-[18px]">
            {navGroups.map((group) => (
              <NavGroupList key={group.heading} group={group} />
            ))}
          </nav>

          <div className="mt-auto">
            <NetworkStatus />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="border-ink-800 flex-none border-b px-4 py-2.5 lg:px-[26px] lg:py-[13px]">
            <div className="flex items-center gap-2.5 lg:gap-3.5">
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger
                  aria-label="Abrir menú"
                  className="text-ink-400 hover:text-foreground -ml-2 grid size-11 flex-none place-items-center rounded-md lg:hidden"
                >
                  <Menu className="size-5" aria-hidden="true" />
                </SheetTrigger>

                {/* `showCloseButton={false}`: el que trae el primitivo mide 16px
                    y su texto asistivo está en inglés. Se sustituye por uno de
                    44px rotulado en español. */}
                <SheetContent
                  side="left"
                  showCloseButton={false}
                  className="flex w-[86vw] max-w-[300px] flex-col gap-[18px] overflow-y-auto px-3.5 py-[18px]"
                >
                  {/* Radix exige un título accesible en todo diálogo; aquí es la
                      marca la que lo aporta, sin duplicar texto en pantalla. */}
                  <SheetTitle className="sr-only">Navegación del panel</SheetTitle>

                  <div className="flex items-start justify-between gap-2">
                    <PanelBrand />
                    <SheetClose
                      aria-label="Cerrar menú"
                      className="text-ink-400 hover:text-foreground -mr-2 grid size-11 flex-none place-items-center rounded-md"
                    >
                      <X className="size-5" aria-hidden="true" />
                    </SheetClose>
                  </div>

                  <nav aria-label="Secciones del panel" className="flex flex-col gap-[18px]">
                    {navGroups.map((group) => (
                      <NavGroupList key={group.heading} group={group} />
                    ))}
                  </nav>

                  <div className="mt-auto">
                    <NetworkStatus />
                  </div>
                </SheetContent>
              </Sheet>

              <PageHeader
                className="min-w-0 flex-1"
                title={route?.title ?? 'Panel PAI'}
                subtitle={route?.subtitle ?? 'Protocolo de monetización de activos intangibles'}
                // En 393px el subtítulo compite con el título por la única
                // línea que hay: se retira, y el contexto que aporta ya está
                // en la etiqueta del ítem de navegación activo.
                subtitleClassName="hidden sm:block"
              >
                {/* La maqueta muestra aquí `PLEDGED` / `FUNDED`: eso es estado
                  de un activo concreto y esta cabecera es global. Lo que sí
                  aplica a toda pantalla es si la API está leyendo la cadena.
                  En móvil se retira: es contexto, no acción. */}
                <ChainBadge />

                <WalletControl />

                <DropdownMenu>
                  {/* Antes no había ninguna señal de que esto abriera algo —
                      parecía una etiqueta, no un botón. La flecha y el borde
                      que aparece al pasar el mouse son las dos pistas mínimas
                      de "esto es un menú, tocalo para salir". Se esconde en
                      móvil junto con el nombre: ahí el control ya es un
                      círculo chico, sin lugar para una tercera señal. */}
                  <DropdownMenuTrigger
                    aria-label="Cuenta y sesión"
                    className="bg-card hover:border-brand-600/50 flex min-h-11 min-w-11 flex-none items-center justify-center gap-2 rounded-full border border-transparent py-[5px] pr-2.5 pl-1.5 text-left transition-colors lg:min-h-0 lg:min-w-0 lg:justify-start"
                  >
                    <span className="bg-brand-800 text-brand-200 grid size-[22px] flex-none place-items-center rounded-full text-[10px]">
                      {initials || '··'}
                    </span>
                    {/* El nombre y la línea de la smart account se retiran en
                        móvil: la inicial ya identifica la sesión y el resto
                        está en el menú que abre este mismo control. */}
                    <span className="hidden flex-col leading-[1.25] lg:flex">
                      <span className="text-[11.5px]">{user?.name}</span>
                      {/* La maqueta pone aquí la dirección de la smart account.
                        No hay ERC-4337 todavía; se dice, no se simula. */}
                      <span className="mono text-muted-foreground text-[9.5px]">
                        sin smart account
                      </span>
                    </span>
                    <ChevronDown
                      className="text-muted-foreground hidden size-3.5 lg:block"
                      aria-hidden="true"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="text-muted-foreground font-normal">
                      {user?.email}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="size-4" />
                      Cerrar sesión
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </PageHeader>
            </div>
          </header>

          <div
            data-testid="panel-content"
            className="flex-1 overflow-y-auto px-4 pt-4 pb-10 lg:px-[26px] lg:pt-6 lg:pb-[60px]"
          >
            {allowed ? (
              <Outlet />
            ) : (
              <ForbiddenPanel landing={user ? roleLandingPath(user.role) : '/'} />
            )}
          </div>
        </main>
      </div>
    </DisclosureSelectionProvider>
  );
}

function ForbiddenPanel({ landing }: { landing: string }) {
  return (
    <div role="alert" className="border-border max-w-xl rounded-lg border p-5">
      <h2 className="text-lg font-medium">Access denied</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        Your authenticated role does not allow access to this panel page.
      </p>
      {/* `min-h-11` hasta `lg`, como el resto de destinos táctiles del shell:
          los 20px de la línea de texto quedan muy por debajo del mínimo de
          44px, y este enlace es la única salida de la pantalla de acceso
          denegado. */}
      <Link
        className="text-brand-300 mt-4 inline-flex min-h-11 items-center text-sm underline lg:min-h-0"
        to={landing}
      >
        Go to your role dashboard
      </Link>
    </div>
  );
}

/** La marca del producto, compartida por el sidebar fijo y el cajón móvil. */
function PanelBrand() {
  return (
    <Link to="/" className="flex min-h-11 flex-col justify-center gap-[3px] px-1.5 lg:min-h-0">
      <span className="flex items-baseline gap-[7px]">
        <span className="text-[19px] font-medium tracking-[-0.02em]">PAI</span>
        <span className="mono text-primary text-[10px]">× ARBITRUM</span>
      </span>
      <span className="text-muted-foreground text-[11px]">Protocolo de monetización</span>
    </Link>
  );
}

/**
 * Un grupo del sidebar.
 *
 * La maqueta usa `<button>` sueltos dentro de un `<div>`: no hay lista, no hay
 * landmark y el ítem activo solo se distingue por color. Aquí es una lista
 * dentro del `<nav>`, con enlaces reales —el panel tiene URLs— y
 * `aria-current="page"`, que `NavLink` aplica solo.
 *
 * Los ítems miden 44px de alto por debajo de `lg` y recuperan las medidas del
 * handoff a partir de ahí: en el sidebar de escritorio se apunta con el ratón.
 */
function NavGroupList({ group }: { group: NavGroup }) {
  const headingId = useId();

  return (
    <div className="flex flex-col gap-1">
      <p
        id={headingId}
        className="text-muted-foreground mb-1 ml-1.5 text-[10px] uppercase tracking-[0.1em]"
      >
        {group.heading}
      </p>
      <ul aria-labelledby={headingId} className="flex flex-col gap-1">
        {group.items.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center rounded-md px-[9px] py-[7px] text-[13px] transition-colors lg:block lg:min-h-0',
                  isActive
                    ? 'bg-brand-900 text-brand-200'
                    : 'text-ink-400 hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)]',
                )
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
