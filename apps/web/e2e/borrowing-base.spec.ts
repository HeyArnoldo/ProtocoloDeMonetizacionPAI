import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  DEFAULT_PARAMS,
  computeBorrowingBase,
  type BorrowingBaseParams,
} from '@app/borrowing-base';
import type { Hex } from '@app/merkle';
import {
  DEMO_ASSET_ID,
  SAMPLE_SALT,
  buildAssetReceivables,
  buildAssetResponse,
  buildAuthUser,
  buildSamplePortfolio,
  mockApi,
  toLeaves,
} from './fixtures/api-mock';

/**
 * Recómputo del borrowing base sobre la selección compartida.
 *
 * El valor del spec está en que los importes esperados los produce
 * `@app/borrowing-base` —el mismo motor que llama la pantalla— sobre las hojas
 * que salen de `@app/merkle`. Si la UI mostrara otra cifra, o la derivara de
 * otras hojas, el test lo ve.
 */

const SCREENSHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '__screenshots__');

const PORTFOLIO = buildSamplePortfolio();

/**
 * El expediente persistido que sirve el mock.
 *
 * `/divulgacion` ya no carga una cartera de muestra: pide el expediente por
 * `?assetId=` y lo lee de `GET /api/assets/:id`. Los índices de las selecciones
 * de abajo son posiciones de `ASSET.receivables`, que el fixture mantiene en el
 * mismo orden que `PORTFOLIO.receivables`.
 */
const ASSET = buildAssetResponse(buildAssetReceivables(PORTFOLIO));

/**
 * Reloj fijo.
 *
 * La fecha de valorización es «hoy a medianoche UTC», así que sin fijar el
 * reloj el descuento por plazo cambiaría cada día y el spec caducaría solo.
 * `setFixedTime` congela `Date` sin tocar los temporizadores, que es
 * justamente lo que necesita la coreografía de 380ms.
 */
const FIXED_NOW = new Date('2026-03-10T12:34:56.000Z');
const VALUATION_DATE = Date.parse('2026-03-10T00:00:00.000Z') / 1000;

const PARAMS: BorrowingBaseParams = { ...DEFAULT_PARAMS, valuationDate: VALUATION_DATE };

/**
 * Selección de referencia: tres cuotas de dos deudores, todas con vencimiento
 * posterior a la valorización. Así ninguna de las cuatro líneas de descuento
 * sale en cero y el desglose se ejerce entero.
 */
const SELECTION_A = [1, 5, 6];
/** Segunda selección, deliberadamente distinta, para el argumento del root. */
const SELECTION_B = [2, 3];

const EXPECTED = computeBorrowingBase(
  toLeaves(
    SELECTION_A.map((index) => PORTFOLIO.receivables[index]!),
    SAMPLE_SALT as Hex,
  ),
  PARAMS,
);

/**
 * El root del expediente completo. No depende de qué se divulgue.
 *
 * Lo calcula el fixture con `@app/merkle` sobre las cuotas del expediente, así
 * que afirmar que la pantalla lo muestra es afirmar que muestra el root real.
 */
const TREE_ROOT = ASSET.merkleRoot;

/**
 * Formato de importe, escrito aparte a propósito.
 *
 * Es una implementación distinta de la del panel (`formatMinorUnits`): si
 * ambas coinciden sobre las mismas unidades menores, el formato del panel no
 * está perdiendo precisión por el camino.
 */
function usd(amountMinor: bigint): string {
  const units = amountMinor / 100n;
  const cents = amountMinor % 100n;
  return `USD ${units.toLocaleString('en-US')}.${cents.toString().padStart(2, '0')}`;
}

function checkboxNameFor(index: number): string {
  const item = PORTFOLIO.receivables[index]!;
  return `Divulgar cuota de ${item.debtorLabel} con vencimiento ${item.dueDate}`;
}

/**
 * Las líneas del desglose.
 *
 * Se acota por el nombre accesible de la lista: el sidebar del panel también
 * es una lista de `listitem` y un selector suelto arrastraría la navegación.
 */
function breakdownRows(page: Page) {
  return page.getByRole('list', { name: 'Desglose del borrowing base' }).getByRole('listitem');
}

/** Localiza una línea del desglose por su rótulo. */
function breakdownRow(page: Page, label: string) {
  return breakdownRows(page).filter({ hasText: label });
}

async function selectInstallments(page: Page, indices: number[]): Promise<void> {
  for (const index of indices) {
    await page.getByRole('checkbox', { name: checkboxNameFor(index) }).check();
  }
}

