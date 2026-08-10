import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ImpactImage } from './impact-image';
import { Reveal } from './reveal';

interface Photo {
  src: string;
  /** Línea corta sobre la foto en el carrusel. */
  caption: string;
  /** Título del modal — el "antes". */
  title: string;
  /** 1-2 frases: cómo PAI resuelve justo esa escena. El "después". */
  impact: string;
}

/**
 * Las cuatro fotos reales de `public/landing/` (a1–a4): gente real llevando
 * un negocio chico, con las facturas y el papeleo que hoy no cuenta como
 * garantía ante un banco. Cada una mapea a un paso real de "Cómo funciona"
 * — el modal no inventa una historia nueva, cuenta la misma en corto.
 */
const PHOTOS: Photo[] = [
  {
    src: '/landing/a1.png',
    caption: 'Un taller que factura, pero no puede demostrarlo ante un banco',
    title: 'Del cuaderno al expediente verificable',
    impact:
      'Ese registro a mano no sirve como garantía hoy. PAI lo convierte en un expediente digital con una huella criptográfica única — verificable, sin que nadie tenga que confiar en la palabra de nadie.',
  },
  {
    src: '/landing/a2.png',
    caption: 'El papeleo de siempre: facturas, boletas, impuestos',
    title: 'El papeleo se convierte en prueba',
    impact:
      'Facturas, boletas e impuestos no salen nunca del storage cifrado. Solo su huella —32 bytes— queda anotada en Arbitrum. Evidencia real, sin exponer un solo documento.',
  },
  {
    src: '/landing/a3.png',
    caption: 'Horas explicando por teléfono un activo que el banco no entiende',
    title: 'Sin llamadas, sin esperar',
    impact:
      'Nada de explicarle a un analista qué es tu negocio. Tres certificadores atestan por separado, y el fondo verifica la prueba él mismo — en minutos, no en semanas.',
  },
  {
    src: '/landing/a4.png',
    caption: 'Cada factura es un derecho de cobro real — falta poder probarlo',
    title: 'De la factura al desembolso',
    impact:
      'Cada cuota se convierte en una hoja de un árbol de Merkle. Divulgada selectivamente y certificada, se transforma en USDC real a través de CollateralVault.sol.',
  },
];

const TRACK = [...PHOTOS, ...PHOTOS, ...PHOTOS];
/** Misma fórmula que el resto de los marquees: cantidad de tarjetas × 5s. */
const DURATION_S = PHOTOS.length * 5;

export function PhotoCarousel() {
  const [paused, setPaused] = useState(false);
  const [active, setActive] = useState<Photo | null>(null);

  return (
    <section aria-label="Quién está detrás del expediente" className="py-16">
      <Reveal className="mx-auto mb-8 max-w-2xl px-6 text-center">
        <p className="text-brand-400 text-xs font-semibold tracking-wider uppercase">
          Detrás de cada expediente
        </p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
          Negocios reales, no una fila en una base de datos
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">Tocá una foto para ver el detalle</p>
      </Reveal>

      <div className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="from-background pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r to-transparent sm:w-28"
        />
        <div
          aria-hidden="true"
          className="from-background pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l to-transparent sm:w-28"
        />

        <div
          className="animate-landing-marquee flex w-max gap-4 px-6"
          style={{
            animationDuration: `${DURATION_S}s`,
            animationPlayState: paused || active ? 'paused' : 'running',
          }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          // Sin esto, una tarjeta enfocada con Tab sigue moviéndose bajo el
          // anillo de foco — imposible de leer o de tocar con Enter en el
          // momento justo. `onFocus`/`onBlur` de React delegan igual que los
          // de mouse, así que alcanza con ponerlos acá, no en cada botón.
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          {TRACK.map((photo, index) => (
            <button
              key={`${photo.src}-${index}`}
              type="button"
              onClick={() => setActive(photo)}
              className="group focus-visible:ring-ring relative h-[260px] w-[min(340px,78vw)] flex-none overflow-hidden rounded-2xl text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            >
              <ImpactImage
                src={photo.src}
                alt=""
                className="size-full transition-transform duration-700 group-hover:scale-105"
              />
              <div
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-2/3"
                style={{
                  background:
                    'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)',
                }}
              />
              <span className="absolute inset-x-0 bottom-0 p-4 text-[13px] leading-snug text-white/90">
                {photo.caption}
              </span>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="gap-5 sm:max-w-md">
          {active && (
            <>
              <div className="border-ink-800 -mx-6 -mt-6 overflow-hidden rounded-t-lg border-b">
                <ImpactImage src={active.src} alt="" className="h-48 w-full" />
              </div>
              <DialogHeader>
                <DialogTitle>{active.title}</DialogTitle>
                <DialogDescription className="text-foreground text-[13.5px] leading-relaxed">
                  {active.impact}
                </DialogDescription>
              </DialogHeader>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
