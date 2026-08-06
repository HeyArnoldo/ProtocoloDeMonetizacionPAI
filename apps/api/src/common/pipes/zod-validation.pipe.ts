import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { ZodError } from 'zod';

/**
 * Valida el body/params contra un schema Zod (de @app/contracts).
 * Uso: @Body(new ZodValidationPipe(miSchema)) input: MiInput
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.issues.map((e) => `${e.path.map(String).join('.')}: ${e.message}`);
        throw new BadRequestException(messages);
      }
      throw new BadRequestException('Validation failed');
    }
  }
}
