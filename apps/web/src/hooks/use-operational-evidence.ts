import { useLocation } from 'react-router-dom';
import type { ChainAssetSnapshotResponse, UserRole } from '@app/contracts';
import { UserRole as Role } from '@app/contracts';
import { useCertificationSnapshot, useChainSnapshot } from '@/hooks/use-disclosure';
import { useDisclosureSelection } from '@/hooks/use-disclosure-selection';
import { timelineSnapshotEvidence, type TimelineEvidence } from '@/domain/operational-timeline';

/**
 * La evidencia con la que se decide el progreso del flujo, en un solo sitio.
 *
 * La arma el timeline del shell y la arma el modo presentación. Ensamblarla dos
 * veces sería la misma trampa que redefinir las etapas: dos pantallas leyendo
 * las mismas fuentes con reglas ligeramente distintas terminan afirmando cosas
 * distintas sobre el mismo expediente.
 *
 * Devuelve además la instantánea cruda porque `/flujo` necesita valores que el
 * timeline no expone —el root registrado, el principal del préstamo— y que no
 * tiene por qué exponer: al timeline le basta con saber si la etapa ocurrió.
 */
export interface OperationalEvidence {
  evidence: TimelineEvidence;
  snapshot: ChainAssetSnapshotResponse | undefined;
  assetId: string | null;
}

export function useOperationalEvidence(role: UserRole): OperationalEvidence {
  const { pathname } = useLocation();
  const canReadOwnerData = role === Role.PYME || role === Role.ADMIN;
  const disclosure = useDisclosureSelection();
  const ownerSnapshot = useChainSnapshot(canReadOwnerData ? disclosure.assetId : null);
  const certifierSnapshot = useCertificationSnapshot(
    role === Role.CERTIFIER || role === Role.ADMIN ? disclosure.assetId : null,
  );
  const snapshot = certifierSnapshot.data ?? ownerSnapshot.data;

  return {
    evidence: {
      pathname,
      role,
      // Cuotas respaldadas por un documento distinto, no cuotas a secas.
      assetEvidenceCount: new Set(disclosure.receivables.map((item) => item.evidenceId)).size,
      registrationConfirmed: disclosure.registrationConfirmed,
      disclosureVerified: disclosure.proof?.verified,
      borrowingBaseComputed: disclosure.borrowingBaseComputed,
      ...timelineSnapshotEvidence(snapshot),
    },
    snapshot,
    assetId: disclosure.assetId,
  };
}
