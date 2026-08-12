import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { UserRole } from '@app/contracts';
import {
  DEMO_ASSET_ID,
  SECOND_ASSET_ID,
  buildAssetList,
  buildAssetResponse,
  buildAuthUser,
  mockApi,
} from './fixtures/api-mock';

/**
 * Descubrimiento de expedientes.
 *
 * Lo que se prueba aquí no es «hay una lista»: es que **«lista vacía» y
 * «expediente invisible» nunca se ven igual**. Antes, las dos situaciones —y
 * también un listado caído— terminaban en la misma pantalla vacía, y quien
 * acababa de registrar un expediente no podía saber si lo había perdido.
 */

const SCREENSHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '__screenshots__');

/** Un identificador bien formado que la API no resuelve para quien pregunta. */
const FOREIGN_ASSET_ID = `0x${'9f'.repeat(32)}`;

/**
 * Acotado por el nombre accesible de la lista: `getByRole('listitem')` suelto
 * arrastra los 24 ítems de la navegación del panel.
 */
const entries = (page: Page) =>
  page.getByRole('list', { name: 'Expedientes' }).getByRole('listitem');

test('un ADMIN lista, elige y abre un expediente que no creó', async ({ page }) => {
  // `ownedByRequester: false` es lo único que separa «lo veo porque es mío» de
  // «lo veo porque soy ADMIN». Sin marca visible, abrir uno ajeno parecería un
  // expediente propio olvidado.
  await mockApi(page, {
    user: buildAuthUser({ role: UserRole.ADMIN }),
    assetList: buildAssetList([
      {},
      {
        id: SECOND_ASSET_ID,
        ownedByRequester: false,
        receivableCount: 4,
        totalAmountMinor: '3120000',
        createdAt: '2026-07-02T10:30:00.000Z',
      },
    ]),
    asset: { ...buildAssetResponse(), id: SECOND_ASSET_ID },
  });

  await page.goto('/expediente');

  await expect(entries(page)).toHaveCount(2);
  const foreign = entries(page).nth(1);
  await expect(foreign).toContainText('De otra cuenta');
  await expect(foreign).toContainText('4 cuotas');
  // Y el propio no la lleva: la marca distingue, no decora.
  await expect(entries(page).nth(0)).not.toContainText('De otra cuenta');

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'asset-discovery.png'),
    fullPage: true,
  });

  await foreign.click();

  await expect(page).toHaveURL(new RegExp(`assetId=${SECOND_ASSET_ID}$`));
  await expect(
    page.getByRole('region', { name: 'Asset identity' }).getByTitle(SECOND_ASSET_ID),
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Ordered receivables' }).getByRole('listitem'),
  ).toHaveCount(16);
});

test('sin expedientes, la pantalla lo dice y ofrece crear el primero', async ({ page }) => {
  await mockApi(page, { user: buildAuthUser(), assetList: [] });
  await page.goto('/expediente');

  await expect(page.getByRole('note', { name: 'Expedientes: ninguno todavía' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Crear el primer expediente' })).toHaveAttribute(
    'href',
    '/expediente/nuevo',
  );
  await expect(entries(page)).toHaveCount(0);
});

/**
 * La regresión que importa, afirmada en las dos direcciones.
 *
 * Un identificador que no resuelve **teniendo** expedientes a la vista no es un
 * vacío: es un expediente que no se ve. La pantalla tiene que decir cuántos sí
 * se ven —esa cifra es la diferencia— y no puede pintar el bloque de «todavía
 * no hay expedientes».
 */
test('un id que no resuelve dice cuántos SÍ se ven y no declara la cuenta vacía', async ({
  page,
}) => {
  await mockApi(page, { user: buildAuthUser(), assetErrorStatus: 404 });
  await page.goto(`/expediente?assetId=${FOREIGN_ASSET_ID}`);

  await expect(page.getByRole('alert')).toContainText(
    'Ese identificador no aparece entre los 2 expedientes que puedes ver.',
  );
  await expect(page.getByRole('note', { name: 'Expedientes: ninguno todavía' })).toHaveCount(0);
  await expect(entries(page)).toHaveCount(2);
  // Y tampoco se queda en «Asset not found», que es justo lo indistinguible.
  await expect(page.getByText('Asset not found.')).toHaveCount(0);
});

/**
 * El otro lado del mismo error: un listado que falló tampoco es un vacío.
 *
 * Aquí la pantalla no sabe cuántos expedientes hay, así que no afirma ninguno
 * de los dos hechos: declara que no pudo comprobarlo.
 */
test('un listado caído nunca degrada a «no hay expedientes»', async ({ page }) => {
  await mockApi(page, { user: buildAuthUser(), assetListErrorStatus: 500 });
  await page.goto('/expediente');

  await expect(page.getByRole('alert')).toContainText('No se pudo cargar el listado');
  await expect(page.getByRole('note', { name: 'Expedientes: ninguno todavía' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Expedientes' })).toHaveCount(0);
});

test('la cola de certificación se elige de la lista, no solo pegando el id', async ({ page }) => {
  await mockApi(page, {
    user: buildAuthUser({ role: UserRole.CERTIFIER }),
    assetList: buildAssetList(),
  });
  await page.goto('/certificacion');

  await expect(entries(page)).toHaveCount(2);
  await entries(page).nth(0).click();

  await expect(page.getByLabel('Asset ID')).toHaveValue(DEMO_ASSET_ID);
  await expect(page.getByText('Registry status: Attested.')).toBeVisible();
});
