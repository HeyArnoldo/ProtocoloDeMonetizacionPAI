// Genera los dos binarios sociales que se versionan en `public/`:
//   - `og-image.png` (1200x630) desde `scripts/og-image.html`
//   - `apple-touch-icon.png` (180x180) desde `public/favicon.svg`, porque iOS
//     no acepta un favicon SVG y pinta un recuadro blanco si no lo encuentra.
//
// Se usa Playwright, que ya es dependencia del paquete para los e2e, en vez de
// añadir una cadena de herramientas de imagen: la plantilla es HTML y CSS, así
// que se renderiza con el mismo motor que el panel y no hay una segunda
// definición del sistema visual que mantener.
//
// El PNG se versiona. Generarlo en cada build ataría el despliegue a que la
// fuente remota esté disponible, y una imagen social rota no avisa: solo se ve
// mal en el enlace compartido.
//
//   pnpm --filter @app/web og:generate

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const template = resolve(here, 'og-image.html');
const output = resolve(here, '../public/og-image.png');

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});

await page.goto(`file://${template}`);
// Sin esta espera, Inter puede no haber cargado y el PNG sale con la fuente
// del sistema: la diferencia es sutil y pasa desapercibida hasta producción.
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: output });

// El icono de iOS se rasteriza desde el mismo SVG que el favicon, para que no
// haya dos definiciones de la marca que puedan divergir.
//
// El SVG se inserta en linea dentro de un HTML, no se abre directo ni se
// referencia con `file://`. Abrirlo directo lo pinta a su tamaño intrínseco
// (32px) en la esquina de una página blanca, y Chromium bloquea un `file://`
// como subrecurso de una página sin origen. En ambos casos el icono sale roto
// sin que el script falle, que es la peor forma de romperse.
const icon = resolve(here, '../public/favicon.svg');
const iconOutput = resolve(here, '../public/apple-touch-icon.png');
const iconPage = await browser.newPage({ viewport: { width: 180, height: 180 } });
await iconPage.setContent(
  `<html><head><style>
     body { margin: 0 }
     /* Las reglas CSS ganan a los atributos width/height del propio SVG. */
     svg { width: 180px; height: 180px; display: block }
   </style></head><body>${await readFile(icon, 'utf8')}</body></html>`,
);
await iconPage.screenshot({ path: iconOutput });

await browser.close();

console.log(`og-image escrita en ${output}`);
console.log(`apple-touch-icon escrito en ${iconOutput}`);
