import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import type { DisclosurePreviewResponse, PersistedDisclosurePreviewRequest } from '@app/contracts';
import { persistedDisclosurePreviewRequestSchema, UserRole } from '@app/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DisclosureService } from './disclosure.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '../users/user.entity';

@Controller('disclosure')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PYME, UserRole.ADMIN)
export class DisclosureController {
  constructor(private readonly disclosure: DisclosureService) {}

  @Post(':assetId/preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @CurrentUser() user: User,
    @Param('assetId') assetId: string,
    @Body(new ZodValidationPipe(persistedDisclosurePreviewRequestSchema))
    request: PersistedDisclosurePreviewRequest,
  ): Promise<DisclosurePreviewResponse> {
    return this.disclosure.preview(user.id, assetId, request);
  }
}
