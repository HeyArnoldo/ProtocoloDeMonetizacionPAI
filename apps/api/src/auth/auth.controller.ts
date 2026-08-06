import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import {
  AuthConfig,
  AuthUser,
  LoginInput,
  loginSchema,
  RegisterInput,
  registerSchema,
  UserRole,
} from '@app/contracts';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleEnabledGuard, LocalAuthEnabledGuard } from './guards/auth-flags.guards';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { isGoogleEnabled, isLocalAuthEnabled } from '../config/auth-flags';
import { cookieOptions, SESSION_COOKIE } from '../config/app.config';
import { User } from '../users/user.entity';
import { GoogleProfileData } from '../users/users.service';

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Público: el login del frontend se renderiza según estos flags. */
  @Get('config')
  config(): AuthConfig {
    return { localEnabled: isLocalAuthEnabled(), googleEnabled: isGoogleEnabled() };
  }

  @Post('register')
  @UseGuards(LocalAuthEnabledGuard)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) input: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const { user, token } = await this.auth.register(input);
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    return toAuthUser(user);
  }

  @Post('login')
  @UseGuards(LocalAuthEnabledGuard)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const { user, token } = await this.auth.login(input);
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    return toAuthUser(user);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User): AuthUser {
    return toAuthUser(user);
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    const { maxAge: _omit, ...clear } = cookieOptions();
    res.clearCookie(SESSION_COOKIE, clear);
    return { ok: true };
  }

  /** GET /api/auth/google — redirige a Google. 404 si Google está apagado. */
  @Get('google')
  @UseGuards(GoogleEnabledGuard, AuthGuard('google'))
  googleAuth(): void {
    // El guard de passport redirige a Google.
  }

  /** GET /api/auth/google/callback — Google vuelve acá; seteamos cookie y redirigimos al frontend. */
  @Get('google/callback')
  @UseGuards(GoogleEnabledGuard, AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const profile = req.user as GoogleProfileData;
    const { user, token } = await this.auth.loginWithGoogle(profile);
    res.cookie(SESSION_COOKIE, token, cookieOptions());

    const frontendUrl = (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '');
    // Personaliza el destino post-login según tu app (ej: /admin para admins).
    const redirect = user.role === UserRole.ADMIN ? `${frontendUrl}/` : `${frontendUrl}/`;
    res.redirect(redirect);
  }
}
