import { z } from 'zod';

export const CompleteSchema = z
  .object({
    title: z.string().min(1),
    completed_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type CompletePayload = z.infer<typeof CompleteSchema>;
