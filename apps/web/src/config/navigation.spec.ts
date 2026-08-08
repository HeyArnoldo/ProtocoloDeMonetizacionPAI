import { describe, expect, it } from 'vitest';
import { UserRole } from '@app/contracts';
import { canAccessPanelRoute, navigationForRole, roleLandingPath } from './navigation';

const paths = (role: UserRole) =>
  navigationForRole(role).flatMap((group) => group.items.map((item) => item.path));

describe('role-aware panel navigation', () => {
  it('maps each persona to only its supported panel routes', () => {
    expect(paths(UserRole.PYME)).toEqual([
      '/',
      '/expediente',
      '/evidencias',
      '/divulgacion',
      '/prestamo',
      '/historial',
      '/borrowing-base',
      '/actividad',
      '/verify/PAI-8F3C-2026',
    ]);
    expect(paths(UserRole.CERTIFIER)).toEqual(['/certificacion', '/verify/PAI-8F3C-2026']);
    expect(paths(UserRole.FUND)).toEqual(['/', '/prestamo', '/actividad', '/verify/PAI-8F3C-2026']);
  });

  it('allows admins everywhere and rejects direct cross-persona access', () => {
    expect(canAccessPanelRoute('/certificacion', UserRole.ADMIN)).toBe(true);
    expect(canAccessPanelRoute('/certificacion', UserRole.PYME)).toBe(false);
    expect(canAccessPanelRoute('/evidencias', UserRole.FUND)).toBe(false);
    expect(canAccessPanelRoute('/disclosure', UserRole.PYME)).toBe(true);
  });

  it('selects a valid landing page for every authenticated role', () => {
    expect(roleLandingPath(UserRole.PYME)).toBe('/');
    expect(roleLandingPath(UserRole.CERTIFIER)).toBe('/certificacion');
    expect(roleLandingPath(UserRole.FUND)).toBe('/');
  });
});
