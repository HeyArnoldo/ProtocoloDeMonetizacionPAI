import { describe, expect, it } from 'vitest';
import { UserRole } from '@app/contracts';
import { buildOperationalTimeline } from './operational-timeline';

describe('operational timeline truth mapping', () => {
  it('does not fake preceding completion from a later current route', () => {
    const steps = buildOperationalTimeline({ pathname: '/prestamo', role: UserRole.PYME });
    expect(steps.find((step) => step.id === 'loan')?.status).toBe('current');
    expect(steps.filter((step) => step.status === 'completed')).toEqual([]);
  });

  it('marks only completion proven by persisted and on-chain state', () => {
    const steps = buildOperationalTimeline({
      pathname: '/divulgacion',
      role: UserRole.ADMIN,
      assetEvidenceCount: 1,
      registrationConfirmed: true,
      attestationKinds: ['REVENUE_VERIFIED', 'RIGHTS_ASSIGNABLE', 'SERVICE_CONTINUITY'],
      certificateValid: true,
      disclosureVerified: true,
      borrowingBaseComputed: true,
      loanState: 'Repaid',
    });
    expect(steps.map(({ status }) => status)).toEqual([
      'completed',
      'completed',
      'completed',
      'current',
      'completed',
      'completed',
      'completed',
      'available',
    ]);
  });

  it('does not complete evidence from an unrelated owner-global inventory', () => {
    expect(
      buildOperationalTimeline({ pathname: '/panel', role: UserRole.PYME }).find(
        (step) => step.id === 'evidence',
      ),
    ).toMatchObject({ status: 'available' });
    expect(
      buildOperationalTimeline({
        pathname: '/panel',
        role: UserRole.PYME,
        assetEvidenceCount: 1,
      }).find((step) => step.id === 'evidence'),
    ).toMatchObject({ status: 'completed' });
  });

  it('separates repayment completion from public verification', () => {
    const steps = buildOperationalTimeline({
      pathname: '/historial',
      role: UserRole.PYME,
      loanState: 'Repaid',
    });
    expect(steps.find((step) => step.id === 'repayment')).toMatchObject({
      label: 'Repago',
      actor: 'PYME',
      status: 'current',
    });
    expect(steps.find((step) => step.id === 'verification')).toMatchObject({
      label: 'Verificación pública',
      actor: 'Público',
      status: 'available',
    });
  });

  it('labels base prestable for the actor that can access its route', () => {
    const pyme = buildOperationalTimeline({ pathname: '/panel', role: UserRole.PYME });
    const fund = buildOperationalTimeline({ pathname: '/panel', role: UserRole.FUND });
    expect(pyme.find((step) => step.id === 'borrowing-base')).toMatchObject({
      actor: 'PYME',
      href: '/borrowing-base',
    });
    expect(fund.find((step) => step.id === 'borrowing-base')).toMatchObject({
      href: undefined,
    });
  });

  it('keeps inaccessible actor stages visible but not clickable', () => {
    const certifier = buildOperationalTimeline({
      pathname: '/certificacion',
      role: UserRole.CERTIFIER,
    });
    expect(certifier.find((step) => step.id === 'evidence')).toMatchObject({
      href: undefined,
      status: 'waiting',
    });
    expect(certifier.find((step) => step.id === 'certification')).toMatchObject({
      href: '/certificacion',
      status: 'current',
    });
  });
});
