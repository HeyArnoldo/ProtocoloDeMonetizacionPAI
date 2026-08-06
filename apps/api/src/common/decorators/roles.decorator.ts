import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@app/contracts';

export const ROLES_KEY = 'roles';

/** Restringe la ruta a los roles indicados. Usar junto con RolesGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
