import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({ title: z.string().min(1) });
  const pipe = new ZodValidationPipe(schema);

  it('deja pasar un payload válido (y descarta campos extra)', () => {
    const result = pipe.transform({ title: 'Hola', hacker: true });
    expect(result).toEqual({ title: 'Hola' });
  });

  it('rechaza un payload inválido con BadRequestException', () => {
    expect(() => pipe.transform({ title: '' })).toThrow(BadRequestException);
  });
});
