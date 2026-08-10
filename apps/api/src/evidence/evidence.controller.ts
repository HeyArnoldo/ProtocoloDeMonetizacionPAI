import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole, type EvidenceResponse } from '@app/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { EvidenceService } from './evidence.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '../users/user.entity';

@Controller('evidence')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PYME, UserRole.ADMIN)
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<EvidenceResponse[]> {
    return this.evidence.list(user.id);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  upload(
    @CurrentUser() user: User,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<EvidenceResponse> {
    if (!file) throw new BadRequestException('A file is required.');
    return this.evidence.upload(user.id, file);
  }
}
