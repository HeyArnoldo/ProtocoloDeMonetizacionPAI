import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandUserRoles1786160000000 implements MigrationInterface {
  name = 'ExpandUserRoles1786160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('pyme', 'certifier', 'fund', 'admin')`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING (CASE WHEN "role"::text = 'user' THEN 'pyme' ELSE "role"::text END)::"public"."users_role_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'pyme'`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`,
    );
    await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'user')`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING (CASE WHEN "role"::text = 'admin' THEN 'admin' ELSE 'user' END)::"public"."users_role_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
  }
}
