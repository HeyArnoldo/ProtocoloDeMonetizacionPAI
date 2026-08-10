import { UserRole } from '@app/contracts';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const user = (email: string, role: UserRole): User => ({ id: 'user-id', email, role }) as User;

describe('AuthService role mapping', () => {
  const previous = { ...process.env };

  afterEach(() => {
    process.env.ADMIN_EMAIL = previous.ADMIN_EMAIL;
    process.env.CERTIFIER_EMAILS = previous.CERTIFIER_EMAILS;
    process.env.FUND_EMAILS = previous.FUND_EMAILS;
    jest.restoreAllMocks();
  });

  it('promotes an allowlisted Google account', async () => {
    process.env.CERTIFIER_EMAILS = 'cert@example.com';
    const googleUser = user('cert@example.com', UserRole.PYME);
    const users = {
      upsertFromGoogle: jest.fn().mockResolvedValue(googleUser),
      save: jest.fn().mockResolvedValue(googleUser),
    } as unknown as UsersService;
    const jwt = { sign: jest.fn().mockReturnValue('token') } as unknown as JwtService;

    const result = await new AuthService(users, jwt).loginWithGoogle({
      googleId: 'google-id',
      email: googleUser.email,
      name: 'Certifier',
      avatarUrl: null,
    });

    expect(result.user.role).toBe(UserRole.CERTIFIER);
    expect(users.save).toHaveBeenCalledWith(googleUser);
  });

  it('does not demote an existing role when no allowlist matches', async () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.CERTIFIER_EMAILS;
    delete process.env.FUND_EMAILS;
    const googleUser = user('fund@example.com', UserRole.FUND);
    const users = {
      upsertFromGoogle: jest.fn().mockResolvedValue(googleUser),
      save: jest.fn(),
    } as unknown as UsersService;
    const jwt = { sign: jest.fn().mockReturnValue('token') } as unknown as JwtService;

    await new AuthService(users, jwt).loginWithGoogle({
      googleId: 'google-id',
      email: googleUser.email,
      name: 'Fund',
      avatarUrl: null,
    });

    expect(googleUser.role).toBe(UserRole.FUND);
    expect(users.save).not.toHaveBeenCalled();
  });
});
