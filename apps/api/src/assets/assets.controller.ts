import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  createAssetSchema,
  type AssetListResponse,
  type AssetResponse,
  type ChainAssetSnapshotResponse,
  type CreateAssetInput,
} from '@app/contracts';
import { UserRole } from '@app/contracts';
import type { SerializedIntent } from '../chain/chain-intent.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AssetsService } from './assets.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '../users/user.entity';

@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PYME, UserRole.ADMIN)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post()
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createAssetSchema)) input: CreateAssetInput,
  ): Promise<AssetResponse> {
    return this.assets.create(user.id, input);
  }

  // Va antes que `@Get(':id')`: Nest resuelve por orden de declaración y `:id`
  // capturaría la raíz si se declarara primero.
  @Get()
  list(@CurrentUser() user: User): Promise<AssetListResponse> {
    return this.assets.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string): Promise<AssetResponse> {
    return this.assets.get(user, id);
  }

  @Get(':id/chain')
  chainSnapshot(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<ChainAssetSnapshotResponse> {
    return this.assets.chainSnapshot(user, id);
  }

  @Get(':id/certification-chain')
  @Roles(UserRole.CERTIFIER, UserRole.ADMIN)
  certificationSnapshot(@Param('id') id: string): Promise<ChainAssetSnapshotResponse> {
    return this.assets.certificationSnapshot(id);
  }

  @Post(':id/registration-intent')
  registrationIntent(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<SerializedIntent> {
    return this.assets.registrationIntent(user, id);
  }

  @Post(':id/confirm-registration')
  confirmRegistration(@CurrentUser() user: User, @Param('id') id: string): Promise<AssetResponse> {
    return this.assets.confirmRegistration(user, id);
  }
}
