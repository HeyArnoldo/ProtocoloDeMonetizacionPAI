import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { MOBILE_PROJECT } from '../playwright.config';
import { DEMO_ASSET_ID, buildAuthUser, mockApi } from './fixtures/api-mock';

/**
 * El panel a 393px.
 *
 * El spec corre en los dos proyectos —escritorio 1440x900 y Pixel 5 393x851—
 * sobre las mismas diez rutas. La aserción que de verdad prueba que no queda
 * nada desbordado es numérica: `scrollWidth` frente a `innerWidth`. Un
 * screenshot documenta, pero no falla, y una captura de un layout roto se ve
 * igual de plausible que la de uno correcto.
 *
 * Las tres auditorías se ejecutan en el navegador y devuelven **qué** elemento
 * incumple, no un booleano: un fallo tiene que decir dónde mirar.
 */

const SCREENSHOT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__screenshots__',
  'mobile',
);

const VERIFY_CODE = 'PAI-8F3C-2026';

/**
 * Las diez pantallas. `/verify/:code` es pública y se visita sin sesión.
 *
 * `/expediente` y `/divulgacion` llevan `search` porque exigen el expediente en
 * la query: sin él renderizan un rótulo pidiéndolo y la auditoría de desborde y
 * de mínimo táctil no llegaría a medir ni la tabla ni sus controles, que es
 * justo la superficie densa que hay que probar a 393px.
 */
const ASSET_SEARCH = `?assetId=${DEMO_ASSET_ID}`;

interface ResponsiveRoute {
  path: string;
  /** Query que la pantalla necesita para cargar datos. */
  search?: string;
  heading: string;
  authenticated: boolean;
}

const ROUTES: readonly ResponsiveRoute[] = [
  { path: '/panel', heading: 'Resumen del expediente', authenticated: true },
  {
    path: '/expediente',
    search: ASSET_SEARCH,
    heading: 'Expediente y árbol de Merkle',
    authenticated: true,
  },
  { path: '/evidencias', heading: 'Evidencias', authenticated: true },
  {
    path: '/divulgacion',
    search: ASSET_SEARCH,
    heading: 'Divulgación selectiva',
    authenticated: true,
  },
  { path: '/borrowing-base', heading: 'Recómputo del borrowing base', authenticated: true },
  { path: '/certificacion', heading: 'Cola de atestaciones', authenticated: true },
  { path: '/prestamo', heading: 'Originación y fondeo', authenticated: true },
  { path: '/historial', heading: 'Historial crediticio on-chain', authenticated: true },
  { path: '/actividad', heading: 'Actividad on-chain', authenticated: true },
  { path: `/verify/${VERIFY_CODE}`, heading: 'Verificación pública', authenticated: false },
];

/** Un píxel de holgura: los redondeos subpíxel del navegador no son un desborde. */
const TOLERANCE = 1;

/** WCAG 2.5.5 (AAA). El mínimo táctil que fija el encargo para todo control. */
const MIN_TOUCH_PX = 44;

/**
 * Margen para el primer pintado, no para una aserción de comportamiento.
 *
 * Este spec añade un segundo proyecto, así que el dev server de Vite atiende
 * dos contextos en paralelo mientras compila bajo demanda el grafo de módulos y
 * el chunk perezoso de cada ruta. Con los 5s por defecto, arrancar en frío se
 * queda corto de vez en cuando y la página se captura todavía en blanco. El
 * margen solo cubre el arranque: todo lo que se afirma después conserva el
 * tiempo estándar, porque ahí un retraso sí sería un síntoma.
 */
const APP_BOOT_TIMEOUT = 20_000;

interface OverflowOffender {
  selector: string;
  right: number;
  width: number;
}

interface TouchOffender {
  selector: string;
  width: number;
  height: number;
}

interface WidthReport {
  documentScrollWidth: number;
  innerWidth: number;
  /** Región de contenido del panel. `null` en la pantalla pública, que no la tiene. */
  contentScrollWidth: number | null;
  contentClientWidth: number | null;
}

function isMobile(): boolean {
  return test.info().project.name === MOBILE_PROJECT;
}

async function open(page: Page, route: ResponsiveRoute): Promise<void> {
  if (route.authenticated) await mockApi(page, { user: buildAuthUser() });
  await page.goto(`${route.path}${route.search ?? ''}`);
  await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible({
    timeout: APP_BOOT_TIMEOUT,
  });
}

/** Mide el ancho del documento y el de la región scrolleable del panel. */
function measureWidths(page: Page): Promise<WidthReport> {
  return page.evaluate(() => {
    const content = document.querySelector<HTMLElement>('[data-testid="panel-content"]');
    return {
      documentScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      contentScrollWidth: content ? content.scrollWidth : null,
      contentClientWidth: content ? content.clientWidth : null,
    };
  });
}

