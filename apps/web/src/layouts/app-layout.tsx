import { useId } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useLogout, useMe } from '@/hooks/use-auth';
import { DisclosureSelectionProvider } from '@/context/disclosure-selection-provider';
import { NAV_GROUPS, findPanelRoute, type NavGroup } from '@/config/navigation';
import { NetworkStatus } from '@/components/panel/network-status';
import { PageHeader } from '@/components/panel/page-header';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Shell del panel: dos columnas a alto de viewport.
 *
 * El shell no scrollea nunca (`h-screen overflow-hidden`); scrollean el
 * sidebar y el contenido por separado, cada uno con su barra. Así la cabecera
 * y la marca quedan fijas mientras se recorre una tabla de 216 filas.
 */
export function AppLayout() {
  const { data: user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const route = findPanelRoute(pathname);

  const handleLogout = () => {
    logout.mutate(undefined, { onSuccess: () => navigate('/login') });
  };

  const initials = (user?.name ?? '')
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    // El proveedor envuelve el shell entero y no cada página: `/divulgacion` y
    // `/borrowing-base` comparten la misma selección, y montarlo aquí es lo
    // que hace que navegar entre las dos no la borre.
    <DisclosureSelectionProvider>
      <div className="flex h-screen overflow-hidden">
        <aside className="border-ink-800 flex w-[244px] flex-none flex-col gap-[18px] overflow-y-auto border-r px-3.5 py-[18px]">
          <Link to="/" className="flex flex-col gap-[3px] px-1.5">
            <span className="flex items-baseline gap-[7px]">
              <span className="text-[19px] font-medium tracking-[-0.02em]">PAI</span>
              <span className="mono text-primary text-[10px]">× ARBITRUM</span>
            </span>
            <span className="text-muted-foreground text-[11px]">Protocolo de monetización</span>
          </Link>

          <nav aria-label="Secciones del panel" className="flex flex-col gap-[18px]">
            {NAV_GROUPS.map((group) => (
              <NavGroupList key={group.heading} group={group} />
            ))}
          </nav>

          <div className="mt-auto">
            <NetworkStatus />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="border-ink-800 flex-none border-b px-[26px] py-[13px]">
            <PageHeader
              title={route?.title ?? 'Panel PAI'}
              subtitle={route?.subtitle ?? 'Protocolo de monetización de activos intangibles'}
            >
              {/* La maqueta muestra aquí `PLEDGED` / `FUNDED`. El estado del
                activo vive en `AssetRegistry`, que no está desplegado: no hay
                de dónde leerlo, así que se declara en vez de inventarse. */}
              <Badge variant="outline" className="mono text-[10px] font-normal">
                sin estado on-chain
              </Badge>

              <DropdownMenu>
                <DropdownMenuTrigger className="bg-card flex items-center gap-2 rounded-full py-[5px] pr-2.5 pl-1.5 text-left">
                  <span className="bg-brand-800 text-brand-200 grid size-[22px] place-items-center rounded-full text-[10px]">
                    {initials || '··'}
                  </span>
                  <span className="flex flex-col leading-[1.25]">
                    <span className="text-[11.5px]">{user?.name}</span>
                    {/* La maqueta pone aquí la dirección de la smart account.
                      No hay ERC-4337 todavía; se dice, no se simula. */}
                    <span className="mono text-muted-foreground text-[9.5px]">
                      sin smart account
                    </span>
                  </span>
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
          </header>

          <div className="flex-1 overflow-y-auto px-[26px] pt-6 pb-[60px]">
            <Outlet />
          </div>
        </main>
      </div>
    </DisclosureSelectionProvider>
  );
}

/**
 * Un grupo del sidebar.
 *
 * La maqueta usa `<button>` sueltos dentro de un `<div>`: no hay lista, no hay
 * landmark y el ítem activo solo se distingue por color. Aquí es una lista
 * dentro del `<nav>`, con enlaces reales —el panel tiene URLs— y
 * `aria-current="page"`, que `NavLink` aplica solo.
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
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'block rounded-md px-[9px] py-[7px] text-[13px] transition-colors',
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
