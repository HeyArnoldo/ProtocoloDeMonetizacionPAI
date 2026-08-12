import { describe, expect, it } from 'vitest';
import { UserRole } from '@app/contracts';
import { buildOperationalTimeline } from './operational-timeline';
import { buildPresentationFlow, type PresentationFlowInput } from './presentation-flow';

/**
 * Base mínima: la vista vive en `/flujo`, que no es ninguna etapa del flujo.
 * Cada test añade solo la evidencia que necesita para no arrastrar estado que
 * no está probando.
 */
const base: PresentationFlowInput = { pathname: '/flujo', role: UserRole.PYME };

const stepOf = (input: PresentationFlowInput, id: string) => {
  const step = buildPresentationFlow(input).steps.find((item) => item.id === id);
  if (!step) throw new Error(`No existe el paso ${id}`);
  return step;
};

describe('presentation flow', () => {
  it('delegates the eight steps to the operational timeline instead of redefining them', () => {
    const flow = buildPresentationFlow(base);
    const timeline = buildOperationalTimeline(base);

    expect(flow.steps.map((step) => step.id)).toEqual(timeline.map((step) => step.id));
    expect(flow.steps.map((step) => step.label)).toEqual(timeline.map((step) => step.label));
    expect(flow.steps.map((step) => step.actor)).toEqual(timeline.map((step) => step.actor));
    expect(flow.steps.map((step) => step.status)).toEqual(timeline.map((step) => step.status));
    expect(flow.steps.map((step) => step.href)).toEqual(timeline.map((step) => step.href));
    expect(flow.steps.map((step) => step.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('carries the demo phrase and the section it was taken from', () => {
    const dossier = stepOf(base, 'dossier');

    expect(dossier.phrase).toBe('Del expediente entero, on-chain viajan 32 bytes');
    expect(dossier.source).toBe('§6');
    expect(dossier.cue).toBe('0:30');
    expect(stepOf(base, 'repayment').cue).toBeNull();
  });

  it('marks a step without a verifiable artifact as pending instead of inventing one', () => {
    const certification = stepOf(base, 'certification');

    expect(certification.artifacts).toEqual([]);
    expect(certification.pending).not.toBeNull();
    expect(certification.status).not.toBe('completed');
  });

  it('publishes the merkle root and the registration tx linked to the explorer', () => {
    const dossier = stepOf(
      {
        ...base,
        registrationConfirmed: true,
        chain: {
          merkleRoot: `0x${'cd'.repeat(32)}`,
          registrationTxHash: `0x${'55'.repeat(32)}`,
          explorerBaseUrl: 'https://sepolia.arbiscan.io',
        },
      },
      'dossier',
    );

    expect(dossier.status).toBe('completed');
    expect(dossier.pending).toBeNull();
    expect(dossier.artifacts).toEqual([
      { label: 'merkleRoot', value: `0x${'cd'.repeat(32)}`, hash: true },
      {
        label: 'Tx de registro',
        value: `0x${'55'.repeat(32)}`,
        hash: true,
        href: `https://sepolia.arbiscan.io/tx/0x${'55'.repeat(32)}`,
      },
    ]);
  });

  it('shows the hash without a link when no explorer base is configured', () => {
    const dossier = stepOf(
      { ...base, chain: { registrationTxHash: `0x${'55'.repeat(32)}` } },
      'dossier',
    );

    expect(dossier.artifacts).toEqual([
      { label: 'Tx de registro', value: `0x${'55'.repeat(32)}`, hash: true },
    ]);
  });

  it('reads the funded principal in token units, never in cents', () => {
    const loan = stepOf(
      { ...base, loanState: 'Funded', chain: { loanPrincipal: '35000000000' } },
      'loan',
    );

    expect(loan.artifacts).toEqual([
      { label: 'Principal fondeado', value: 'USD 35,000.00' },
      { label: 'Estado del préstamo', value: 'Funded' },
    ]);
  });

  it('points at the first unproven step when the view is not a stage of the flow', () => {
    const flow = buildPresentationFlow({ ...base, assetEvidenceCount: 3 });

    expect(flow.steps[0]!.status).toBe('completed');
    expect(flow.currentStepId).toBe('dossier');
  });

  it('respects the stage the timeline already marks as current', () => {
    const flow = buildPresentationFlow({ ...base, pathname: '/divulgacion' });

    expect(flow.currentStepId).toBe('disclosure');
  });

  it('leaves a step the role cannot open without a route to open it', () => {
    const flow = buildPresentationFlow({ ...base, role: UserRole.FUND });
    const certification = flow.steps.find((step) => step.id === 'certification')!;

    expect(certification.href).toBeUndefined();
    expect(certification.phrase).not.toBe('');
  });
});
