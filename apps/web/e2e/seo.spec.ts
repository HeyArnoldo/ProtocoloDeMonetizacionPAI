import { expect, test } from '@playwright/test';

/**
 * Metadatos sociales y de indexación del `index.html`.
 *
 * Existe por un motivo concreto: el `index.html` heredado del template llevaba
 * el título «Template FullStack». Un enlace compartido con ese título no falla
 * en ningún build ni en ningún test — solo se ve mal, y nadie se entera hasta
 * que ya está publicado.
 */

const SITE = 'https://pai.cloud.groowtech.com';

/** Lee el `content` de una etiqueta `meta`, sea `name` o `property`. */
async function metaContent(
  page: import('@playwright/test').Page,
  selector: string,
): Promise<string | null> {
  return page.locator(selector).first().getAttribute('content');
}

test.describe('metadatos del documento', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('el título identifica al producto y no al template', async ({ page }) => {
    const title = await page.title();

    expect(title).toContain('PAI');
    expect(title).toContain('Protocolo de Monetización');
    expect(title.toLowerCase()).not.toContain('template');
  });

  test('la descripción y la URL canónica apuntan al dominio de producción', async ({ page }) => {
    const description = await metaContent(page, 'meta[name="description"]');
    expect(description).toBeTruthy();
    // Por debajo de ~70 caracteres los buscadores la descartan y generan una propia.
    expect(description!.length).toBeGreaterThan(70);
    expect(description!.length).toBeLessThanOrEqual(200);

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE}/`);
  });

  test('el documento declara el tema oscuro antes del primer render', async ({ page }) => {
    // Sin esto el navegador pinta de blanco la barra de direcciones y el fondo
    // mientras carga el bundle, y el panel arranca con un destello claro.
    expect(await metaContent(page, 'meta[name="theme-color"]')).toBe('#161826');
    expect(await metaContent(page, 'meta[name="color-scheme"]')).toBe('dark');
  });

  test('Open Graph está completo y con URLs absolutas', async ({ page }) => {
    expect(await metaContent(page, 'meta[property="og:type"]')).toBe('website');
    expect(await metaContent(page, 'meta[property="og:url"]')).toBe(`${SITE}/`);
    expect(await metaContent(page, 'meta[property="og:title"]')).toContain('PAI');
    expect(await metaContent(page, 'meta[property="og:description"]')).toBeTruthy();

    // Las URLs relativas rompen la previsualización en LinkedIn y Slack.
    const image = await metaContent(page, 'meta[property="og:image"]');
    expect(image).toBe(`${SITE}/og-image.png`);

    // Sin las dimensiones declaradas, varios clientes muestran la tarjeta
    // pequeña en vez de la grande mientras rastrean la imagen.
    expect(await metaContent(page, 'meta[property="og:image:width"]')).toBe('1200');
    expect(await metaContent(page, 'meta[property="og:image:height"]')).toBe('630');
    expect(await metaContent(page, 'meta[property="og:image:alt"]')).toBeTruthy();
  });

  test('la tarjeta de Twitter es la grande', async ({ page }) => {
    expect(await metaContent(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(await metaContent(page, 'meta[name="twitter:image"]')).toBe(`${SITE}/og-image.png`);
  });
});

test.describe('archivos estáticos servidos', () => {
  const files = [
    { path: '/og-image.png', type: 'image/png' },
    { path: '/apple-touch-icon.png', type: 'image/png' },
    { path: '/favicon.svg', type: 'image/svg+xml' },
    { path: '/robots.txt', type: 'text/plain' },
    { path: '/sitemap.xml', type: 'xml' },
  ];

  for (const file of files) {
    test(`${file.path} se sirve y no cae en el fallback de la SPA`, async ({ request }) => {
      const response = await request.get(file.path);

      expect(response.status()).toBe(200);
      // El `try_files` de nginx devolvería el index.html con estado 200 si el
      // archivo no existiera: comprobar el código solo no probaría nada.
      expect(response.headers()['content-type']).toContain(file.type);
    });
  }

  test('la imagen Open Graph mide exactamente 1200x630', async ({ request }) => {
    const png = await (await request.get('/og-image.png')).body();

    // Cabecera PNG: el IHDR trae ancho y alto como enteros de 32 bits big-endian
    // en los offsets 16 y 20. Se lee del binario para que las dimensiones
    // declaradas en el `meta` no puedan mentir sobre el archivo real.
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});
