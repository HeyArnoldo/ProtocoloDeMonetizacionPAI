import type { Ref } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, LockKeyhole } from 'lucide-react';
import type { PresentationFlowStep } from '@/domain/presentation-flow';
import { CardKicker, PanelCard } from './panel-card';
import { HashValue } from './hash-value';
import { PendingData } from './pending-data';
import { cn } from '@/lib/utils';

/** Mismos rótulos que el timeline del shell: un estado no puede llamarse distinto en dos sitios. */
const STATUS_LABEL: Record<PresentationFlowStep['status'], string> = {
  current: 'Etapa actual',
  completed: 'Completado y comprobado',
  available: 'Disponible, pendiente',
  waiting: 'Continúa otro actor',
};

export interface FlowStepCardProps {
  step: PresentationFlowStep;
  /** Dónde está la demo, según la evidencia. */
  isCurrent: boolean;
  /** Dónde está mirando quien presenta. Es otra cosa, y se pinta distinto. */
  isFocused: boolean;
  ref?: Ref<HTMLDivElement>;
  onFocus?: () => void;
}

/**
 * Una etapa del guion, en una tarjeta.
 *
 * **Dos marcas que no se pueden confundir.** `isCurrent` es dónde está la demo
 * —lo decide la evidencia, no la navegación— y se pinta con una barra de
 * acento a la izquierda más el rótulo escrito «Aquí está la demo». `isFocused`
 * es dónde está el cursor del teclado y se pinta con un anillo. Se distinguen
 * por forma y por texto, no solo por color: quien no distingue el matiz tiene
 * que poder leer cuál es cuál.
 *
 * El CTA solo existe cuando el timeline resolvió un `href` para el rol. Un
 * botón que lleva a una pantalla prohibida es una promesa rota en vivo.
 */
export function FlowStepCard({ step, isCurrent, isFocused, ref, onFocus }: FlowStepCardProps) {
  const headingId = `flow-step-${step.id}`;

  return (
    <PanelCard
      // `group` con `aria-labelledby`: la tarjeta es un contenedor enfocable y
      // necesita anunciar de qué paso es antes de leer su contenido.
      role="group"
      aria-labelledby={headingId}
      ref={ref}
      data-testid="flow-step"
      data-step-id={step.id}
      data-current={isCurrent || undefined}
      data-focused={isFocused || undefined}
      // Tabulación itinerante: un solo punto de tabulación para las ocho
      // tarjetas, y de ahí en adelante manda el teclado. Ocho paradas extra
      // antes de llegar al primer enlace harían inservible el Tab.
      tabIndex={isFocused ? 0 : -1}
      onFocus={onFocus}
      className={cn(
        'h-full w-full gap-3 border-l-2 border-l-transparent outline-none',
        'focus-visible:ring-brand-400 focus-visible:ring-2',
        isCurrent && 'border-l-primary bg-brand-950/40',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'mono grid size-6 flex-none place-items-center rounded-full border text-[10px]',
            step.status === 'current' && 'border-brand-400 bg-brand-800 text-brand-100',
            step.status === 'completed' && 'border-emerald-500/70 bg-emerald-950 text-emerald-300',
            step.status === 'available' && 'border-ink-600 text-ink-300',
            step.status === 'waiting' && 'border-ink-800 text-ink-600',
          )}
          aria-hidden="true"
        >
          {step.status === 'completed' ? (
            <Check className="size-3.5" />
          ) : step.status === 'waiting' ? (
            <LockKeyhole className="size-3" />
          ) : (
            step.position
          )}
        </span>

        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={headingId} className="text-[14px] leading-tight font-medium">
            {/* El número ya está en la insignia, pero esa es `aria-hidden` y
                además se convierte en un tilde al completarse. Acá viaja solo
                para el lector de pantalla, que si no anunciaría ocho títulos
                sin decir en cuál de los ocho pasos está. */}
            <span className="sr-only">Paso {step.position}: </span>
            {step.label}
          </h2>
          <p className="text-muted-foreground text-[11px]">
            {step.actor} · {STATUS_LABEL[step.status]}
          </p>
        </div>
      </div>

      {/* La frase que se dice en voz alta. Es cita textual del documento, así
          que va en un `blockquote` con su procedencia al pie: quien la busque
          tiene que poder encontrarla donde dice. */}
      <blockquote className="border-ink-800 flex flex-col gap-1 border-l pl-2.5">
        <p className="text-[13px] leading-relaxed text-balance">«{step.phrase}»</p>
        <cite className="text-ink-400 mono text-[10px] not-italic">
          caso-de-uso-hackathon.md {step.source}
          {step.cue ? ` · ${step.cue}` : ' · fuera del guion cronometrado'}
        </cite>
      </blockquote>

      {step.artifacts.length > 0 ? (
        <dl className="flex flex-col gap-1.5">
          {step.artifacts.map((artifact) => (
            <div key={artifact.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground text-[10px] tracking-[0.08em] uppercase">
                {artifact.label}
              </dt>
              <dd className="min-w-0">
                {artifact.hash ? (
                  <HashValue value={artifact.value} href={artifact.href} />
                ) : (
                  <span className="mono text-[11.5px] break-all">{artifact.value}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <PendingData
          title={`${step.label}: sin artefacto verificable`}
          reason={step.pending!.reason}
          unblockedBy={step.pending!.unblockedBy}
        />
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 pt-1">
        {isCurrent ? (
          <CardKicker className="text-primary">Aquí está la demo</CardKicker>
        ) : (
          <span aria-hidden="true" />
        )}

        {step.href ? (
          <Link
            to={step.href}
            // El rótulo nombra la etapa: ocho enlaces «Abrir pantalla» son ocho
            // destinos indistinguibles en la lista de enlaces del lector.
            aria-label={`Abrir pantalla: ${step.label}`}
            className="text-brand-300 hover:bg-background focus-visible:ring-brand-400 -mr-1.5 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1.5 text-[12px] outline-none focus-visible:ring-2 lg:min-h-9"
          >
            Abrir pantalla
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <span className="text-ink-500 min-h-11 py-3 text-[11px] lg:min-h-0 lg:py-0">
            Sin acceso con este rol
          </span>
        )}
      </div>
    </PanelCard>
  );
}
