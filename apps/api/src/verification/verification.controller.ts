import { verificationAssetIdSchema, type PublicVerificationResponse } from '@app/contracts';
import { Controller, Get, Param } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { VerificationService } from './verification.service';

@Controller('verification/assets')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get(':assetId')
  get(
    @Param('assetId', new ZodValidationPipe(verificationAssetIdSchema)) assetId: string,
  ): Promise<PublicVerificationResponse> {
    return this.verification.get(assetId);
  }
}
