import { DEMO_SCRIPT } from '@/config/demo-script';
import {
  buildOperationalTimeline,
  type TimelineEvidence,
  type TimelineStep,
  type TimelineStepId,
} from './operational-timeline';
import { formatTokenUnits } from './money';

/**
 * Composición del modo presentación.
 *
 * **No define etapas.** Las ocho salen de `buildOperationalTimeline()`, que ya
 * deriva su estado de evidencia real y resuelve el enlace por rol. Una segunda
 * lista de etapas se desincronizaría de la primera en la primera semana y el
 * panel empezaría a contradecirse a sí mismo. Acá solo se les cuelga encima lo
 * que la vista necesita y el timeline no tiene por qué saber: la frase del
 * guion y el artefacto que se puede abrir delante del jurado.
 *
 * La regla que gobierna `docs/caso-de-uso-hackathon.md` gobierna también este
 * archivo: **nada que no se pueda abrir en Arbiscan**. Un artefacto se emite
 * solo cuando su valor existe; cuando no existe, el paso viaja con el motivo
 * de por qué falta y la vista lo pinta como pendiente. En ningún camino se
 * fabrica un hash, un monto ni una URL.
 */

export interface FlowArtifact {
  label: string;
  value: string;
  /** Se pinta truncado y monoespaciado: es un hash o una dirección. */
  hash?: boolean;
  /** Enlace al explorador. Ausente cuando no hay base configurada. */
  href?: string;
}

/** Valores leídos de la cadena que el timeline no expone porque no los necesita. */
export interface FlowChainEvidence {
  merkleRoot?: string | null;
  registrationTxHash?: string | null;
  /** Principal en unidades del token (6 decimales), no en centavos. */
  loanPrincipal?: string | null;
  /** Base del explorador que devuelve `GET /api/chain/status`. */
  explorerBaseUrl?: string | null;
}

export interface PresentationFlowInput extends TimelineEvidence {
  chain?: FlowChainEvidence;
}

export interface PresentationFlowStep extends TimelineStep {
  /** 1..8. El número que se canta en voz alta. */
  position: number;
  phrase: string;
  source: string;
  cue: string | null;
  artifacts: FlowArtifact[];
  /** Presente si y solo si no hay ningún artefacto que mostrar. */
  pending: { reason: string; unblockedBy: string } | null;
}

export interface PresentationFlow {
  steps: PresentationFlowStep[];
  /**
   * Dónde está la demo. No es dónde está el foco del teclado: eso lo lleva la
   * vista, y confundirlos pintaría de «actual» la tarjeta que solo se está
   * mirando.
   */
  currentStepId: TimelineStepId | null;
}

export function buildPresentationFlow(input: PresentationFlowInput): PresentationFlow {
  const timeline = buildOperationalTimeline(input);
  const chain = input.chain ?? {};

  const steps = timeline.map((step, index): PresentationFlowStep => {
    const script = DEMO_SCRIPT[step.id];
    const artifacts = artifactsFor(step.id, input, chain);

    return {
      ...step,
      position: index + 1,
      phrase: script.phrase,
      source: script.source,
      cue: script.cue,
      artifacts,
      pending: artifacts.length > 0 ? null : script.pending,
    };
  });

  return { steps, currentStepId: currentOf(steps) };
}

/**
 * Dos formas de estar en una etapa, en este orden.
 *
 * 1. El timeline ya marcó una como `current` porque la ruta abierta es la
 *    suya. Manda esa: es un hecho de navegación, no una inferencia.
 * 2. `/flujo` no es ninguna etapa, así que ninguna sale `current`. Entonces la
 *    demo está en la primera que todavía no probó nada — la siguiente que hay
 *    que ejecutar, que es justo lo que quien presenta necesita saber.
 */
function currentOf(steps: PresentationFlowStep[]): TimelineStepId | null {
  const navigated = steps.find((step) => step.status === 'current');
  if (navigated) return navigated.id;
  return steps.find((step) => step.status !== 'completed')?.id ?? null;
}

function artifactsFor(
  id: TimelineStepId,
  input: PresentationFlowInput,
  chain: FlowChainEvidence,
): FlowArtifact[] {
  switch (id) {
    case 'evidence':
      // Los archivos no van on-chain y no van a ir: lo verificable acá es
      // cuántas cuotas quedaron respaldadas por un documento.
      return (input.assetEvidenceCount ?? 0) > 0
        ? [{ label: 'Evidencias enlazadas', value: String(input.assetEvidenceCount) }]
        : [];

    case 'dossier':
      return [
        ...hashArtifact('merkleRoot', chain.merkleRoot),
        ...hashArtifact('Tx de registro', chain.registrationTxHash, chain.explorerBaseUrl),
      ];

    case 'certification':
      return (input.attestationKinds ?? []).length > 0
        ? [
            {
              label: 'Atestaciones firmadas',
              value: `${input.attestationKinds!.length} de 3 · ${input.attestationKinds!.join(', ')}`,
            },
          ]
        : [];

    case 'disclosure':
      // El root acompaña a la selección porque el argumento entero de la etapa
      // es que no se movió al divulgar. Sin selección probada no hay nada.
      return input.disclosureVerified === true
        ? [
            { label: 'Multiproof verificado', value: 'Sí, contra el root del expediente' },
            ...hashArtifact('merkleRoot (no cambió)', chain.merkleRoot),
          ]
        : [];

    case 'loan':
      return loanArtifacts(input.loanState, chain.loanPrincipal);

    case 'repayment':
      return input.loanState === 'Repaid'
        ? [{ label: 'Estado del préstamo', value: 'Repaid' }]
        : [];

    // `borrowing-base` y `verification` nunca emiten artefacto, y es
    // deliberado: ver `DEMO_SCRIPT`. Uno calcula en el navegador y el otro se
    // prueba fuera de este panel.
    default:
      return [];
  }
}

function loanArtifacts(
  state: PresentationFlowInput['loanState'],
  principal: string | null | undefined,
): FlowArtifact[] {
  if (!state) return [];

  const amount = principal ? formatTokenUnits(principal) : null;

  return [
    ...(amount ? [{ label: 'Principal fondeado', value: amount }] : []),
    { label: 'Estado del préstamo', value: state },
  ];
}

/**
 * Un hash y, si hay explorador configurado, su enlace.
 *
 * Sin base de explorador el hash viaja igual pero **sin `href`**: componer una
 * URL a mano llevaría al jurado a un 404, que es peor que no ofrecer el enlace.
 */
function hashArtifact(
  label: string,
  value: string | null | undefined,
  explorerBaseUrl?: string | null,
): FlowArtifact[] {
  if (!value) return [];
  const base = explorerBaseUrl?.replace(/\/$/, '');
  return [{ label, value, hash: true, ...(base ? { href: `${base}/tx/${value}` } : {}) }];
}
