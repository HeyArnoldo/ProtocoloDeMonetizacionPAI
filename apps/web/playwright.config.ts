import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración E2E del panel.
 *
 * No hay backend en el entorno de pruebas: cada spec intercepta la API con
 * `page.route()` (ver `e2e/fixtures/api-mock.ts`). Por eso el servidor que se
 * levanta es solo el dev server de Vite, sin `@app/api` ni Postgres.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const PREVIEW_PORT = new URL(BASE_URL).port || '5173';

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
   * Sin reintentos en local: un fallo tiene que doler donde se escribe el
   * código. El reintento local existía para tapar la página en blanco
   * intermitente del dev server, que ya no se sirve (ver `webServer`).
   *
   * En CI se conservan dos, pero como red contra la infraestructura del
   * runner, no contra la aplicación. Si un test empieza a recuperarse en el
   * reintento, eso es una señal que hay que investigar, no aceptar.
   */
  retries: process.env.CI ? 2 : 0,
  /**
   * 10s en vez de los 5s por defecto.
   *
   * Toda ruta del panel resuelve primero `GET /api/auth/me` en `ProtectedRoute`
   * y luego el chunk perezoso de la página. Con la suite en paralelo sobre una
   * máquina cargada, ese encadenado rozaba los 5s y el redirect de `/disclosure`
   * caía por tiempo, no por estar roto: aislado pasa 8 de 8.
   *
   * Esperar más no debilita ninguna aserción — sigue comprobando exactamente lo
   * mismo. Lo que deja de hacer es asumir una máquina descargada.
   */
  expect: { timeout: 10_000 },
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
    // Bundle de producción, no dev server. El dev server sirve ~50 módulos
    // sueltos por carga y `page.route()` desactiva la caché HTTP, así que cada
    // navegación los vuelve a pedir todos; de vez en cuando uno respondía con
    // estado -1, el grafo de módulos no terminaba y React no montaba. El
    // resultado era una página en blanco intermitente, ~1 de cada 5 corridas.
    //
    // Con `preview` son ~5 peticiones. Y se verifica el CSS que realmente se
    // despliega, no el que emite Vite en desarrollo, que es el que importa.
    command: `pnpm run build && pnpm run preview --port ${PREVIEW_PORT} --strictPort`,
    url: BASE_URL,
    // Reutilizar cualquier listener en el puerto puede ejecutar un bundle viejo
    // y hacer que los mocks tipados se validen contra otro contrato.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
