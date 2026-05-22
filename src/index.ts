// Public API surface for @glance-apps/intents.
//
// Every export here is intentional, documented, and governed by semver.
// Module-internal helpers stay in their respective files and are not
// re-exported.
//
// Two ways to reach a v1 schema:
//   - flat: `import { CreateSchema } from '@glance-apps/intents'`
//   - versioned: `import { schemas } from '@glance-apps/intents'`
//                then `schemas.v1.CreateSchema`
// The versioned form leaves room for `schemas.v2.*` to coexist when the
// protocol bumps to v2.

export * from './constants/index.js';
export * from './crypto/index.js';
export * from './idempotency/index.js';
export * from './normalize/index.js';
export * from './schemas/v1/index.js';
export * from './webdav/index.js';

export * as schemas from './schemas/index.js';
