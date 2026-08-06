import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.uuid(),
});
export type IdParam = z.infer<typeof idParamSchema>;
