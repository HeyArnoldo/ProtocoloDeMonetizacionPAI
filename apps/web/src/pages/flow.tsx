import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type KeyboardEvent } from 'react';
import { DEMO_OPENING } from '@/config/demo-script';
import { buildPresentationFlow } from '@/domain/presentation-flow';
import { useMe } from '@/hooks/use-auth';
import { useAssetPortfolio } from '@/hooks/use-disclosure';
import { useOperationalEvidence } from '@/hooks/use-operational-evidence';
import { chainStatusQuery } from '@/services/chain.api';
import { CardKicker, PanelCard } from '@/components/panel/panel-card';
import { FlowStepCard } from '@/components/panel/flow-step-card';
import { NetworkStatus } from '@/components/panel/network-status';

/**
 * Modo presentación: el guion entero en una pantalla.
 *
 * **Por qué existe.** Quien presenta tenía que acordarse del orden de las ocho
 * pantallas y navegar a mano por el sidebar delante del jurado. Acá cada paso
 * trae su frase, su estado real y el botón que lo abre.
 *
 * **De dónde salen los pasos.** De `buildOperationalTimeline()`, vía
 * `buildPresentationFlow()`. Esta vista no declara ninguna etapa: si lo hiciera
 * habría dos listas que empezarían a discrepar, y el panel terminaría
 * contradiciéndose sobre su propio flujo.
 *
 * **El estado de cadena no es un noveno paso.** El minuto 0:00 del guion es una
 * precondición —a qué altura leyó el panel—, no una etapa que la PYME ejecute.
 * Va en la banda de cabecera, con el mismo `NetworkStatus` del sidebar.
 */
export default function FlowPage() {
  // `ProtectedRoute` no monta esta página sin sesión: acá el usuario existe.
  const { data: user } = useMe();
  const { evidence, snapshot, assetId } = useOperationalEvidence(user!.role);
  const { data: chainStatus } = useQuery(chainStatusQuery);
  const { data: asset } = useAssetPortfolio(assetId);

  const flow = buildPresentationFlow({
    ...evidence,
    chain: {
      // El root que vale es el que está escrito en el AssetRegistry, no el que
      // el navegador recomputó: es el que el jurado puede abrir.
      merkleRoot: snapshot?.registry.merkleRoot,
      registrationTxHash: asset?.registrationTxHash,
      loanPrincipal: snapshot?.loan.supported ? snapshot.loan.value?.principal : undefined,
      explorerBaseUrl: chainStatus?.status === 'live' ? chainStatus.explorerBaseUrl : undefined,
    },
  });

  const currentIndex = Math.max(
    0,
    flow.steps.findIndex((step) => step.id === flow.currentStepId),
  );
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  // Hasta que alguien toque una flecha, el foco sigue a la demo. Después manda
  // quien presenta: mirar el paso 7 mientras la demo está en el 3 es legítimo.
  const focusedIndex = chosenIndex ?? currentIndex;

  function handleKeyDown(event: KeyboardEvent<HTMLOListElement>) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;

    // Se frena el scroll horizontal del navegador, no la tabulación: `Tab`
    // nunca pasa por acá y sigue recorriendo la página en orden de documento.
    event.preventDefault();
    const next = Math.min(flow.steps.length - 1, Math.max(0, focusedIndex + delta));
    setChosenIndex(next);
    cardRefs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <PanelCard className="gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardKicker>{DEMO_OPENING.cue} · precondición, no una etapa del flujo</CardKicker>
          <p className="text-[13px] leading-relaxed text-balance">«{DEMO_OPENING.phrase}»</p>
          <p className="text-muted-foreground text-[11.5px] leading-relaxed">
            Muévete entre pasos con <kbd className="mono text-ink-300">←</kbd> y{' '}
            <kbd className="mono text-ink-300">→</kbd>. La barra de acento marca dónde está la demo;
            el anillo, dónde estás mirando.
          </p>
        </div>

        {/* El mismo componente del pie del sidebar: el estado de la cadena se
            lee de un solo sitio, y acá solo cambia el ancho que se le da. */}
        <div className="w-full flex-none lg:max-w-[320px]">
          <NetworkStatus />
        </div>
      </PanelCard>

      <ol
        aria-label="Pasos del guion de demo"
        data-testid="presentation-flow"
        onKeyDown={handleKeyDown}
        className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        {flow.steps.map((step, index) => (
          <li key={step.id} className="flex min-w-0">
            <FlowStepCard
              step={step}
              isCurrent={step.id === flow.currentStepId}
              isFocused={index === focusedIndex}
              onFocus={() => setChosenIndex(index)}
              ref={(node) => {
                cardRefs.current[index] = node;
              }}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
