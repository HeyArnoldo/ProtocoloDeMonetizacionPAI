import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './config/typeorm.config';
import { validateEnv } from './config/env.validation';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { ChainModule } from './chain/chain.module';
import { DisclosureModule } from './disclosure/disclosure.module';
import { EvidenceModule } from './evidence/evidence.module';
import { AssetsModule } from './assets/assets.module';

@Module({
  imports: [
    // El .env ya fue cargado por load-env (main.ts, primera línea).
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
    TypeOrmModule.forRoot(dataSourceOptions),
    ChainModule,
    EvidenceModule,
    AssetsModule,
    DisclosureModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
})
export class AppModule {}
