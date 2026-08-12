import { UserRole, type ChainAssetSnapshotResponse } from '@app/contracts';
import { canAccessPanelRoute } from '@/config/navigation';

export type TimelineStatus = 'current' | 'completed' | 'available' | 'waiting';
export type TimelineStepId =
  | 'evidence'
  | 'dossier'
  | 'certification'
  | 'disclosure'
  | 'borrowing-base'
  | 'loan'
  | 'repayment'
  | 'verification';

export interface TimelineStep {
  id: TimelineStepId;
  label: string;
  actor: string;
  status: TimelineStatus;
  href?: string;
}

export interface TimelineEvidence {
  pathname: string;
  role: UserRole;
  assetEvidenceCount?: number;
  registrationConfirmed?: boolean;
  attestationKinds?: string[];
  certificateValid?: boolean;
  disclosureVerified?: boolean;
  borrowingBaseComputed?: boolean;
  loanState?: 'Pledged' | 'Funded' | 'Repaid' | 'Defaulted';
}

const definitions = [
  { id: 'evidence', label: 'Evidencias', actor: 'PYME', path: '/evidencias' },
  { id: 'dossier', label: 'Expediente / registro', actor: 'PYME', path: '/expediente' },
  {
    id: 'certification',
    label: 'Certificación',
    actor: '3 independientes',
    path: '/certificacion',
  },
  { id: 'disclosure', label: 'Divulgación', actor: 'PYME', path: '/divulgacion' },
  { id: 'borrowing-base', label: 'Base prestable', actor: 'PYME', path: '/borrowing-base' },
  { id: 'loan', label: 'Préstamo / fondeo', actor: 'Fondo + PYME', path: '/prestamo' },
  { id: 'repayment', label: 'Repago', actor: 'PYME', path: '/historial' },
  { id: 'verification', label: 'Verificación pública', actor: 'Público', path: '/verify' },
] as const;

const routeStep: Record<string, TimelineStepId> = {
  '/evidencias': 'evidence',
  '/expediente': 'dossier',
  '/certificacion': 'certification',
  '/divulgacion': 'disclosure',
  '/borrowing-base': 'borrowing-base',
  '/prestamo': 'loan',
  '/historial': 'repayment',
  '/verify': 'verification',
};

export function buildOperationalTimeline(input: TimelineEvidence): TimelineStep[] {
  const activeKinds = new Set(input.attestationKinds ?? []);
  const proven: Record<TimelineStepId, boolean> = {
    evidence: (input.assetEvidenceCount ?? 0) > 0,
    dossier: input.registrationConfirmed === true,
    certification:
      activeKinds.has('REVENUE_VERIFIED') &&
      activeKinds.has('RIGHTS_ASSIGNABLE') &&
      activeKinds.has('SERVICE_CONTINUITY') &&
      input.certificateValid === true,
    disclosure: input.disclosureVerified === true,
    'borrowing-base': input.borrowingBaseComputed === true,
    loan: ['Pledged', 'Funded', 'Repaid'].includes(input.loanState ?? ''),
    repayment: input.loanState === 'Repaid',
    verification: false,
  };
  const current = routeStep[input.pathname];

  return definitions.map((definition) => {
    const accessible = canAccessPanelRoute(definition.path, input.role);
    return {
      id: definition.id,
      label: definition.label,
      actor: definition.actor,
      href: accessible ? definition.path : undefined,
      status:
        definition.id === current
          ? 'current'
          : proven[definition.id]
            ? 'completed'
            : accessible
              ? 'available'
              : 'waiting',
    };
  });
}

export function timelineSnapshotEvidence(snapshot?: ChainAssetSnapshotResponse) {
  return {
    attestationKinds: snapshot?.attestations.map((item) => item.kind),
    certificateValid: snapshot?.certificate.supported ? snapshot.certificate.valid : false,
    loanState: snapshot?.loan.supported ? snapshot.loan.value?.state : undefined,
  };
}
