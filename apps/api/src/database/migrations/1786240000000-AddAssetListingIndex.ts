import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índice para `GET /assets`.
 *
 * El listado filtra por `createdById` —salvo para el ADMIN, que no filtra— y
 * siempre ordena por `createdAt DESC`. Sin este índice, cada apertura de la
 * pantalla de expedientes cuesta un sequential scan más un sort en memoria.
 *
 * El orden de las columnas no es intercambiable: `createdById` primero porque
 * es la igualdad, `createdAt` después porque es el orden. Al revés, Postgres no
 * podría usarlo para el filtro de la PYME.
 *
 * Sin `DESC`: un btree se recorre hacia atrás igual de bien, y así el índice
 * coincide exactamente con el `@Index` de la entidad. Si divergieran, el
 * próximo `migration:generate` propondría borrarlo y volverlo a crear.
 */
export class AddAssetListingIndex1786240000000 implements MigrationInterface {
  name = 'AddAssetListingIndex1786240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_assets_created_by_created_at" ON "assets" ("createdById", "createdAt")`,
    );
    // El agregado del listado (COUNT y SUM) se apoya en el join por `assetId`,
    // que hoy solo tiene la clave foránea y el índice único (assetId, position).
    // El único cubre este acceso, así que no se crea uno nuevo.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_assets_created_by_created_at"`);
  }
}
