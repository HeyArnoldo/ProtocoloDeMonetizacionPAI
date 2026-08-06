import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { GoogleProfileData } from '../../users/users.service';

/**
 * Solo se registra como provider si isGoogleEnabled() (ver auth.module.ts).
 * Instanciarla con clientID vacío lanza error: por eso el registro condicional.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3000/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('La cuenta de Google no expone un email'), undefined);
      return;
    }
    const data: GoogleProfileData = {
      googleId: profile.id,
      email,
      name: profile.displayName ?? email,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };
    // req.user = data (lo consume el callback del AuthController)
    done(null, data);
  }
}
