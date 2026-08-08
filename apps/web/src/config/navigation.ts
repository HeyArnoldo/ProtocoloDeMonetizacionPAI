/**
 * Rutas del panel con su título y subtítulo.
 *
 * Es la única fuente de esos textos: el shell los usa para pintar el `<h1>` de
 * la cabecera y el sidebar los usa para las etiquetas de navegación. Tenerlos
 * dos veces garantizaría que en algún momento dejen de coincidir.
 *
 * Sobre los grupos: la maqueta agrupa la navegación en cuatro personas —PYME,
 * certificadores, fondo y operador— pero modela una sola identidad; no hay
 * conmutador de rol ni sesiones distintas detrás. Se conserva la agrupación
 * porque ordena la lectura del flujo de nueve días, no porque el panel cambie
 * de usuario. Cuando existan roles reales, cada grupo pasará a filtrarse por
 * permiso en lugar de mostrarse siempre completo.
 */

export interface PanelRoute {
  path: string;
  /** Etiqueta corta del sidebar. */
  label: string;
  /** Título de la pantalla: el `<h1>`. */
  title: string;
  subtitle: string;
  /** Authenticated personas allowed to mount this protected page. Omitted for public links. */
  roles?: readonly UserRole[];
}

export interface NavGroup {
  /** Persona del caso de referencia a la que pertenecen estas pantallas. */
  heading: string;
  items: PanelRoute[];
}

/** Código de ejemplo del enlace de verificación pública del sidebar. */
export const SAMPLE_VERIFY_CODE = 'PAI-8F3C-2026';

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'PYME · Contafácil SAC',
    items: [
      {
        path: '/',
        label: 'Resumen',
        title: 'Resumen del expediente',
        subtitle: 'Estado del expediente y de la máquina de estados on-chain',
        roles: [UserRole.PYME, UserRole.FUND, UserRole.ADMIN],
      },
      {
        path: '/expediente',
        label: 'Expediente',
        title: 'Expediente y árbol de Merkle',
        subtitle: 'AssetRegistry.sol · todas las cuotas bajo un root de 32 bytes',
        roles: [UserRole.PYME, UserRole.ADMIN],
      },
      {
        path: '/evidencias',
        label: 'Evidencias',
        title: 'Evidencias',
        subtitle: 'Documentos cifrados en storage · cero archivos on-chain',
        roles: [UserRole.PYME, UserRole.ADMIN],
      },
      {
        path: '/divulgacion',
        label: 'Divulgación selectiva',
        title: 'Divulgación selectiva',
        subtitle: 'Prueba sin revelar. Sin ZK: solo un árbol de Merkle',
        roles: [UserRole.PYME, UserRole.ADMIN],
      },
      {
        path: '/prestamo',
        label: 'Préstamo',
        title: 'Originación y fondeo',
        subtitle: 'CollateralVault.sol · USDC nativo de Circle',
        roles: [UserRole.PYME, UserRole.FUND, UserRole.ADMIN],
      },
      {
        path: '/historial',
        label: 'Historial crediticio',
        title: 'Historial crediticio on-chain',
        subtitle: 'Portable, verificable, propiedad de la PYME',
        roles: [UserRole.PYME, UserRole.ADMIN],
      },
    ],
  },
  {
    heading: 'Certificadores',
    items: [
      {
        path: '/certificacion',
        label: 'Cola de atestaciones',
        title: 'Cola de atestaciones',
        subtitle: 'CertificationAttestor.sol · CERTIFIER_ROLE',
        roles: [UserRole.CERTIFIER, UserRole.ADMIN],
      },
    ],
  },
  {
    heading: 'Fondo · Andes Capital',
    items: [
      {
        path: '/borrowing-base',
        label: 'Recómputo Stylus',
        title: 'Recómputo del borrowing base',
        subtitle: 'BorrowingBaseEngine · Stylus (Rust) · función view',
        roles: [UserRole.PYME, UserRole.ADMIN],
      },
    ],
  },
  {
    heading: 'Operador · público',
    items: [
      {
        path: '/actividad',
        label: 'Actividad on-chain',
        title: 'Actividad on-chain',
        subtitle: 'Eventos indexados por el Worker → Postgres',
        roles: [UserRole.PYME, UserRole.FUND, UserRole.ADMIN],
      },
      {
        path: `/verify/${SAMPLE_VERIFY_CODE}`,
        label: 'Página /verify/:code',
        title: 'Verificación pública',
        subtitle: 'Página abierta: cualquiera re-hashea y compara',
      },
    ],
  },
];

/** Metadatos de la pantalla pública, que no cuelga del shell del panel. */
export const VERIFY_ROUTE = {
  title: 'Verificación pública',
  subtitle: 'Página abierta: cualquiera re-hashea y compara',
} as const;

const ROUTES_BY_PATH = new Map(
  NAV_GROUPS.flatMap((group) => group.items).map((item) => [item.path, item]),
);

/** Resuelve el título de la cabecera a partir del `pathname` activo. */
export function findPanelRoute(pathname: string): PanelRoute | undefined {
  return ROUTES_BY_PATH.get(pathname);
}

export function canAccessPanelRoute(pathname: string, role: UserRole): boolean {
  const route = findPanelRoute(pathname === '/disclosure' ? '/divulgacion' : pathname);
  return Boolean(route && (!route.roles || route.roles.includes(role)));
}

export function navigationForRole(role: UserRole): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

export function roleLandingPath(role: UserRole): string {
  return role === UserRole.CERTIFIER ? '/certificacion' : '/';
}
import { UserRole } from '@app/contracts';
