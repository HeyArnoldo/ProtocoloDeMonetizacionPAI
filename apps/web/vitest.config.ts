import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Runner unitario del panel.
 *
 * Solo cubre `src/`: `e2e/` es territorio de Playwright y sus specs importan
 * `@playwright/test`, que vitest no sabe ejecutar. Sin este filtro el patrón
 * por defecto (`**\/*.spec.ts`) arrastraría las dos suites al mismo proceso.
 *
 * Entorno `node` a propósito: aquí solo se prueba lógica de dominio pura
 * —formato de unidades menores, saneado de la selección, derivación de hojas—.
 * Lo que necesita un navegador de verdad se prueba en `e2e/`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(here, './src'),
    },
  },
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
