import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { UserRole } from '@app/contracts';
import {
  buildAuthUser,
  buildUnreachableChainStatus,
  mockApi,
  mockInjectedWallet,
  mockPublicVerification,
  VERIFY_ASSET_ID,
} from './fixtures/api-mock';

/**
 * Recorrido de las once rutas del panel.
 *
 * Comprueba dos cosas por pantalla: que existe un `<h1>` con el título del
 * handoff —la maqueta usa un `<span>` y deja el documento sin punto de
 * entrada— y que ninguna escribe en la consola de errores.
 *
 * `/verify/:code` se visita **sin `mockApi`**: si la página necesitara sesión,
 * `ProtectedRoute` la mandaría a `/login` y la aserción del `<h1>` fallaría.
 * Esa es la prueba de que el enlace público lo es de verdad.
 */

const SCREENSHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '__screenshots__');

/** Las once pantallas con el `<h1>` que fija `docs/design/README.md`. */
const PANEL_ROUTES: ReadonlyArray<{ path: string; heading: string; role?: UserRole }> = [
  // `/panel` y no `/`: la raiz la ocupa la landing publica.
  { path: '/panel', heading: 'Resumen del expediente' },
  { path: '/expediente/nuevo', heading: 'Crear el expediente' },
  { path: '/expediente', heading: 'Expediente y árbol de Merkle' },
  { path: '/evidencias', heading: 'Evidencias' },
  { path: '/divulgacion', heading: 'Divulgación selectiva' },
  { path: '/borrowing-base', heading: 'Recómputo del borrowing base' },
  { path: '/certificacion', heading: 'Cola de atestaciones', role: UserRole.CERTIFIER },
  { path: '/prestamo', heading: 'Originación y fondeo' },
  { path: '/historial', heading: 'Historial crediticio on-chain' },
  { path: '/actividad', heading: 'Actividad on-chain' },
  { path: '/flujo', heading: 'Modo presentación' },
];

/**
 * Recolecta los errores de consola de la página.
 *
 * Se descarta el favicon: `index.html` no declara ninguno, el navegador lo
 * pide igual y el 404 del dev server no dice nada sobre la aplicación.
 */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (/favicon/.test(message.location().url)) return;
    errors.push(message.text());
  });

  page.on('pageerror', (error) => errors.push(error.message));

  return errors;
}

