import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '../assets/asset.entity';
import { DisclosureController } from './disclosure.controller';
import { DisclosureService } from './disclosure.service';

@Module({
  imports: [TypeOrmModule.forFeature([Asset])],
  controllers: [DisclosureController],
  providers: [DisclosureService],
  exports: [DisclosureService],
})
export class DisclosureModule {}
