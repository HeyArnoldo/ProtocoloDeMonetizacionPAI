import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Evidence } from '../evidence/evidence.entity';
import { Asset } from './asset.entity';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { Receivable } from './receivable.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, Receivable, Evidence])],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService, TypeOrmModule],
})
export class AssetsModule {}
