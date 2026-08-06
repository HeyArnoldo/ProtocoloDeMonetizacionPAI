import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../users/user.entity';

/** Inyecta el usuario autenticado (lo deja JwtStrategy.validate en req.user). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User =>
    ctx.switchToHttp().getRequest<{ user: User }>().user,
);
