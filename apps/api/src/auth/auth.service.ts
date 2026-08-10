import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { LoginInput, RegisterInput, UserRole } from '@app/contracts';
import { GoogleProfileData, UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { roleForEmail } from './role-mapping';

export interface AuthResult {
  user: User;
  token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  private sign(user: User): string {
    return this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
  }

  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new ConflictException('El email ya está registrado');

    const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
    const user = await this.users.create({
      email: input.email,
      name: input.name,
      passwordHash: await bcrypt.hash(input.password, rounds),
      role: roleForEmail(input.email),
    });
    return { user, token: this.sign(user) };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    // Mismo mensaje para "no existe" y "password mal": no filtrar qué emails existen.
    if (!user?.passwordHash) throw new UnauthorizedException('Credenciales inválidas');

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');
    return { user, token: this.sign(user) };
  }

  async loginWithGoogle(profile: GoogleProfileData): Promise<AuthResult> {
    const user = await this.users.upsertFromGoogle(profile);
    const configured = roleForEmail(user.email);
    if (configured !== UserRole.PYME && user.role !== configured) {
      user.role = configured;
      await this.users.save(user);
    }
    return { user, token: this.sign(user) };
  }
}
