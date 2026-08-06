import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { isGoogleEnabled, isLocalAuthEnabled } from '../../config/auth-flags';

/**
 * Si Google OAuth está apagado, sus rutas devuelven 404 limpio en vez del
 * error 500 "Unknown authentication strategy" de passport.
 * IMPORTANTE: va ANTES de AuthGuard('google') en @UseGuards.
 */
@Injectable()
export class GoogleEnabledGuard implements CanActivate {
  canActivate(): boolean {
    if (!isGoogleEnabled()) throw new NotFoundException();
    return true;
  }
}

/** Idem para register/login locales cuando AUTH_LOCAL_ENABLED=false. */
@Injectable()
export class LocalAuthEnabledGuard implements CanActivate {
  canActivate(): boolean {
    if (!isLocalAuthEnabled()) throw new NotFoundException();
    return true;
  }
}
