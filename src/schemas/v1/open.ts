import { z } from 'zod';

// `tab` is optional. The spec contradicts itself — the field table marks it
// required, but the tab-names section says `glance` is the default "if tab
// is omitted or unrecognized." Resolving in favor of the permissive section:
// omitted and unrecognized both fall back to `glance` in the handler. Empty
// string remains a validation failure (distinct from omitted).
export const OpenSchema = z
  .object({
    tab: z.string().min(1).optional(),
  })
  .strict();

export type OpenPayload = z.infer<typeof OpenSchema>;
