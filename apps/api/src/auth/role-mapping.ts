import { UserRole } from '@app/contracts';

type RoleEnvironment = {
  ADMIN_EMAIL?: string;
  CERTIFIER_EMAILS?: string;
  FUND_EMAILS?: string;
};

const normalize = (email: string): string => email.trim().toLowerCase();

const splitEmails = (value?: string): string[] =>
  (value ?? '').split(',').map(normalize).filter(Boolean);

export function roleForEmail(email: string, env: RoleEnvironment = process.env): UserRole {
  const normalized = normalize(email);
  if (env.ADMIN_EMAIL && normalize(env.ADMIN_EMAIL) === normalized) return UserRole.ADMIN;
  if (splitEmails(env.CERTIFIER_EMAILS).includes(normalized)) return UserRole.CERTIFIER;
  if (splitEmails(env.FUND_EMAILS).includes(normalized)) return UserRole.FUND;
  return UserRole.PYME;
}

export function configuredRoleEntries(
  env: RoleEnvironment = process.env,
): Array<{ email: string; role: UserRole }> {
  const emails = [
    env.ADMIN_EMAIL,
    ...splitEmails(env.CERTIFIER_EMAILS),
    ...splitEmails(env.FUND_EMAILS),
  ]
    .filter((email): email is string => Boolean(email))
    .map(normalize);
  return [...new Set(emails)].map((email) => ({ email, role: roleForEmail(email, env) }));
}
