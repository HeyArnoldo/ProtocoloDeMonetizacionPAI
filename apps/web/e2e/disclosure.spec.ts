import { expect, test, type Page } from '@playwright/test';
import {
  buildAuthUser,
  buildAssetResponse,
  buildSamplePortfolio,
  computeDisclosurePreview,
  mockApi,
} from './fixtures/api-mock';

/**
 * Flujo real de la divulgación selectiva.
 *
 * El valor de este spec está en que el root y las hojas esperadas se calculan
 * con `@app/merkle` sobre la misma cartera que sirve el mock: si la UI mostrara
 * un root distinto del que produce el árbol, el test lo ve.
 */

const PORTFOLIO = buildSamplePortfolio();

/** Primera cuota de los dos primeros contratos: dos deudores distintos. */
const DISCLOSED_INDICES = [0, 4];

const EXPECTED = computeDisclosurePreview({
  salt: PORTFOLIO.salt,
  receivables: PORTFOLIO.receivables,
  disclosedIndices: DISCLOSED_INDICES,
});

const ASSET = {
  ...buildAssetResponse(PORTFOLIO),
  merkleRoot: EXPECTED.root,
  receivables: PORTFOLIO.receivables.map((item, index) => ({
    ...item,
    id: `8fb79494-272c-4be1-8204-885c0bba35${String(index).padStart(2, '0')}`,
    evidenceId: `7fb79494-272c-4be1-8204-885c0bba35${String(index).padStart(2, '0')}`,
    position: index,
  })),
};

function checkboxNameFor(index: number): string {
  const item = PORTFOLIO.receivables[index]!;
  return `Divulgar cuota de ${item.debtorLabel} con vencimiento ${item.dueDate}`;
}

test.describe('divulgación selectiva', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { user: buildAuthUser(), portfolio: PORTFOLIO, asset: ASSET });
    await page.goto(`/expediente?assetId=${ASSET.id}`);
    await page.getByRole('link', { name: 'Divulgación selectiva' }).click();
    await expect(page).toHaveURL(/\/divulgacion$/);
    await expect(page.getByRole('heading', { name: 'Divulgación selectiva' })).toBeVisible();
  });

  /** Devuelve la caja de una cifra del panel de multiproof a partir de su rótulo. */
  function statTile(page: Page, kicker: string) {
    return page.getByText(kicker, { exact: true }).locator('..');
  }

  test('construye una prueba verificable de las cuotas seleccionadas', async ({ page }) => {
    await expect(
      page.getByText(`${PORTFOLIO.receivables.length} cuotas`, { exact: false }),
    ).toBeVisible();

    for (const index of DISCLOSED_INDICES) {
      await page.getByRole('checkbox', { name: checkboxNameFor(index) }).check();
    }

    await page
      .getByRole('button', { name: `Construir prueba (${DISCLOSED_INDICES.length})` })
      .click();

    await expect(page.getByText('Prueba construida')).toBeVisible();
    await expect(page.getByText('verifica contra el root', { exact: true })).toBeVisible();

    // El root que muestra la UI es exactamente el que produce el árbol.
    await expect(page.getByTitle(EXPECTED.root)).toBeVisible();
    expect(EXPECTED.verified).toBe(true);

    // Divulgadas y ocultas: la cuenta de lo que el prestamista no llega a ver.
    // El handoff separa las dos cifras en cajas distintas del panel de
    // multiproof, así que ya no hay un único texto «2 / 14» que localizar.
    await expect(statTile(page, 'Hojas divulgadas')).toContainText(String(EXPECTED.disclosedCount));
    await expect(statTile(page, 'Hojas ocultas')).toContainText(String(EXPECTED.hiddenCount));
    await expect(
      page.getByText(`Las ${EXPECTED.hiddenCount} cuotas ocultas no aparecen`, { exact: false }),
    ).toBeVisible();

    // USD 800,000 + 1,250,000 en unidades menores = USD 20,500.00
    await expect(page.getByText('USD 20,500.00', { exact: true })).toBeVisible();
    await expect(statTile(page, 'Tamaño del proof')).toContainText(String(EXPECTED.proof.length));

    // Cada hoja divulgada aparece con su hash completo en el `title`.
    for (const leaf of EXPECTED.disclosedLeaves) {
      await expect(page.getByTitle(leaf.leafHash)).toBeVisible();
      await expect(page.getByTitle(leaf.debtorHash)).toBeVisible();
    }

    // Y ningún identificador de deudor en claro cruza hacia el resultado.
    // El bloque se titula «Detalle de la prueba»: «Hojas divulgadas» pasó a ser
    // el rótulo de una de las cifras del panel y ya no identifica la sección.
    const disclosedSection = page.getByText('Detalle de la prueba').locator('..');
    await expect(disclosedSection).not.toContainText('20512345678');
    await expect(disclosedSection).not.toContainText('Supermercados Andinos SAC');
  });

  test('seleccionar por deudor marca todas sus cuotas', async ({ page }) => {
    const debtorLabel = PORTFOLIO.receivables[0]!.debtorLabel;
    const installments = PORTFOLIO.receivables.filter(
      (item) => item.debtorLabel === debtorLabel,
    ).length;

    await page.getByRole('button', { name: debtorLabel }).click();

    await expect(
      page.getByRole('button', { name: `Construir prueba (${installments})` }),
    ).toBeEnabled();
    await expect(page.getByRole('checkbox', { name: checkboxNameFor(0) })).toBeChecked();

    await page.getByRole('button', { name: 'Limpiar' }).click();
    await expect(page.getByRole('button', { name: 'Construir prueba (0)' })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: checkboxNameFor(0) })).not.toBeChecked();
  });
});
