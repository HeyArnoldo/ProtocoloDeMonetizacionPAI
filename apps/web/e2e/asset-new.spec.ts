import { expect, test } from '@playwright/test';
import {
  buildAuthUser,
  buildCreatedAsset,
  DEMO_ASSET_ID,
  mockApi,
  mockInjectedWallet,
  MOCK_TX_HASH,
  MOCK_WALLET_ACCOUNT,
} from './fixtures/api-mock';

const evidence = {
  id: 'e4726725-7548-42c6-a6cc-cf3342c89a4a',
  originalName: 'contrato-andinos.pdf',
  mimeType: 'application/pdf',
  sizeBytes: '2048',
  sha256: `0x${'b'.repeat(64)}`,
  createdAt: '2026-08-07T12:00:00.000Z',
};

/** Deja la wallet conectada en Arbitrum Sepolia, que es el estado de partida real. */
async function connectWallet(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Conectar MetaMask' }).click();
  await page.getByRole('button', { name: 'Cambiar MetaMask a Arbitrum Sepolia' }).click();
  await expect(page.getByLabel(/MetaMask conectada:/)).toBeVisible();
}

async function fillFirstReceivable(page: import('@playwright/test').Page) {
  await page.getByLabel('Evidencia que la respalda').selectOption(evidence.id);
  await page.getByLabel('RUC del deudor').fill('20512345678');
  await page.getByLabel('Razón social').fill('Supermercados Andinos SAC');
  await page.getByLabel('Monto (unidades menores)').fill('800000');
  await page.getByLabel('Vencimiento').fill('2026-11-15');
}

test('registra un expediente: crear, firmar y confirmar contra la cadena', async ({ page }) => {
  await mockInjectedWallet(page);
  await mockApi(page, { user: buildAuthUser(), evidence: [evidence] });
  await page.goto('/expediente/nuevo');

  // Sin wallet no se puede firmar el último paso, y el botón lo refleja.
  await expect(page.getByRole('button', { name: 'Crear y registrar on-chain' })).toBeDisabled();
  await connectWallet(page);

  await page.getByRole('button', { name: 'Usar la conectada' }).click();
  await expect(page.getByLabel('Dirección que controlará el expediente')).toHaveValue(
    MOCK_WALLET_ACCOUNT,
  );

  await fillFirstReceivable(page);
  // El monto se lee como dinero mientras se escribe: 800000 centavos = USD 8.000,00.
  await expect(page.getByText('USD 8,000.00')).toBeVisible();

  await page.getByRole('button', { name: 'Crear y registrar on-chain' }).click();

  await expect(page.getByText('Expediente registrado on-chain.')).toBeVisible();
  await expect(page.getByTitle(DEMO_ASSET_ID)).toBeVisible();
  await expect(page.getByTitle(MOCK_TX_HASH)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir el expediente' })).toHaveAttribute(
    'href',
    `/expediente?assetId=${DEMO_ASSET_ID}`,
  );
});

test('nombra la cuota exacta que falta en vez de fallar en bloque', async ({ page }) => {
  await mockInjectedWallet(page);
  await mockApi(page, { user: buildAuthUser(), evidence: [evidence] });
  await page.goto('/expediente/nuevo');
  await connectWallet(page);
  await page.getByRole('button', { name: 'Usar la conectada' }).click();

  await fillFirstReceivable(page);
  await page.getByRole('button', { name: 'Agregar cuota' }).click();
  await page.getByRole('button', { name: 'Crear y registrar on-chain' }).click();

  await expect(page.getByRole('alert')).toContainText('Cuota 2');
});

/**
 * El expediente ya existe en Postgres cuando la cadena rechaza la confirmación.
 * Perder el `assetId` ahí obligaría a recrearlo y duplicaría el expediente.
 */
test('conserva el assetId cuando la confirmación on-chain falla', async ({ page }) => {
  await mockInjectedWallet(page);
  await mockApi(page, {
    user: buildAuthUser(),
    evidence: [evidence],
    createdAsset: buildCreatedAsset(),
    confirmRegistrationError: 'On-chain merkleRoot does not match the asset draft.',
  });
  await page.goto('/expediente/nuevo');
  await connectWallet(page);
  await page.getByRole('button', { name: 'Usar la conectada' }).click();
  await fillFirstReceivable(page);

  await page.getByRole('button', { name: 'Crear y registrar on-chain' }).click();

  await expect(page.getByRole('alert')).toContainText('merkleRoot');
  await expect(page.getByTitle(DEMO_ASSET_ID)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar la firma' })).toBeVisible();
});

test('sin evidencias cargadas manda a subir una antes de seguir', async ({ page }) => {
  await mockApi(page, { user: buildAuthUser(), evidence: [] });
  await page.goto('/expediente/nuevo');

  await expect(page.getByRole('link', { name: 'Sube al menos una' })).toHaveAttribute(
    'href',
    '/evidencias',
  );
});
