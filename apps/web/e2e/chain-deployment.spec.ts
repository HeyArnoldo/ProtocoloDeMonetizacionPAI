import { expect, test, type Page } from '@playwright/test';
import { buildAuthUser, buildChainStatus, mockApi } from './fixtures/api-mock';

/**
 * El pie del sidebar no puede afirmar un despliegue que no leyó.
 *
 * Antes decía "6 contratos leídos desde el despliegue canónico" contando
 * variables de entorno. Tras un redespliegue —ya pasó una vez— esas direcciones
 * quedan apuntando a cuentas vacías y el panel seguía tranquilo hasta que una
 * transacción revertía en vivo. Estas tres corridas fijan las tres respuestas
 * posibles, y sobre todo que las dos malas no se ven iguales.
 */

const ADDRESS = '0xb2A15c6BD8c1A409F79a09e46C7Ce047eD6ad7d7';
const EXPLORER = 'https://sepolia.arbiscan.io';

const contracts = (bytecode: Record<string, 'present' | 'absent' | 'unconfirmed'>) =>
  Object.entries(bytecode).map(([name, state]) => ({
    name: name as 'assetRegistry',
    address: ADDRESS,
    explorerUrl: `${EXPLORER}/address/${ADDRESS}`,
    bytecode: state,
  }));

const ALL_PRESENT = {
  assetRegistry: 'present',
  certificationAttestor: 'present',
  paiCertificate: 'present',
  borrowingBaseEngine: 'present',
  collateralVault: 'present',
  mockUsdc: 'present',
} as const;

async function openPanel(page: Page, bytecode: Record<string, string>) {
  await mockApi(page, {
    user: buildAuthUser(),
    chainStatus: buildChainStatus({
      contracts: contracts(bytecode as Parameters<typeof contracts>[0]),
    }),
  });
  await page.goto('/panel');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('declara los seis contratos verificados cuando todos tienen bytecode', async ({ page }) => {
  await openPanel(page, ALL_PRESENT);

  await expect(page.getByText('6 de 6 contratos verificados on-chain')).toBeVisible();
});

test('nombra el contrato sin bytecode en vez de contar solo los sanos', async ({ page }) => {
  await openPanel(page, { ...ALL_PRESENT, collateralVault: 'absent' });

  await expect(page.getByText('5 de 6 contratos verificados on-chain')).toBeVisible();
  await expect(page.getByText(/Sin bytecode en su dirección: collateralVault/)).toBeVisible();
});

test('separa "no se pudo confirmar" de "no está desplegado"', async ({ page }) => {
  await openPanel(page, { ...ALL_PRESENT, mockUsdc: 'unconfirmed' });

  await expect(page.getByText('5 de 6 contratos verificados on-chain')).toBeVisible();
  await expect(page.getByText(/No se pudo confirmar: mockUsdc/)).toBeVisible();
  // La distinción es el punto: una duda no puede leerse como un despliegue roto.
  await expect(page.getByText(/Sin bytecode en su dirección/)).toHaveCount(0);
});
