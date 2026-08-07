import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { buildAuthUser, mockApi } from './fixtures/api-mock';

/**
 * Prueba de que el sistema visual Nocturne quedó realmente aplicado sobre los
 * primitivos de shadcn.
 *
 * Las aserciones son sobre estilos computados, no sobre capturas: un
 * screenshot documenta, pero no falla cuando un token deriva. Los valores
 * esperados salen de `docs/design/nocturne-styles.css` vía
 * `apps/web/src/index.css`.
 */

/** Tokens raíz de Nocturne, ya en el formato en que los devuelve el navegador. */
const NOCTURNE = {
  background: 'rgb(22, 24, 38)', // #161826
  surface: 'rgb(35, 37, 50)', // #232532
  brand: 'rgb(145, 132, 217)', // #9184d9
  mutedForeground: 'rgb(147, 151, 171)', // #9397ab — ink-500, 6.08:1 sobre el fondo
  /** ink-600: 4.08:1, no alcanza AA. No debe usarse como texto secundario. */
  inkBelowAa: 'rgb(117, 121, 140)', // #75798c
  transparent: 'rgba(0, 0, 0, 0)',
} as const;

/** Se ancla al archivo y no al cwd: la captura no debe depender de desde dónde se invoque. */
const SCREENSHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '__screenshots__');

/**
 * Resuelve una custom property a color real.
 *
 * Leerla con `getPropertyValue` puede devolver la cadena declarada
 * (`var(--ink-500)`); pintar un elemento sonda con ella fuerza la cascada y
 * devuelve el rgb() que el usuario ve de verdad.
 */
async function resolveTokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

test.describe('sistema visual Nocturne', () => {
  test('el login renderiza el formulario completo con los tokens de Nocturne', async ({ page }) => {
    await mockApi(page, {
      authConfig: { localEnabled: true, googleEnabled: true },
      user: null,
    });
    await page.goto('/login');

    // El formulario completo depende de `config`: sin él la Card sale vacía.
    // El título de la Card no es un heading en shadcn, así que se localiza por
    // su `data-slot` en vez de por rol.
    await expect(page.locator('[data-slot="card-title"]')).toHaveText('Iniciar sesión');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continuar con Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Regístrate' })).toBeVisible();

    // Fondo del documento: el `--background` de Nocturne, no el gris de shadcn.
    await expect(page.locator('body')).toHaveCSS('background-color', NOCTURNE.background);

    // `data-slot` es el contrato estable de los primitivos de shadcn; no es una
    // clase de Tailwind y no cambia al reordenar utilidades.
    await expect(page.locator('[data-slot="card"]')).toHaveCSS(
      'background-color',
      NOCTURNE.surface,
    );

    // Nocturne exige la acción primaria como contorno, nunca como relleno.
    const primaryButton = page.getByRole('button', { name: 'Entrar' });
    await expect(primaryButton).toHaveCSS('background-color', NOCTURNE.transparent);
    await expect(primaryButton).toHaveCSS('border-top-color', NOCTURNE.brand);
    await expect(primaryButton).toHaveCSS('color', NOCTURNE.brand);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'login.png'), fullPage: true });
  });

  test('--muted-foreground resuelve a ink-500 y no al ink-600 que no alcanza AA', async ({
    page,
  }) => {
    await mockApi(page, { user: null });
    await page.goto('/login');
    await expect(page.locator('[data-slot="card-title"]')).toHaveText('Iniciar sesión');

    const resolved = await resolveTokenColor(page, '--muted-foreground');
    expect(resolved).toBe(NOCTURNE.mutedForeground);
    expect(resolved).not.toBe(NOCTURNE.inkBelowAa);

    // Y el token tiene que llegar al texto secundario real, no quedarse en :root.
    await expect(page.getByText('Accede a tu cuenta')).toHaveCSS('color', NOCTURNE.mutedForeground);
  });

  test('el registro hereda los mismos tokens', async ({ page }) => {
    await mockApi(page, {
      authConfig: { localEnabled: true, googleEnabled: true },
      user: null,
    });
    await page.goto('/register');

    // "Crear cuenta" es a la vez título de la Card y etiqueta del submit.
    await expect(page.locator('[data-slot="card-title"]')).toHaveText('Crear cuenta');
    await expect(page.locator('body')).toHaveCSS('background-color', NOCTURNE.background);
    await expect(page.locator('[data-slot="card"]')).toHaveCSS(
      'background-color',
      NOCTURNE.surface,
    );

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'register.png'), fullPage: true });
  });

  test('la divulgación selectiva mantiene el sistema sobre tablas y tarjetas', async ({ page }) => {
    await mockApi(page, { user: buildAuthUser() });
    await page.goto('/disclosure');

    await expect(page.getByRole('heading', { name: 'Divulgación selectiva' })).toBeVisible();
    await expect(page.locator('[data-slot="card-title"]')).toHaveText('Cartera del expediente');

    // La tabla es la superficie más densa del panel: si el mapeo se rompe, se
    // rompe aquí primero.
    await expect(page.locator('body')).toHaveCSS('background-color', NOCTURNE.background);
    await expect(page.locator('[data-slot="card"]').first()).toHaveCSS(
      'background-color',
      NOCTURNE.surface,
    );

    // La celda de vencimiento usa `text-muted-foreground`: mismo token AA.
    // `exact: true` es obligatorio: sin él la fecha también casa por subcadena
    // con el aria-label del checkbox de la misma fila.
    await expect(page.getByRole('cell', { name: '2026-01-15', exact: true }).first()).toHaveCSS(
      'color',
      NOCTURNE.mutedForeground,
    );

    // La acción primaria sigue siendo contorno también fuera del login.
    const primaryAction = page.getByRole('button', { name: /^Construir prueba/ });
    await expect(primaryAction).toHaveCSS('background-color', NOCTURNE.transparent);
    await expect(primaryAction).toHaveCSS('border-top-color', NOCTURNE.brand);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'disclosure.png'), fullPage: true });
  });
});