test.describe('rutas del panel', () => {
  for (const route of PANEL_ROUTES) {
    test(`${route.path} carga con su h1 y sin errores de consola`, async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await mockApi(page, { user: buildAuthUser({ role: route.role ?? UserRole.PYME }) });
      await page.goto(route.path);

      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('/disclosure redirige a /divulgacion sin romper el enlace antiguo', async ({ page }) => {
    await mockApi(page, { user: buildAuthUser() });
    await page.goto('/disclosure');

    await expect(page).toHaveURL(/\/divulgacion$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Divulgación selectiva' }),
    ).toBeVisible();
  });

  test('la navegación es una lista con el ítem activo marcado', async ({ page }) => {
    await mockApi(page, { user: buildAuthUser() });
    await page.goto('/evidencias');

    const nav = page.getByRole('navigation', { name: 'Secciones del panel' });
    await expect(nav.getByRole('link', { name: 'Evidencias' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Y solo uno: `aria-current` en dos ítems dejaría al lector sin saber dónde está.
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  });

  test('conecta MetaMask y corrige la red desde la cabecera', async ({ page }) => {
    await mockInjectedWallet(page);
    await mockApi(page, { user: buildAuthUser() });
    await page.goto('/panel');

    const connect = page.getByRole('button', { name: 'Conectar MetaMask' });
    await expect(connect).toBeVisible();
    await expect(connect).toBeEnabled();
    expect(
      await page.evaluate(
        () => (window as typeof window & { __walletCalls: string[] }).__walletCalls,
      ),
    ).not.toContain('eth_requestAccounts');

    await connect.click();
    const switchNetwork = page.getByRole('button', {
      name: 'Cambiar MetaMask a Arbitrum Sepolia',
    });
    await expect(switchNetwork).toBeVisible();
    await switchNetwork.click();

    await expect(page.getByLabel(/MetaMask conectada:/)).toContainText('0x4242…4242');
  });

  test('filtra por rol y bloquea una URL protegida de otra persona', async ({ page }) => {
    await mockApi(page, { user: buildAuthUser({ role: UserRole.CERTIFIER }) });
    await page.goto('/certificacion');

    const nav = page.getByRole('navigation', { name: 'Secciones del panel' });
    await expect(nav.getByRole('link', { name: 'Cola de atestaciones' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Evidencias' })).toHaveCount(0);

    await page.goto('/evidencias');
    await expect(page.getByRole('alert')).toContainText('Access denied');
  });

  test('/panel se captura para documentar el shell', async ({ page }) => {
    await mockApi(page, { user: buildAuthUser() });
    await page.goto('/panel');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Resumen del expediente' }),
    ).toBeVisible();
    // «Leídos desde el despliegue» solo contaba variables de entorno. Ahora el
    // pie afirma lo que confirmó: bytecode presente en las seis direcciones.
    await expect(page.getByText('6 de 6 contratos verificados on-chain.')).toBeVisible();
    const timeline = page.getByRole('navigation', { name: 'Progreso operativo' });
    await expect(timeline).toBeVisible();
    await expect(timeline.getByText('Evidencias', { exact: true })).toBeVisible();
    await expect(timeline.locator('[aria-current="step"]')).toHaveCount(0);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'overview.png'), fullPage: true });
  });

  test('la etapa actual usa semántica de paso y no acredita etapas previas', async ({ page }) => {
    await mockApi(page, { user: buildAuthUser() });
    await page.goto('/prestamo');

    const timeline = page.getByRole('navigation', { name: 'Progreso operativo' });
    await expect(timeline.getByRole('link', { name: /Préstamo \/ fondeo/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
    await expect(timeline.getByText('Completado y comprobado')).toHaveCount(0);
  });

  test('el RPC caído se declara sin afirmar contratos confirmados', async ({ page }) => {
    await mockApi(page, { user: buildAuthUser(), chainStatus: buildUnreachableChainStatus() });
    await page.goto('/panel');

    await expect(
      page.getByText('RPC sin responder: el panel no lee la cadena ahora.'),
    ).toBeVisible();
    await expect(
      page.getByText('6 contratos configurados, sin confirmar contra la red.'),
    ).toBeVisible();
  });
});

test.describe('landing pública', () => {
  test('/ carga sin sesión, sin shell del panel y sin errores de consola', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    // Sin `mockApi`: la landing es lo primero que ve alguien sin cuenta.
    await page.goto('/');

    await expect(
      page.getByRole('heading', { level: 1, name: /Tu banco no tiene que creerte/ }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Secciones del panel' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Entrar al panel' }).first()).toHaveAttribute(
      'href',
      '/login',
    );

    expect(errors).toEqual([]);

    // `toBeVisible()` no mira opacidad: resuelve apenas el H1 tiene tamaño,
    // sin esperar el reveal por scroll. En el peor caso (una sección que el
    // observer no llegó a interceptar) `useReveal` tiene una red de
    // seguridad de 1800ms + 700ms de transición — sin esperar eso, la
    // captura agarra secciones a mitad de camino.
    await page.waitForTimeout(2800);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'landing.png'), fullPage: true });
  });

  test('el CTA de verificación pública lleva a la entrada neutral, no a un error', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Ver verificación pública, sin cuenta' }).click();

    await expect(page).toHaveURL(/\/verify$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Verificación pública' }),
    ).toBeVisible();
    // La pantalla exige un assetId bytes32: mandar un código legible desde la
    // landing dejaba al visitante en una alerta de validación.
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('tocar una foto del carrusel abre su detalle en un modal', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');

    const firstPhoto = page.getByRole('button', { name: /Un taller que factura/ }).first();
    // El carrusel nunca deja de moverse salvo que algo lo pause, y `hover()`
    // exige que el blanco ya esté quieto antes de moverle el mouse encima —
    // un candado que un mouse real no tiene, porque cruza el blanco en
    // movimiento y ahí recién dispara `mouseenter`. `focus()` no depende de
    // coordenadas: dispara `onFocus` (que pausa el carrusel) sin ese candado,
    // y para cuando llega el `click()` ya está quieto.
    await firstPhoto.focus();
    await firstPhoto.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Del cuaderno al expediente verificable' }),
    ).toBeVisible();
    await expect(dialog.getByText(/huella criptográfica única/)).toBeVisible();

    // Cerrar con Escape también debe funcionar (accesibilidad de Radix).
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});

test.describe('verificación pública', () => {
  test('/verify ofrece una entrada neutral sin inventar un activo', async ({ page }) => {
    await page.goto('/verify');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Verificación pública' }),
    ).toBeVisible();
    await expect(page.getByLabel('Asset ID')).toHaveValue('');
    await expect(page.getByText(VERIFY_ASSET_ID)).toHaveCount(0);
  });

  test('/verify/:code carga datos públicos sin sesión', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await mockPublicVerification(page);
    await page.goto(`/verify/${VERIFY_ASSET_ID}`);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Verificación pública' }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/verify/${VERIFY_ASSET_ID}$`));
    await expect(page.getByText('Attested')).toBeVisible();
    await expect(page.getByText('Válido')).toBeVisible();
    await expect(page.getByText('REVENUE_VERIFIED')).toBeVisible();

    // Y no arrastra el shell del panel: ni sidebar ni identidad de sesión.
    await expect(page.getByRole('navigation', { name: 'Secciones del panel' })).toHaveCount(0);

    // La marca tiene que sacar de vuelta a la landing: antes era un <span>
    // fijo, sin enlace, que no hacía nada al tocarlo.
    await expect(page.getByRole('link', { name: /^PAI/ })).toHaveAttribute('href', '/');

    expect(errors).toEqual([]);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'verify.png'), fullPage: true });
  });

  test('rechaza un identificador que no sea bytes32 minúsculo', async ({ page }) => {
    await page.goto('/verify/NOT-A-BYTES32');
    await expect(page.getByRole('alert')).toContainText('bytes32 hexadecimal en minúsculas');
  });

  // Aqui vivia un test de la simulacion de cinco pasos etiquetada como
  // «sin contrato desplegado todavia». Se elimina con ella: la pagina ahora
  // consulta datos publicos reales a traves de `verification.api`, y mantener
  // el test obligaria a conservar la simulacion que lo reemplazo.
});
