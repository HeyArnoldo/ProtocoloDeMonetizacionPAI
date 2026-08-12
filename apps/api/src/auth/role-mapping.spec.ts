import { UserRole } from '@app/contracts';
import { configuredRoleEntries, roleForEmail } from './role-mapping';

const env = {
  ADMIN_EMAIL: 'ADMIN@example.com',
  CERTIFIER_EMAILS: ' cert@example.com, shared@example.com ',
  FUND_EMAILS: 'fund@example.com,shared@example.com',
};

describe('roleForEmail', () => {
  it.each([
    ['admin@example.com', UserRole.ADMIN],
    ['CERT@example.com', UserRole.CERTIFIER],
    ['fund@example.com', UserRole.FUND],
    ['unknown@example.com', UserRole.PYME],
  ])('maps %s to %s', (email, expected) => {
    expect(roleForEmail(email, env)).toBe(expected);
  });

  // Docker Compose y Coolify entregan '' cuando la variable se declara y nadie
  // la rellena. Una entrada en blanco daría el rol a cualquier email vacío.
  it('ignores empty allowlists without inventing a blank entry', () => {
    const emptyEnv = { ADMIN_EMAIL: '', CERTIFIER_EMAILS: '', FUND_EMAILS: '' };

    expect(roleForEmail('anyone@example.com', emptyEnv)).toBe(UserRole.PYME);
    expect(configuredRoleEntries(emptyEnv)).toEqual([]);
  });

  it('deduplicates entries with deterministic role precedence', () => {
    expect(configuredRoleEntries(env)).toEqual([
      { email: 'admin@example.com', role: UserRole.ADMIN },
      { email: 'cert@example.com', role: UserRole.CERTIFIER },
      { email: 'shared@example.com', role: UserRole.CERTIFIER },
      { email: 'fund@example.com', role: UserRole.FUND },
    ]);
  });
});
