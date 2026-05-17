# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Package scaffold: TypeScript strict, tsup dual ESM/CJS build, Vitest, ESLint + Prettier, CI.
- `constants/` module: `SCHEMA_VERSION`, `ACTIONS`, `EVENTS`, `ENTITY_TYPES`, `PRIORITY` + `PRIORITY_ALIASES`, `TABS`, `RETURN_VARS` + `RETURN_VAR_TYPES`, `ANDROID_ACTIONS`, `SOURCE_APPS`, `UPDATED_FIELDS`, with narrow literal types and matching `Action`/`Event`/`EntityType`/`PriorityLevel`/`Tab`/`ReturnVar`/`AndroidAction`/`SourceApp`/`UpdatedField` type exports.
- `constants/return-vars.ts`: split into `QUERY_RETURN_VARS` (10) and `UNIVERSAL_RETURN_VARS` (4) with `RETURN_VARS` combining them. Added `%dg_success` (boolean), `%dg_task_id` (string), `%dg_error` (string) per the spec's "Return variables (inbound actions)" table. `RETURN_VAR_TYPES` now accepts `'boolean'` as a value type.
