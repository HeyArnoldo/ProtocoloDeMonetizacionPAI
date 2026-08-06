import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type {
  DisclosurePreviewRequest,
  DisclosurePreviewResponse,
  SamplePortfolio,
} from '@app/contracts';
import { disclosurePreviewRequestSchema } from '@app/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DisclosureService } from './disclosure.service';

/**
 * Herramienta de la empresa: elige qué cuotas divulgar y arma la prueba.
 * Va detrás de auth — el expediente es suyo. La página pública de
 * verificación (`/verify/:code`) es la que irá abierta.
 */
@Controller('disclosure')
@UseGuards(JwtAuthGuard)
export class DisclosureController {
  constructor(private readonly disclosure: DisclosureService) {}

  @Get('sample')
  sample(): SamplePortfolio {
    return this.disclosure.samplePortfolio();
  }

  /** POST y no GET porque la cartera va en el body, no porque mute algo. */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @Body(new ZodValidationPipe(disclosurePreviewRequestSchema))
    request: DisclosurePreviewRequest,
  ): DisclosurePreviewResponse {
    return this.disclosure.preview(request);
  }
}
