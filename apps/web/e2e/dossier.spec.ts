import { expect, test } from '@playwright/test';
import {
  DEMO_ASSET_ID,
  buildAssetReceivables,
  buildAssetResponse,
  buildAuthUser,
  mockApi,
} from './fixtures/api-mock';

const ASSET_ID = DEMO_ASSET_ID;

/**
 * Dos cuotas con el `position` invertido respecto al orden del array.
 *
 * Es lo que hace que la aserción de orden signifique algo: si la pantalla
 * pintara el array tal cual en vez de ordenar por `position`, saldrían al revés.
 */
const UNORDERED_RECEIVABLES = buildAssetReceivables()
  .slice(0, 2)
  .map((item, index) => ({ ...item, position: 1 - index }));

test('loads the query asset, remembers it, and renders persisted receivables in order', async ({
  page,
}) => {
  const asset = buildAssetResponse(UNORDERED_RECEIVABLES);
  await mockApi(page, { user: buildAuthUser(), asset });

  await page.goto(`/expediente?assetId=${ASSET_ID}`);

  await expect(page.getByTitle(asset.merkleRoot)).toBeVisible();
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(page.getByText(/Block: 12345/)).toBeVisible();
  // Acotado por el nombre accesible de la lista: `getByRole('listitem')` suelto
  // arrastra los 24 ítems de la navegación del panel.
  const entries = page.getByRole('list', { name: 'Ordered receivables' }).getByRole('listitem');
  await expect(entries).toHaveCount(UNORDERED_RECEIVABLES.length);
  await expect(entries.nth(0)).toContainText('#1');
  await expect(entries.nth(1)).toContainText('#2');
  await expect(entries.nth(0)).toContainText(asset.receivables[1]!.evidenceId);
  await expect(page.getByTitle(asset.receivables[1]!.docHash)).toBeVisible();

  await page.goto('/expediente');
  await expect(page.getByTitle(asset.merkleRoot)).toBeVisible();
});

test('shows an ownership denial without fabricated dossier data', async ({ page }) => {
  await mockApi(page, { user: buildAuthUser(), assetErrorStatus: 403 });
  await page.goto(`/expediente?assetId=${ASSET_ID}`);

  await expect(page.getByRole('alert')).toContainText('permission');
  await expect(page.getByText('Ordered receivables')).toHaveCount(0);
});
