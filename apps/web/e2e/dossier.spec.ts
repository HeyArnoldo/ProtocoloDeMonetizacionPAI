import { expect, test } from '@playwright/test';
import { buildAssetResponse, buildAuthUser, mockApi } from './fixtures/api-mock';

const ASSET_ID = `0x${'1'.repeat(64)}`;

test('loads the query asset, remembers it, and renders persisted receivables in order', async ({
  page,
}) => {
  const asset = buildAssetResponse();
  await mockApi(page, { user: buildAuthUser(), asset });

  await page.goto(`/expediente?assetId=${ASSET_ID}`);

  await expect(page.getByTitle(asset.merkleRoot)).toBeVisible();
  await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(page.getByText(/Block: 12345/)).toBeVisible();
  const entries = page.getByRole('listitem');
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
