import { expect, test } from '@playwright/test';
import { buildAuthUser, mockApi } from './fixtures/api-mock';

const existing = {
  id: 'e4726725-7548-42c6-a6cc-cf3342c89a4a',
  originalName: 'contrato.pdf',
  mimeType: 'application/pdf',
  sizeBytes: '2048',
  sha256: `0x${'b'.repeat(64)}`,
  createdAt: '2026-08-07T12:00:00.000Z',
};

test('lists persisted evidence and uploads only after explicit submit', async ({ page }) => {
  await mockApi(page, { user: buildAuthUser(), evidence: [existing] });
  await page.goto('/evidencias');

  // El inventario y el contador se afirman dentro de su contenedor. Buscar un
  // «1» suelto en toda la página cazaba cualquier dígito del shell —el número
  // de paso del timeline operativo, por ejemplo— en vez del recuento real.
  const inventory = page.getByRole('list', { name: 'Persisted evidence' });
  const footprint = page.getByRole('region', { name: 'Evidence footprint' });

  await expect(page.getByText('contrato.pdf')).toBeVisible();
  await expect(page.getByText(existing.sha256)).toBeVisible();
  await expect(inventory.getByRole('listitem')).toHaveCount(1);
  await expect(footprint.getByText('1', { exact: true })).toBeVisible();

  await page.getByLabel('Evidence file').setInputFiles({
    name: 'factura.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from('<invoice />'),
  });
  await expect(page.getByText('factura.xml')).toHaveCount(0);
  await page.getByRole('button', { name: 'Upload evidence' }).click();

  await expect(page.getByText('Upload completed.')).toBeVisible();
  await expect(page.getByText('factura.xml')).toBeVisible();
  await expect(inventory.getByRole('listitem')).toHaveCount(2);
  await expect(footprint.getByText('2', { exact: true })).toBeVisible();
});

test('shows an upload API error and keeps the selected file retryable', async ({ page }) => {
  await mockApi(page, { user: buildAuthUser(), evidenceUploadError: 'Storage unavailable' });
  await page.goto('/evidencias');
  await page.getByLabel('Evidence file').setInputFiles({
    name: 'contrato.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('contract'),
  });
  await page.getByRole('button', { name: 'Upload evidence' }).click();

  // El motivo que manda la API, no el rótulo genérico de Axios: «Request failed
  // with status code 503» no le dice nada a quien está en la pantalla.
  await expect(page.getByRole('alert')).toContainText('Storage unavailable');
  await expect(page.getByRole('button', { name: 'Upload evidence' })).toBeEnabled();
});