/**
 * Abre la divulgación del expediente.
 *
 * El `?assetId=` no es decorativo: sin él la pantalla no carga cartera alguna y
 * solo ofrece el rótulo que pide el identificador.
 */
async function gotoDisclosure(page: Page): Promise<void> {
  await page.goto(`/divulgacion?assetId=${DEMO_ASSET_ID}`);
  await expect(page.getByText(`${PORTFOLIO.receivables.length} cuotas`)).toBeVisible();
}

/**
 * Construye el multiproof de la selección actual.
 *
 * `/borrowing-base` ya no recompone las hojas en el navegador: el desglose se
 * calcula sobre las que devuelve `POST /api/disclosure/:assetId/preview`, con el
 * `debtorHash` derivado del salt que solo conoce el servidor. Así que sin prueba
 * construida no hay hojas, y sin hojas no hay recómputo que ejecutar. Cambiar la
 * selección descarta la prueba y obliga a construirla otra vez.
 */
async function buildProof(page: Page, disclosedCount: number): Promise<void> {
  await page.getByRole('button', { name: `Construir prueba (${disclosedCount})` }).click();
  await expect(page.getByText('Prueba construida')).toBeVisible();
}

/** Vuelve a la divulgación desde cualquier pantalla del panel. */
async function backToDisclosure(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Secciones del panel' })
    .getByRole('link', { name: 'Divulgación selectiva' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Divulgación selectiva' }),
  ).toBeVisible();
}

async function gotoBorrowingBase(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Secciones del panel' })
    .getByRole('link', { name: 'Recómputo Stylus' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Recómputo del borrowing base' }),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
  await mockApi(page, { user: buildAuthUser(), asset: ASSET });
});

test.describe('recómputo del borrowing base', () => {
  test('el desglose usa las cuotas seleccionadas en la divulgación', async ({ page }) => {
    await gotoDisclosure(page);
    await selectInstallments(page, SELECTION_A);
    await buildProof(page, SELECTION_A.length);

    await gotoBorrowingBase(page);

    // La selección viajó entre pantallas: es el guion de la demo.
    await expect(page.getByText(`${SELECTION_A.length} hojas divulgadas`)).toBeVisible();

    await page.getByRole('button', { name: 'Ejecutar recómputo' }).click();

    await expect(breakdownRow(page, 'Nominal divulgado')).toContainText(
      usd(EXPECTED.disclosedNominalMinor),
    );

    // Las cuatro líneas de descuento, con el importe que produce el motor.
    const discountLabels: Record<string, bigint> = {
      'Valor presente por plazo': amountFor('timeDiscount'),
      'Haircut de morosidad': amountFor('delinquency'),
      'Haircut de concentración': amountFor('concentration'),
      'Ajuste de continuidad': amountFor('serviceContinuity'),
    };

    for (const [label, amountMinor] of Object.entries(discountLabels)) {
      await expect(breakdownRow(page, label)).toContainText(usd(amountMinor));
    }

    await expect(breakdownRow(page, 'Valor ajustado por riesgo')).toContainText(
      usd(EXPECTED.riskAdjustedMinor),
    );
    await expect(breakdownRow(page, 'Base prestable')).toContainText(
      usd(EXPECTED.borrowingBaseMinor),
    );

    // El número es local y la pantalla lo dice: no se atribuye a la cadena.
    await expect(page.getByText('cálculo local de referencia')).toBeVisible();
    await expect(page.getByRole('note', { name: /MATCH \/ MISMATCH/ })).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'borrowing-base.png'),
      fullPage: true,
    });
  });

  test('cambiar la selección recalcula el desglose', async ({ page }) => {
    await gotoDisclosure(page);
    await selectInstallments(page, SELECTION_A);
    await buildProof(page, SELECTION_A.length);
    await gotoBorrowingBase(page);
    await page.getByRole('button', { name: 'Ejecutar recómputo' }).click();
    await expect(breakdownRow(page, 'Base prestable')).toContainText(
      usd(EXPECTED.borrowingBaseMinor),
    );

    // Quitar una cuota invalida el desglose en pantalla: los importes ya no
    // corresponden a lo divulgado, así que desaparecen en vez de envejecer.
    await backToDisclosure(page);
    await page.getByRole('checkbox', { name: checkboxNameFor(SELECTION_A[0]!) }).uncheck();
    await gotoBorrowingBase(page);

    await expect(breakdownRows(page)).toHaveCount(0);

    const narrowed = computeBorrowingBase(
      toLeaves(
        SELECTION_A.slice(1).map((index) => PORTFOLIO.receivables[index]!),
        SAMPLE_SALT as Hex,
      ),
      PARAMS,
    );

    // La prueba anterior se descartó con el cambio de selección: hay que pedir
    // la nueva antes de que haya nada que recomputar.
    await backToDisclosure(page);
    await buildProof(page, SELECTION_A.length - 1);
    await gotoBorrowingBase(page);

    await page.getByRole('button', { name: 'Ejecutar recómputo' }).click();
    await expect(breakdownRow(page, 'Base prestable')).toContainText(
      usd(narrowed.borrowingBaseMinor),
    );
    expect(narrowed.borrowingBaseMinor).not.toBe(EXPECTED.borrowingBaseMinor);
  });

  test('el root no cambia entre dos selecciones distintas', async ({ page }) => {
    await gotoDisclosure(page);

    // Sin selección, el root ya está en pantalla: sale del árbol completo.
    await expect(page.getByTitle(TREE_ROOT)).toBeVisible();
    await expect(page.getByText('no cambia', { exact: true })).toBeVisible();

    await selectInstallments(page, SELECTION_A);
    await expect(page.getByTitle(TREE_ROOT)).toBeVisible();

    await page.getByRole('button', { name: 'Limpiar' }).click();
    await selectInstallments(page, SELECTION_B);
    await expect(page.getByTitle(TREE_ROOT)).toBeVisible();

    // Y la insignia cuenta las selecciones probadas sin que el valor se mueva.
    await expect(page.getByText(/el mismo tras \d+ selecciones/)).toBeVisible();

    // El servidor construye la prueba sobre ese mismo root.
    await page.getByRole('button', { name: /^Construir prueba/ }).click();
    await expect(
      page.getByText('El servidor devolvió este mismo root al construir la prueba.'),
    ).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'disclosure-selection.png'),
      fullPage: true,
    });
  });

  test('limpiar la selección no produce Infinity ni NaN en ninguna pantalla', async ({ page }) => {
    await gotoDisclosure(page);
    await selectInstallments(page, SELECTION_A);
    await buildProof(page, SELECTION_A.length);
    await gotoBorrowingBase(page);
    await page.getByRole('button', { name: 'Ejecutar recómputo' }).click();
    await expect(breakdownRow(page, 'Base prestable')).toBeVisible();

    await backToDisclosure(page);
    await page.getByRole('button', { name: 'Limpiar' }).click();

    // La maqueta divide por un nominal de 0 y renderiza literalmente
    // «Infinity%» en este punto exacto.
    await expect(page.locator('body')).not.toContainText('Infinity');
    await expect(page.locator('body')).not.toContainText('NaN');
    await expect(page.getByRole('button', { name: 'Construir prueba (0)' })).toBeDisabled();

    await gotoBorrowingBase(page);

    await expect(page.getByText('Todavía no hay ninguna cuota divulgada.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ejecutar recómputo' })).toBeDisabled();
    await expect(page.locator('body')).not.toContainText('Infinity');
    await expect(page.locator('body')).not.toContainText('NaN');
  });

  test('la selección sobrevive a un refresco a mitad de demo', async ({ page }) => {
    await gotoDisclosure(page);
    await selectInstallments(page, SELECTION_A);

    await page.reload();

    await expect(
      page.getByRole('button', { name: `Construir prueba (${SELECTION_A.length})` }),
    ).toBeEnabled();
    await expect(
      page.getByRole('checkbox', { name: checkboxNameFor(SELECTION_A[0]!) }),
    ).toBeChecked();
  });
});

test.describe('con movimiento reducido', () => {
  // `contextOptions` y no la opción suelta: en Playwright 1.62 `reducedMotion`
  // solo existe dentro de las opciones del contexto del navegador.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('el desglose aparece entero, sin coreografía', async ({ page }) => {
    await gotoDisclosure(page);
    await selectInstallments(page, SELECTION_A);
    await buildProof(page, SELECTION_A.length);
    await gotoBorrowingBase(page);

    await page.getByRole('button', { name: 'Ejecutar recómputo' }).click();

    // Las siete líneas, ya visibles: sin esperar los 380ms por línea.
    await expect(breakdownRows(page)).toHaveCount(7, { timeout: 1_000 });
    await expect(breakdownRow(page, 'Base prestable')).toContainText(
      usd(EXPECTED.borrowingBaseMinor),
    );
  });
});

/** Importe de un concepto del desglose que produjo el motor. */
function amountFor(concept: string): bigint {
  const item = EXPECTED.breakdown.find((entry) => entry.concept === concept);
  if (!item) throw new Error(`El motor no devolvió el concepto ${concept}.`);
  return item.amountMinor;
}
