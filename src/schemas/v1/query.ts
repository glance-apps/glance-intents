import { z } from 'zod';

// Per spec: "`query` takes no parameters in v1. Future versions may add a
// `scope` field; consumers should not send unknown fields." Strict mode
// enforces the unknown-field rejection.
export const QuerySchema = z.object({}).strict();

export type QueryPayload = z.infer<typeof QuerySchema>;
