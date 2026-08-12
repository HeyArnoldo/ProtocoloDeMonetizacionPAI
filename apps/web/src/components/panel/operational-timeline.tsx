import { useEffect, useRef } from 'react';
import { Check, LockKeyhole } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { UserRole } from '@app/contracts';
import { UserRole as Role } from '@app/contracts';
import { useCertificationSnapshot, useChainSnapshot } from '@/hooks/use-disclosure';
import { useDisclosureSelection } from '@/hooks/use-disclosure-selection';
import { buildOperationalTimeline, timelineSnapshotEvidence } from '@/domain/operational-timeline';
import { cn } from '@/lib/utils';

const statusLabel = {
  current: 'Etapa actual',
  completed: 'Completado y comprobado',
  available: 'Disponible, pendiente',
  waiting: 'Continúa otro actor',
} as const;

export function OperationalTimeline({ role }: { role: UserRole }) {
  const { pathname } = useLocation();
  const currentRef = useRef<HTMLLIElement>(null);
  const canReadOwnerData = role === Role.PYME || role === Role.ADMIN;
  const disclosure = useDisclosureSelection();
  const ownerSnapshot = useChainSnapshot(canReadOwnerData ? disclosure.assetId : null);
  const certifierSnapshot = useCertificationSnapshot(
    role === Role.CERTIFIER || role === Role.ADMIN ? disclosure.assetId : null,
  );
  const snapshot = certifierSnapshot.data ?? ownerSnapshot.data;
  const steps = buildOperationalTimeline({
    pathname,
    role,
    assetEvidenceCount: new Set(disclosure.receivables.map((item) => item.evidenceId)).size,
    registrationConfirmed: disclosure.registrationConfirmed,
    disclosureVerified: disclosure.proof?.verified,
    borrowingBaseComputed: disclosure.borrowingBaseComputed,
    ...timelineSnapshotEvidence(snapshot),
  });

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [pathname]);

  return (
    <nav
      aria-label="Progreso operativo"
      className="border-ink-800 mb-4 min-w-0 border-b pb-3 lg:mb-5"
    >
      <div data-testid="timeline-scroll" className="max-w-full overflow-x-auto pb-1">
        <ol className="flex w-max min-w-full gap-1" data-testid="operational-timeline">
          {steps.map((step, index) => {
            const content = (
              <>
                <span
                  className={cn(
                    'grid size-5 flex-none place-items-center rounded-full border text-[9px] font-medium',
                    step.status === 'current' && 'border-brand-400 bg-brand-800 text-brand-100',
                    step.status === 'completed' &&
                      'border-emerald-500/70 bg-emerald-950 text-emerald-300',
                    step.status === 'available' && 'border-ink-600 text-ink-300',
                    step.status === 'waiting' && 'border-ink-800 text-ink-600',
                  )}
                  aria-hidden="true"
                >
                  {step.status === 'completed' ? (
                    <Check className="size-3" />
                  ) : step.status === 'waiting' ? (
                    <LockKeyhole className="size-2.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block whitespace-nowrap text-[11px] font-medium">
                    {step.label}
                  </span>
                  <span className="text-muted-foreground block whitespace-nowrap text-[9px]">
                    {statusLabel[step.status]} · {step.actor}
                  </span>
                </span>
              </>
            );
            return (
              <li
                key={step.id}
                ref={step.status === 'current' ? currentRef : undefined}
                className="flex items-center"
              >
                {step.href ? (
                  <Link
                    to={step.href}
                    aria-current={step.status === 'current' ? 'step' : undefined}
                    className={cn(
                      'hover:bg-card focus-visible:ring-brand-400 flex min-h-11 items-center gap-2 rounded-md px-2.5 outline-none focus-visible:ring-2',
                      step.status === 'current' && 'bg-brand-950/70 text-brand-100',
                      step.status === 'completed' && 'text-emerald-200',
                    )}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    aria-label={`${step.label}: ${statusLabel[step.status]}, ${step.actor}`}
                    className="text-ink-500 flex min-h-11 items-center gap-2 px-2.5"
                  >
                    {content}
                  </div>
                )}
                {index < steps.length - 1 && (
                  <span className="bg-ink-800 h-px w-3 flex-none" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
