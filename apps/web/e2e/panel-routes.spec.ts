import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { buildAuthUser, mockApi } from './fixtures/api-mock';

/**
 * Recorrido de las diez rutas del panel.
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

/** Las diez pantallas con el `<h1>` que fija `docs/design/README.md`. */
const PANEL_ROUTES = [
  { path: '/panel', heading: 'Resumen del expediente' },
  { path: '/expediente', heading: 'Expediente y árbol de Merkle' },
  { path: '/evidencias', heading: 'Evidencias' },
  { path: '/divulgacion', heading: 'Divulgación selectiva' },
  { path: '/borrowing-base', heading: 'Recómputo del borrowing base' },
  { path: '/certificacion', heading: 'Cola de atestaciones' },
  { path: '/prestamo', heading: 'Originación y fondeo' },
  { path: '/historial', heading: 'Historial crediticio on-chain' },
  { path: '/actividad', heading: 'Actividad on-chain' },
] as const;

const VERIFY_CODE = 'PAI-8F3C-2026';

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
      await mockApi(page, { user: buildAuthUser() });
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

  test('/panel se captura para documentar el shell', async ({ page }) => {
    await mockApi(page, { user: buildAuthUser() });
    await page.goto('/panel');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Resumen del expediente' }),
    ).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'overview.png'), fullPage: true });
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

  test('el CTA de verificación pública manda al código de ejemplo del sidebar', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Ver verificación pública, sin cuenta' }).click();

    await expect(page).toHaveURL(/\/verify\/PAI-8F3C-2026$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Verificación pública' }),
    ).toBeVisible();
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
  test('/verify/:code carga sin sesión y muestra el código de la URL', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    // Sin `mockApi`: no hay `GET /api/auth/me` que responda, y no hace falta.
    await page.goto(`/verify/${VERIFY_CODE}`);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Verificación pública' }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/verify/${VERIFY_CODE}$`));
    await expect(page.getByText(VERIFY_CODE).first()).toBeVisible();

    // Y no arrastra el shell del panel: ni sidebar ni identidad de sesión.
    await expect(page.getByRole('navigation', { name: 'Secciones del panel' })).toHaveCount(0);

    // La marca tiene que sacar de vuelta a la landing: antes era un <span>
    // fijo, sin enlace, que no hacía nada al tocarlo.
    await expect(page.getByRole('link', { name: /^PAI/ })).toHaveAttribute('href', '/');

    expect(errors).toEqual([]);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'verify.png'), fullPage: true });
  });

  test('el código de la URL es el que se verifica, no uno fijo', async ({ page }) => {
    await page.goto('/verify/OTRO-CODIGO-2027');

    await expect(page.getByText('OTRO-CODIGO-2027').first()).toBeVisible();
    await expect(page.getByText(VERIFY_CODE)).toHaveCount(0);
  });

  test('el botón «Verificar» corre la simulación etiquetada y termina en match', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`/verify/${VERIFY_CODE}`);

    // Tiene que quedar claro que no es una verificación real todavía.
    await expect(page.getByText('simulación — sin contrato desplegado todavía')).toBeVisible();

    const verifyButton = page.getByRole('button', { name: 'Verificar (simulación)' });
    await verifyButton.click();

    await expect(page.getByRole('button', { name: 'Verificando…' })).toBeDisabled();

    await expect(page.getByText(/Coincide con/)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Repetir simulación' })).toBeEnabled();

    expect(errors).toEqual([]);
  });
});
