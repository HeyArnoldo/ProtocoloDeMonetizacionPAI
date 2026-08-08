import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Env } from '../config/env.validation';
import { EvidenceController } from './evidence.controller';
import { Evidence } from './evidence.entity';
import { EvidenceService } from './evidence.service';
import { EVIDENCE_STORAGE } from './evidence-storage.port';
import { S3EvidenceStorage } from './s3-evidence.storage';

@Module({
  imports: [TypeOrmModule.forFeature([Evidence])],
  controllers: [EvidenceController],
  providers: [
    EvidenceService,
    {
      provide: EVIDENCE_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new S3EvidenceStorage({
          endpoint: config.get('STORAGE_ENDPOINT', { infer: true }),
          region: config.get('STORAGE_REGION', { infer: true }),
          bucket: config.get('STORAGE_BUCKET', { infer: true }),
          accessKey: config.get('STORAGE_ACCESS_KEY', { infer: true }),
          secretKey: config.get('STORAGE_SECRET_KEY', { infer: true }),
          forcePathStyle: config.get('STORAGE_FORCE_PATH_STYLE', { infer: true }),
        }),
    },
  ],
  exports: [EvidenceService, TypeOrmModule],
})
export class EvidenceModule {}
