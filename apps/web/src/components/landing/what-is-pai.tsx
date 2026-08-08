import { FileCheck2 } from 'lucide-react';
import { CodeBlock } from '@/components/panel/code-block';
import { Reveal } from './reveal';
import { ImpactImage } from './impact-image';

/** Fragmento real del manifiesto — mismos campos que documenta el protocolo. */
const MANIFEST_LINES = [
  { label: 'assetId', value: 'PAI-8F3C-2026' },
  { label: 'merkleRoot', value: '0x7a3f…e91c', muted: true },
  { label: 'leaves', value: '18 cuotas · 216 hojas' },
  { label: 'certifiers', value: '3 / 3 vigentes' },
  { label: 'status', value: 'Attested' },
] as const;

export function WhatIsPai() {
  return (
    <section
      id="que-es-pai"
      aria-labelledby="what-is-heading"
      className="mx-auto max-w-6xl scroll-mt-14 px-6 py-24"
    >
      {/* La columna de la imagen pesa más que la del texto (1fr vs 1.2fr) a
          propósito: es una captura real del panel, más ancha le da más
          impacto sin apretar el texto de al lado. */}
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.2fr]">
        <Reveal className="flex flex-col gap-4">
          <p className="text-brand-400 text-xs font-semibold tracking-wider uppercase">
            Qué es PAI
          </p>
          <h2 id="what-is-heading" className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Un expediente digital verificable, no un marketplace de tokens
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            PAI convierte cuentas por cobrar —el activo intangible más fácil de verificar— en un
            expediente con identidad, evidencia, certificación y estado, todo trazable en Arbitrum.
            No hay token negociable, no hay fraccionamiento: el objetivo es que un banco pueda
            evaluar un activo que hoy no acepta como garantía, sin tener que confiar en la palabra
            de nadie.
          </p>
          <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
            {[
              'Sin marketplace ni token negociable en el MVP',
              'La ley y el contrato siguen viviendo fuera de la cadena',
              'La cadena aporta integridad y trazabilidad, no propiedad legal',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <FileCheck2 className="text-brand-400 mt-0.5 size-4 flex-none" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delayMs={120} className="relative">
          <div className="border-ink-800 bg-card overflow-hidden rounded-2xl border">
            {/* Captura real del panel corriendo (Divulgación selectiva) —
                no un mockup dibujado. Se ancla arriba-izquierda: ahí vive el
                sidebar y el encabezado, lo que hace reconocible que es la
                app real y no una imagen de stock. */}
            {/* Proporción real de la captura (1906×1020 ≈ 1.87:1) — forzarla a
                un aspecto distinto es lo que la recortaba. Con la proporción
                exacta, `object-cover` no tiene nada que recortar. */}
            <ImpactImage
              src="/landing/base1.png"
              alt="Captura real del panel de PAI, pantalla de divulgación selectiva"
              className="aspect-[1906/1020] w-full"
            />
          </div>
          <div className="border-ink-800 bg-card absolute -bottom-4 -left-4 hidden w-48 rounded-xl border p-2.5 shadow-xl sm:block">
            <p className="text-muted-foreground mb-1.5 text-[9px] tracking-[0.1em] uppercase">
              Manifiesto del expediente
            </p>
            <CodeBlock lines={[...MANIFEST_LINES]} className="text-[10px]" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