/**
 * Elementos visibles cuyo borde derecho cae fuera del viewport.
 *
 * Se descarta lo que cuelga de un contenedor que recorta en horizontal: una
 * tabla ancha dentro de su envoltorio con scroll propio es exactamente el
 * comportamiento que se busca, y su caja se extiende más allá de la pantalla a
 * propósito. Lo que no puede ocurrir es que ese desborde llegue al documento.
 */
function findOverflowingElements(page: Page, tolerance: number): Promise<OverflowOffender[]> {
  return page.evaluate((slack) => {
    const limit = window.innerWidth + slack;
    const offenders: { selector: string; right: number; width: number }[] = [];

    const clipsHorizontally = (element: Element): boolean => {
      const overflowX = getComputedStyle(element).overflowX;
      return (
        overflowX === 'auto' ||
        overflowX === 'scroll' ||
        overflowX === 'hidden' ||
        overflowX === 'clip'
      );
    };

    const describe = (element: Element): string => {
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : '';
      const slot = element.getAttribute('data-slot');
      const testId = element.getAttribute('data-testid');
      const classes = element.className;
      const shortClass =
        typeof classes === 'string' && classes
          ? `.${classes.split(/\s+/).slice(0, 3).join('.')}`
          : '';
      return [
        `${tag}${id}`,
        slot ? `[data-slot=${slot}]` : '',
        testId ? `[data-testid=${testId}]` : '',
        shortClass,
      ].join('');
    };

    for (const element of document.body.querySelectorAll('*')) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right <= limit) continue;

      let clipped = false;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (clipsHorizontally(parent)) {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;

      offenders.push({
        selector: describe(element),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      });
    }

    return offenders;
  }, tolerance);
}

/**
 * Controles interactivos visibles por debajo del mínimo táctil.
 *
 * Se aplica la excepción de destino en línea de WCAG 2.5.5: un enlace dentro de
 * una frase (`display: inline`) no puede crecer a 44px sin destrozar el
 * interlineado del párrafo que lo contiene, y la propia norma lo exime. Todo lo
 * demás —botones, checkboxes, pestañas, ítems de navegación— sí entra.
 */
function findSmallTouchTargets(page: Page, minimum: number): Promise<TouchOffender[]> {
  return page.evaluate((min) => {
    const selector = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="switch"]',
      '[role="radio"]',
      '[role="tab"]',
      '[role="menuitem"]',
    ].join(',');

    const offenders: { selector: string; width: number; height: number }[] = [];

    for (const element of document.querySelectorAll(selector)) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      // Excepción de destino en línea de WCAG 2.5.5.
      if (style.display === 'inline') continue;
      if (element.closest('[aria-hidden="true"]')) continue;

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const smallerSide = Math.min(rect.width, rect.height);
      if (smallerSide + 0.5 >= min) continue;

      const label =
        element.getAttribute('aria-label') ?? (element.textContent ?? '').trim().slice(0, 40);
      offenders.push({
        selector: `${element.tagName.toLowerCase()}[${label}]`,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }

    return offenders;
  }, minimum);
}

test.describe('layout responsive', () => {
  for (const route of ROUTES) {
    test(`${route.path} no desborda en horizontal`, async ({ page }) => {
      await open(page, route);

      const widths = await measureWidths(page);

      // Se registra el número medido aunque el test pase: es la evidencia de
      // que la comprobación se hizo sobre esta ruta y no sobre otra.
      test.info().annotations.push({
        type: 'scrollWidth',
        description: `${route.path} · document ${widths.documentScrollWidth}px / viewport ${widths.innerWidth}px${
          widths.contentScrollWidth === null
            ? ''
            : ` · contenido ${widths.contentScrollWidth}px / ${widths.contentClientWidth}px`
        }`,
      });
      console.log(
        `[responsive:${test.info().project.name}] ${route.path} scrollWidth=${widths.documentScrollWidth} innerWidth=${widths.innerWidth}` +
          (widths.contentScrollWidth === null
            ? ''
            : ` contentScrollWidth=${widths.contentScrollWidth} contentClientWidth=${widths.contentClientWidth}`),
      );

      expect(
        widths.documentScrollWidth,
        `${route.path}: el documento mide ${widths.documentScrollWidth}px sobre un viewport de ${widths.innerWidth}px`,
      ).toBeLessThanOrEqual(widths.innerWidth + TOLERANCE);

      // El shell del panel recorta (`overflow-hidden`), así que el documento no
      // puede desbordar aunque el contenido sí lo haga: la región scrolleable
      // se mide aparte o la primera aserción no probaría nada dentro del panel.
      if (widths.contentScrollWidth !== null && widths.contentClientWidth !== null) {
        expect(
          widths.contentScrollWidth,
          `${route.path}: el contenido del panel mide ${widths.contentScrollWidth}px sobre ${widths.contentClientWidth}px de columna`,
        ).toBeLessThanOrEqual(widths.contentClientWidth + TOLERANCE);
      }

      const offenders = await findOverflowingElements(page, TOLERANCE);
      expect(offenders, `${route.path}: elementos que se salen por la derecha`).toEqual([]);
    });
  }

  test('los controles interactivos llegan al mínimo táctil', async ({ page }) => {
    test.skip(!isMobile(), 'El mínimo de 44px se exige en la pantalla que se toca con el dedo.');

    for (const route of ROUTES) {
      await open(page, route);
      const offenders = await findSmallTouchTargets(page, MIN_TOUCH_PX);
      expect(
        offenders,
        `${route.path}: controles por debajo de ${MIN_TOUCH_PX}px en su lado menor`,
      ).toEqual([]);
    }
  });
});

