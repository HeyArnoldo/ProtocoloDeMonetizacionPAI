import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { createAssetSchema, type AssetResponse, type CreateAssetInput } from '@app/contracts';
import { UserRole } from '@app/contracts';
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

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string): Promise<AssetResponse> {
    return this.assets.get(user.id, id);
  }
}
