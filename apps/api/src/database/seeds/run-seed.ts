import '../../config/load-env';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@app/contracts';
import dataSource from '../../config/typeorm.config';
import { User } from '../../users/user.entity';
import { configuredRoleEntries } from '../../auth/role-mapping';

/**
 * Synchronizes configured role allowlists. Only the admin may be created
 * locally; certifier/fund accounts receive their role on first registration.
 */
async function run(): Promise<void> {
  const entries = configuredRoleEntries();
  if (entries.length === 0) {
    console.log('[seed] no configured role emails.');
    return;
  }

  await dataSource.initialize();
  const repo = dataSource.getRepository(User);
  for (const { email, role } of entries) {
    const existing = await repo.findOne({ where: { email } });
    if (existing) {
      if (existing.role !== role) await repo.save(Object.assign(existing, { role }));
      console.log(`[seed] ${role} role ensured for ${email}`);
    } else if (role === UserRole.ADMIN && process.env.ADMIN_PASSWORD) {
      const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
      await repo.save(
        repo.create({
          email,
          name: process.env.ADMIN_NAME ?? 'Admin',
          passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, rounds),
          role,
        }),
      );
      console.log(`[seed] local admin created: ${email}`);
    } else {
      console.log(`[seed] ${email} will receive ${role} on first registration.`);
    }
  }

  await dataSource.destroy();
}

run().catch((err) => {
  console.error('[seed] error:', err);
  process.exit(1);
});
