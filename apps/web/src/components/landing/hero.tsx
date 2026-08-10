import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from './reveal';
import { HeroBackground } from './hero-background';
import { TypewriterHeadline, type TypewriterToken } from './typewriter-headline';

const HEADLINE_TOKENS: TypewriterToken[] = [
  { text: 'Tu banco no tiene' },
  { br: true },
  { text: 'que creerte.' },
  { br: true },
  // Un solo color para todo el remate — antes "Puede" salía en blanco y
  // "verificarlo" en acento, dos tonos partiendo la misma frase.
  { text: 'Puede verificarlo.', className: 'text-brand-400' },
];

/**
 * El CTA secundario manda a `/verify`, la entrada neutral: es la única pantalla
 * que no pide sesión, así que es la que de verdad se puede tocar sin
 * credenciales antes de entrar.
 *
 * A `/verify` y no a `/verify/:code` con un identificador de ejemplo. La página
 * exige un `assetId` bytes32 y rechaza cualquier otra cosa, así que un código
 * legible mandaría al visitante a un error de validación; y como todavía no hay
 * activos publicados, un bytes32 válido daría 404 igual.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Cuatro fotos reales rotando con crossfade — no una sola fija.
          Fotos distintas al carrusel de "Detrás de cada expediente" (b1-b4,
          no a1-a4): la landing muestra negocios reales en dos lugares
          distintos, no repite las mismas cuatro caras. */}
      <HeroBackground />
      <div
        aria-hidden="true"
        className="from-background via-background/78 to-background absolute inset-0 -z-10 bg-gradient-to-b"
      />
      {/* Viñeta radial extra, centrada en el bloque de texto: la foto tiene
          zonas claras (delantal, pared) que bajo el texto en blanco y negrita
          pueden perder contraste. Esta capa oscurece justo detrás de la
          columna de texto sin apagar la foto en los bordes. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 700px 420px at 50% 46%, color-mix(in srgb, var(--nocturne-bg) 78%, transparent), transparent 75%)',
        }}
      />
      <div
        aria-hidden="true"
        className="bg-brand-600/25 absolute top-1/2 left-1/2 -z-10 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
      />

      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-28 text-center sm:py-36">
        <Reveal>
          <span className="border-brand-700/60 bg-brand-500/10 text-brand-300 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            PAI × ARBITRUM · Track DeFi / RWA
          </span>
        </Reveal>

        <Reveal delayMs={80}>
          <TypewriterHeadline
            tokens={HEADLINE_TOKENS}
            className="text-4xl leading-[1.1] font-extrabold tracking-tight text-balance sm:text-6xl"
          />
        </Reveal>

        <Reveal delayMs={160}>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed sm:text-lg">
            La cadena no reemplaza al abogado ni al registro público — reemplaza la necesidad de
            confiar en el operador de la plataforma. El monto prestable deja de ser un número que
            alguien afirma, y pasa a ser una función que el prestamista recomputa él mismo.
          </p>
        </Reveal>

        <Reveal delayMs={240} className="flex flex-col gap-3 pt-2 sm:flex-row">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link to="/login">
              Entrar al panel
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className="rounded-full px-6">
            <Link to="/verify">Ver verificación pública, sin cuenta</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
