import { z } from 'zod';

// The spec's field table marks `tab` as required, but the tab-names table says
// `glance` is the default "if tab is omitted or unrecognized". The handler
// owns both fallback paths. The schema enforces presence + non-empty; it does
// NOT restrict to known TABS values, so callers using a future tab name (added
// in a minor protocol bump) still validate.
export const OpenSchema = z
  .object({
    tab: z.string().min(1),
  })
  .strict();

export type OpenPayload = z.infer<typeof OpenSchema>;
