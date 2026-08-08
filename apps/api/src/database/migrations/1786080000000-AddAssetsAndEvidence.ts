import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssetsAndEvidence1786080000000 implements MigrationInterface {
  name = 'AddAssetsAndEvidence1786080000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "evidence" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdById" uuid NOT NULL, "objectKey" character varying(700) NOT NULL, "originalName" character varying(255) NOT NULL, "mimeType" character varying(160) NOT NULL, "sizeBytes" bigint NOT NULL, "sha256" character(66) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_evidence_object_key" UNIQUE ("objectKey"), CONSTRAINT "PK_evidence" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "assets" ("id" character(66) NOT NULL, "createdById" uuid NOT NULL, "creationKey" character(66) NOT NULL, "ownerIdHash" character(66) NOT NULL, "controller" character(42) NOT NULL, "debtorSalt" character(66) NOT NULL, "merkleRoot" character(66) NOT NULL, "registrationTxHash" character(66), "registrationConfirmed" boolean NOT NULL DEFAULT false, "registrationBlockNumber" bigint, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_assets_creation_key" UNIQUE ("creationKey"), CONSTRAINT "PK_assets" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "receivables" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "assetId" character(66) NOT NULL, "evidenceId" uuid NOT NULL, "position" integer NOT NULL, "debtorTaxId" character varying(64) NOT NULL, "debtorLabel" character varying(120) NOT NULL, "amountMinor" numeric(78,0) NOT NULL, "dueDate" date NOT NULL, "currency" smallint NOT NULL, "docHash" character(66) NOT NULL, CONSTRAINT "UQ_receivables_asset_position" UNIQUE ("assetId", "position"), CONSTRAINT "PK_receivables" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "receivables" ADD CONSTRAINT "FK_receivables_asset" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "receivables" ADD CONSTRAINT "FK_receivables_evidence" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE RESTRICT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "receivables" DROP CONSTRAINT "FK_receivables_evidence"`);
    await queryRunner.query(`ALTER TABLE "receivables" DROP CONSTRAINT "FK_receivables_asset"`);
    await queryRunner.query(`DROP TABLE "receivables"`);
    await queryRunner.query(`DROP TABLE "assets"`);
    await queryRunner.query(`DROP TABLE "evidence"`);
  }
}