test.describe('navegación del shell', () => {
  test('en móvil el paso actual queda visible dentro del rail', async ({ page }) => {
    test.skip(!isMobile(), 'El auto-scroll se prueba en el rail horizontal móvil.');
    await mockApi(page, { user: buildAuthUser() });
    await page.goto('/historial');
    const current = page
      .getByRole('navigation', { name: 'Progreso operativo' })
      .locator('[aria-current="step"]');
    await expect(current).toBeVisible();
    await expect
      .poll(() =>
        current.evaluate((element) => {
          const rail = element.closest('[data-testid="timeline-scroll"]');
          if (!rail) return false;
          const item = element.getBoundingClientRect();
          const viewport = rail.getBoundingClientRect();
          return item.left >= viewport.left && item.right <= viewport.right;
        }),
      )
      .toBe(true);
  });

  test('en móvil la navegación vive en un cajón que se abre, opera y se cierra', async ({
    page,
  }) => {
    test.skip(!isMobile(), 'En escritorio el sidebar es fijo; no hay cajón que probar.');

    await mockApi(page, { user: buildAuthUser() });
    await page.goto('/panel');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Resumen del expediente' }),
    ).toBeVisible({
      timeout: APP_BOOT_TIMEOUT,
    });

    // El sidebar de 244px no se muestra, y en su lugar hay un botón de menú.
    await expect(page.getByTestId('panel-sidebar')).toBeHidden();
    const menuButton = page.getByRole('button', { name: 'Abrir menú' });
    await expect(menuButton).toBeVisible();

    await menuButton.click();

    const drawerNav = page.getByRole('navigation', { name: 'Secciones del panel' });
    await expect(drawerNav).toBeVisible();
    await expect(drawerNav.getByRole('link', { name: 'Resumen' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // El foco entra al cajón: sin eso, quien navega con teclado o lector de
    // pantalla seguiría en la página de detrás mientras el diálogo tapa todo.
    const focusInsideDrawer = await page.evaluate(() => {
      const drawer = document.querySelector('[data-slot="sheet-content"]');
      return Boolean(drawer && document.activeElement && drawer.contains(document.activeElement));
    });
    expect(focusInsideDrawer, 'el foco debe quedar atrapado dentro del cajón').toBe(true);

    // Navegar cierra el cajón y deja la pantalla nueva debajo, sin capa encima.
    await drawerNav.getByRole('link', { name: 'Evidencias' }).click();
    await expect(page).toHaveURL(/\/evidencias$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Evidencias' })).toBeVisible();
    await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);

    // Y `Escape` también lo cierra, que es el contrato de cualquier diálogo.
    await menuButton.click();
    await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
  });

  test('en escritorio el sidebar es fijo y no hay botón de menú', async ({ page }) => {
    test.skip(isMobile(), 'El sidebar fijo solo existe a partir de 1024px.');

    await mockApi(page, { user: buildAuthUser() });
    await page.goto('/panel');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Resumen del expediente' }),
    ).toBeVisible({
      timeout: APP_BOOT_TIMEOUT,
    });

    await expect(page.getByTestId('panel-sidebar')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Secciones del panel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toHaveCount(0);
  });
});

test.describe('evidencia visual y accesibilidad en móvil', () => {
  const CAPTURES = [
    {
      path: '/panel',
      name: 'overview.png',
      heading: 'Resumen del expediente',
      authenticated: true,
    },
    {
      path: '/divulgacion',
      search: ASSET_SEARCH,
      name: 'disclosure.png',
      heading: 'Divulgación selectiva',
      authenticated: true,
    },
    {
      path: `/verify/${VERIFY_CODE}`,
      name: 'verify.png',
      heading: 'Verificación pública',
      authenticated: false,
    },
  ] as const;

  for (const capture of CAPTURES) {
    test(`captura móvil de ${capture.path}`, async ({ page }) => {
      test.skip(!isMobile(), 'Las capturas de escritorio ya las producen los otros specs.');

      if (capture.authenticated) await mockApi(page, { user: buildAuthUser() });
      await page.goto(`${capture.path}${'search' in capture ? capture.search : ''}`);
      await expect(page.getByRole('heading', { level: 1, name: capture.heading })).toBeVisible({
        timeout: APP_BOOT_TIMEOUT,
      });

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, capture.name), fullPage: true });
    });
  }

  /**
   * El desglose se captura **con datos y a la vista**.
   *
   * Dos motivos para que esta captura no sea como las otras. Sin cuotas
   * divulgadas, `/borrowing-base` solo enseña el estado vacío, que es justo la
   * parte que el apilado en móvil no ejercita: se selecciona un deudor entero y
   * se ejecuta el recómputo. Y `fullPage` no alcanza el desglose, porque en el
   * panel quien scrollea es la región de contenido y no el documento —el shell
   * es `h-dvh overflow-hidden`—, así que hay que traer la lista al viewport
   * antes de disparar la captura o la evidencia mostraría otra cosa.
   */
  test('captura móvil de /borrowing-base con el desglose calculado', async ({ page }) => {
    test.skip(!isMobile(), 'Las capturas de escritorio ya las producen los otros specs.');

    await mockApi(page, { user: buildAuthUser() });
    await page.goto(`/divulgacion${ASSET_SEARCH}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Divulgación selectiva' }),
    ).toBeVisible({
      timeout: APP_BOOT_TIMEOUT,
    });
    await page.getByRole('button', { name: 'Supermercados Andinos SAC' }).click();

    // El desglose se calcula sobre las hojas que devuelve el servidor al
    // construir el multiproof: sin prueba construida no hay nada que recomputar
    // y la captura mostraría el estado vacío.
    await page.getByRole('button', { name: /^Construir prueba/ }).click();
    await expect(page.getByText('Prueba construida')).toBeVisible();

    // Se navega por el cajón y no con `page.goto`: la prueba construida vive en
    // memoria del proveedor, así que una recarga completa la perdería y la
    // captura volvería a mostrar el estado vacío.
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page
      .getByRole('navigation', { name: 'Secciones del panel' })
      .getByRole('link', { name: 'Recómputo Stylus' })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Recómputo del borrowing base' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ejecutar recómputo' }).click();

    const breakdown = page.getByRole('list', { name: 'Desglose del borrowing base' });
    const borrowingBaseRow = breakdown.getByRole('listitem').filter({ hasText: 'Base prestable' });
    await expect(borrowingBaseRow).toBeVisible();

    await borrowingBaseRow.scrollIntoViewIfNeeded();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'borrowing-base.png') });
  });

  /**
   * Auditoría de `/verify/:code` en móvil.
   *
   * Es la pantalla pública: la que un tercero abre desde su teléfono sin cuenta
   * y sin contexto. Igual que el spec de accesibilidad del login, **informa y
   * no bloquea** todavía; las violaciones quedan adjuntas al reporte.
   */
  test('axe sobre /verify/:code en móvil (informe)', async ({ page }, testInfo) => {
    test.skip(!isMobile(), 'La auditoría móvil de la pantalla pública corre en el proyecto móvil.');

    await page.goto(`/verify/${VERIFY_CODE}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Verificación pública' })).toBeVisible(
      {
        timeout: APP_BOOT_TIMEOUT,
      },
    );

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    await testInfo.attach('axe-verify-mobile.json', {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });

    for (const violation of results.violations) {
      testInfo.annotations.push({
        type: 'a11y',
        description: `${violation.id} (${violation.impact}) · ${violation.nodes.length} nodo(s) · ${violation.help}`,
      });
      console.log(
        `[axe:mobile] ${violation.id} (${violation.impact}) — ${violation.help}\n      ${violation.nodes
          .map((node) => node.target.join(' '))
          .join('\n      ')}`,
      );
    }

    if (results.violations.length === 0) {
      console.log('[axe:mobile] sin violaciones wcag2a/2aa/21a/21aa en /verify/:code');
    }
  });

  test('axe sobre timeline autenticada en móvil', async ({ page }) => {
    test.skip(!isMobile(), 'La auditoría autenticada móvil corre en el proyecto móvil.');
    await mockApi(page, { user: buildAuthUser() });
    await page.goto('/prestamo');
    await page.getByRole('navigation', { name: 'Progreso operativo' }).waitFor();
    const results = await new AxeBuilder({ page })
      .include('[data-testid="operational-timeline"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
