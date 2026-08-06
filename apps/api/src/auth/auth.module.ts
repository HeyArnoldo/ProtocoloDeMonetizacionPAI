import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { expiresToMs } from '../config/app.config';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { isGoogleEnabled } from '../config/auth-flags';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        // En segundos (number): el tipo StringValue de jsonwebtoken no acepta string plano.
        signOptions: {
          expiresIn: Math.floor(expiresToMs(process.env.JWT_EXPIRES_IN ?? '7d') / 1000),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  // GoogleStrategy solo se registra si hay credenciales: passport lanza error
  // al instanciar la estrategia con clientID vacío.
  providers: [AuthService, JwtStrategy, ...(isGoogleEnabled() ? [GoogleStrategy] : [])],
})
export class AuthModule {}
