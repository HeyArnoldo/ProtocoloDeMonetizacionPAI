import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { UserRole } from '@app/contracts';
import { DEMO_ASSET_ID, buildAssetResponse, buildAuthUser, mockApi } from './fixtures/api-mock';

/**
 * Modo presentación: el guion de demo en una sola pantalla.
 *
 * Lo que este spec protege es la promesa del documento —«nada que no se pueda
 * abrir en Arbiscan»— llevada a la vista: una etapa sin transacción real se
 * muestra como pendiente y **no** como completada. El fixture ayuda a probarlo
 * porque su instantánea de cadena no trae atestaciones ni préstamo: el
 * expediente está registrado y nada más.
 */

const SCREENSHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '__screenshots__');

const FLOW_URL = `/flujo?assetId=${DEMO_ASSET_ID}`;

/** Las ocho etapas, en el orden que fija `buildOperationalTimeline()`. */
const STEP_IDS = [
  'evidence',
  'dossier',
  'certification',
  'disclosure',
  'borrowing-base',
  'loan',
  'repayment',
  'verification',
];

/**
 * Las siete pantallas que la PYME sí puede abrir desde el flujo.
 *
 * `/certificacion` queda fuera a propósito: es del certificador, y su tarjeta
 * tiene que quedarse sin CTA en lugar de ofrecer un enlace que da 403.
 */
const PYME_DESTINATIONS: ReadonlyArray<{ label: string; url: RegExp }> = [
  { label: 'Evidencias', url: /\/evidencias$/ },
  { label: 'Expediente / registro', url: /\/expediente$/ },
  { label: 'Divulgación', url: /\/divulgacion$/ },
  { label: 'Base prestable', url: /\/borrowing-base$/ },
  { label: 'Préstamo / fondeo', url: /\/prestamo$/ },
  { label: 'Repago', url: /\/historial$/ },
  { label: 'Verificación pública', url: /\/verify$/ },
];

const card = (page: Page, id: string) =>
  page.locator(`[data-testid="flow-step"][data-step-id="${id}"]`);

/** Qué tarjeta tiene el foco del teclado, leído del DOM y no de una clase CSS. */
const focusedStepId = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('data-step-id') ?? null);

async function openFlow(page: Page, role: UserRole = UserRole.PYME): Promise<void> {
  await mockApi(page, { user: buildAuthUser({ role }) });
  await page.goto(FLOW_URL);
  await expect(page.getByRole('heading', { level: 1, name: 'Modo presentación' })).toBeVisible();
}

test.describe('modo presentación', () => {
  test('muestra las ocho etapas del timeline con su frase del guion', async ({ page }) => {
    await openFlow(page);

    const steps = page.getByTestId('flow-step');
    await expect(steps).toHaveCount(8);
    expect(
      await steps.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-step-id'))),
    ).toEqual(STEP_IDS);

    // Las frases son cita textual de `docs/caso-de-uso-hackathon.md`.
    await expect(card(page, 'dossier')).toContainText(
      'Del expediente entero, on-chain viajan 32 bytes',
    );
    await expect(card(page, 'disclosure')).toContainText('Prueba sin revelar. Sin ZK, solo Merkle');
    await expect(card(page, 'loan')).toContainText('El dinero nunca tocó nuestro servidor');
  });

  test('la banda de cabecera lleva el estado de cadena y no una novena etapa', async ({ page }) => {
    await openFlow(page);

    await expect(page.getByText('El panel no dice que está conectado')).toBeVisible();
    // Dos lecturas del mismo componente: la del sidebar y la de la banda.
    await expect(page.getByText('6 de 6 contratos verificados on-chain')).toHaveCount(2);
    await expect(page.getByTestId('flow-step')).toHaveCount(8);
  });

  test('una etapa sin transacción se muestra pendiente y nunca como completada', async ({
    page,
  }) => {
    await openFlow(page);

    // La instantánea del fixture no trae atestaciones: no hay nada que abrir.
    const certification = card(page, 'certification');
    await expect(certification.getByRole('note')).toContainText(
      'todavía no acumula las tres atestaciones',
    );
    await expect(certification).not.toContainText('Completado y comprobado');

    // El préstamo tampoco existe: `loan.value` es null en la instantánea.
    await expect(card(page, 'loan').getByRole('note')).toBeVisible();
    await expect(card(page, 'loan')).not.toContainText('Completado y comprobado');
  });

  test('el registro publica el root y la tx con enlace al explorador', async ({ page }) => {
    await openFlow(page);

    const dossier = card(page, 'dossier');
    await expect(dossier).toContainText('Completado y comprobado');
    await expect(dossier.getByRole('note')).toHaveCount(0);

    const txHash = buildAssetResponse().registrationTxHash!;
    const link = dossier.getByTitle(txHash);
    await expect(link).toHaveAttribute('href', `https://sepolia.arbiscan.io/tx/${txHash}`);
  });

  test('cada CTA abre la pantalla de su etapa', async ({ page }) => {
    for (const destination of PYME_DESTINATIONS) {
      await openFlow(page);
      await page.getByRole('link', { name: `Abrir pantalla: ${destination.label}` }).click();
      await expect(page).toHaveURL(destination.url);
    }
  });

  test('una etapa que el rol no puede abrir se queda sin CTA', async ({ page }) => {
    await openFlow(page);

    await expect(card(page, 'certification')).toContainText('Sin acceso con este rol');
    await expect(page.getByRole('link', { name: 'Abrir pantalla: Certificación' })).toHaveCount(0);
  });

  test('las flechas mueven el foco entre etapas sin tocar el mouse', async ({ page }) => {
    await openFlow(page);

    // El foco arranca donde está la demo: la primera etapa sin evidencia. Con
    // el fixture, evidencias y registro están probados, así que es la tercera.
    const start = card(page, 'certification');
    await expect(start).toHaveAttribute('data-current', 'true');
    await start.focus();
    expect(await focusedStepId(page)).toBe('certification');

    await page.keyboard.press('ArrowRight');
    expect(await focusedStepId(page)).toBe('disclosure');

    await page.keyboard.press('ArrowRight');
    expect(await focusedStepId(page)).toBe('borrowing-base');

    await page.keyboard.press('ArrowLeft');
    expect(await focusedStepId(page)).toBe('disclosure');

    // El foco no se sale por los bordes: en la primera, `←` no da la vuelta.
    await card(page, 'evidence').focus();
    await page.keyboard.press('ArrowLeft');
    expect(await focusedStepId(page)).toBe('evidence');
  });

  test('el paso enfocado no se confunde con el paso donde está la demo', async ({ page }) => {
    await openFlow(page);

    await card(page, 'repayment').focus();

    // Dónde miro y dónde está la demo son dos marcas distintas y coexisten.
    await expect(card(page, 'repayment')).toHaveAttribute('data-focused', 'true');
    await expect(card(page, 'repayment')).not.toHaveAttribute('data-current', 'true');
    await expect(card(page, 'certification')).toHaveAttribute('data-current', 'true');
    await expect(card(page, 'certification')).toContainText('Aquí está la demo');
  });

  test('captura de la vista a 1440x900', async ({ page }) => {
    await openFlow(page);
    await expect(page.getByTestId('flow-step')).toHaveCount(8);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow.png'), fullPage: true });
  });
});
