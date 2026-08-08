import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@app/contracts';
import { RolesGuard } from './roles.guard';

const context = (role?: UserRole) =>
  ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  it.each([UserRole.PYME, UserRole.CERTIFIER, UserRole.FUND, UserRole.ADMIN])(
    'allows the required %s role',
    (role) => {
      const reflector = { getAllAndOverride: () => [role] } as unknown as Reflector;
      expect(new RolesGuard(reflector).canActivate(context(role))).toBe(true);
    },
  );

  it('denies a different role', () => {
    const reflector = {
      getAllAndOverride: () => [UserRole.CERTIFIER],
    } as unknown as Reflector;
    expect(() => new RolesGuard(reflector).canActivate(context(UserRole.PYME))).toThrow(
      ForbiddenException,
    );
  });

  it('allows routes without role metadata', () => {
    const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(context())).toBe(true);
  });
});
