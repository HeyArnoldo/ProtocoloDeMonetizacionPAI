import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@app/contracts';
import { AssetsController } from '../../assets/assets.controller';
import { DisclosureController } from '../../disclosure/disclosure.controller';
import { EvidenceController } from '../../evidence/evidence.controller';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

const controllers = [AssetsController, EvidenceController, DisclosureController];

describe('owner surface roles', () => {
  it.each(controllers)('%s permits only pyme and admin', (controller) => {
    expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual([UserRole.PYME, UserRole.ADMIN]);
  });

  it.each([UserRole.CERTIFIER, UserRole.FUND])('denies %s', (role) => {
    const reflector = {
      getAllAndOverride: () => [UserRole.PYME, UserRole.ADMIN],
    } as unknown as Reflector;
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    } as unknown as ExecutionContext;

    expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
  });
});
