import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración E2E del panel.
 *
 * No hay backend en el entorno de pruebas: cada spec intercepta la API con
 * `page.route()` (ver `e2e/fixtures/api-mock.ts`). Por eso el servidor que se
 * levanta es solo el dev server de Vite, sin `@app/api` ni Postgres.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

/** El diseño Nocturne es desktop-first (~1280px+); 1440x900 es el ancho de referencia. */
const VIEWPORT = { width: 1440, height: 900 };

/**
 * Nombres de proyecto, exportados para que un spec pueda ramificar sobre el
 * ancho en el que corre sin repetir la cadena literal.
 */
export const DESKTOP_PROJECT = 'chromium';
export const MOBILE_PROJECT = 'mobile-chrome';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Ningún `.only` debe llegar a CI.
  forbidOnly: !!process.env.CI,
  /**
   * Un reintento también en local, no solo en CI.
   *
   * Con dos proyectos la suite hace más del doble de cargas de página, y en
   * cada una el navegador pide ~50 módulos sueltos al dev server: `page.route()`
   * desactiva la caché HTTP, así que ninguna se reutiliza entre tests. Bajo esa
   * presión, muy de vez en cuando una de esas peticiones se queda sin respuesta.
   * La traza de un fallo lo enseña sin ambigüedad —`GET /src/services/
   * disclosure.api.ts` con estado `-1` mientras las otras 46 responden 200—: el
   * grafo de módulos no termina de cargar, React no monta y la página se queda
   * en blanco. Es infraestructura del servidor de desarrollo, no la aplicación,
   * y por eso se reintenta en vez de relajar ninguna aserción.
   */
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  use: {
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: DESKTOP_PROJECT,
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORT },
    },
    {
      // Pixel 5: 393x851, `deviceScaleFactor` 3 y `hasTouch`. Se elige un
      // descriptor real de Playwright en vez de un viewport suelto porque el
      // user agent y el soporte táctil cambian lo que el navegador aplica
      // (`hover`, `pointer: coarse`), y esas media features son justamente las
      // que separan un panel de escritorio de uno usable con el pulgar.
      name: MOBILE_PROJECT,
      use: { ...devices['Pixel 5'] },
      // Solo el spec de responsive corre en móvil. Los otros 27 afirman el
      // sistema visual, el flujo de la demo y el cálculo del borrowing base
      // sobre el layout de escritorio aprobado; correrlos a 393px no probaría
      // nada nuevo y ataría sus localizadores a dos layouts a la vez.
      testMatch: /responsive\.spec\.ts/,
    },
  ],
  webServer: {
    // Dev server y no `build && preview`: el objetivo es verificar los tokens
    // tal como los emite Tailwind en desarrollo, que es donde se editan.
    command: 'pnpm run dev --port 5173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
