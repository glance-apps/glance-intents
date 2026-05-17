// Versioned namespace. Consumers reach a specific protocol version via
// `schemas.v1.CreateSchema`. When v2 ships, `v2` lives alongside `v1` here.
//
// Flat exports of the v1 schemas (e.g. `CreateSchema`) live on the root
// package surface (`src/index.ts`), not here, so this file stays focused on
// the version-namespacing concern.
export * as v1 from './v1/index.js';
