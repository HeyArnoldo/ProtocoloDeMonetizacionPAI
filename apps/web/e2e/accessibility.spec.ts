import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { buildAuthUser, mockApi } from './fixtures/api-mock';

/**
 * Auditoría de accesibilidad del login.
 *
 * De momento **informa, no bloquea**: el objetivo de esta tanda es dejar la
 * base E2E montada y medir el estado real del sistema visual recién portado.
 * Las violaciones quedan adjuntas al reporte y anotadas en el test para poder
 * priorizarlas; cuando estén corregidas, este spec pasa a fallar ante
 * cualquier violación de impacto `serious` o `critical`.
 */
test('accesibilidad del login (informe, todavía no bloquea)', async ({ page }, testInfo) => {
  await mockApi(page, {
    authConfig: { localEnabled: true, googleEnabled: true },
    user: null,
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Entrar' }).waitFor();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  await testInfo.attach('axe-violations.json', {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });

  for (const violation of results.violations) {
    testInfo.annotations.push({
      type: 'a11y',
      description: `${violation.id} (${violation.impact}) · ${violation.nodes.length} nodo(s) · ${violation.help}`,
    });
    console.log(
      `[axe] ${violation.id} (${violation.impact}) — ${violation.help}\n      ${violation.nodes
        .map((node) => node.target.join(' '))
        .join('\n      ')}`,
    );
  }

  if (results.violations.length === 0) {
    console.log('[axe] sin violaciones wcag2a/2aa/21a/21aa en /login');
  }
});

test('accesibilidad de la timeline autenticada en escritorio', async ({ page }) => {
  await mockApi(page, { user: buildAuthUser() });
  await page.goto('/prestamo');
  await page.getByRole('navigation', { name: 'Progreso operativo' }).waitFor();
  const results = await new AxeBuilder({ page })
    .include('[data-testid="operational-timeline"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
