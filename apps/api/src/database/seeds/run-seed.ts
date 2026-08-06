import '../../config/load-env';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@app/contracts';
import dataSource from '../../config/typeorm.config';
import { User } from '../../users/user.entity';

/**
 * Seed idempotente del admin inicial — seguro de correr en cada arranque:
 * - ADMIN_EMAIL + ADMIN_PASSWORD → crea/asegura un admin local.
 * - Solo ADMIN_EMAIL → no crea nada: ese correo recibe rol admin en su
 *   primer login con Google (whitelist, ver AuthService.roleFor).
 */
async function run(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  if (!email) {
    console.log('[seed] ADMIN_EMAIL no definido — no se crea admin.');
    return;
  }

  await dataSource.initialize();
  const repo = dataSource.getRepository(User);
  const existing = await repo.findOne({ where: { email } });

  if (existing) {
    if (existing.role !== UserRole.ADMIN) {
      existing.role = UserRole.ADMIN;
      await repo.save(existing);
      console.log(`[seed] rol admin asegurado para ${email}`);
    } else {
      console.log(`[seed] admin ya existe: ${email}`);
    }
  } else if (process.env.ADMIN_PASSWORD) {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
    await repo.save(
      repo.create({
        email,
        name: process.env.ADMIN_NAME ?? 'Admin',
        passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, rounds),
        role: UserRole.ADMIN,
      }),
    );
    console.log(`[seed] admin local creado: ${email}`);
  } else {
    console.log(`[seed] sin ADMIN_PASSWORD — ${email} será admin al entrar con Google.`);
  }

  await dataSource.destroy();
}

run().catch((err) => {
  console.error('[seed] error:', err);
  process.exit(1);
});
