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

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Ningún `.only` debe llegar a CI.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORT },
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
