// Subpath barrel: `@agntcms/next/config`
//
// Re-exports the user-facing configuration utilities: `defineConfig` for
// registering sections and adapters in `agntcms/config.ts`, and
// `withagntcms` for wrapping `next.config.ts`.
//
// CLIENT-SAFE INVARIANT: this module MUST NOT pull `node:fs`, `node:path`,
// `node:crypto`, or any FS adapter implementation into its bundle. The
// `/config` subpath is reachable from client bundles (a `'use client'`
// section component can transitively import a field-type constructor
// from here), so any `node:*` static import reachable from this barrel
// breaks `next build` with "Module not found: Can't resolve 'fs'". The
// fix that prevents regression: import directly from `./config/defineConfig`
// and `./config/withagntcms` rather than through the `./config/index`
// barrel — the barrel re-exports the FS adapter factories from
// `./config/defaults`, and we want zero chance of those leaking through
// tree-shaking gaps.
//
// FS-backed factories (`createDefaultContentAdapter`,
// `createDefaultAssetAdapter`) are server-only and live on
// `@agntcms/next/server`.
//
// Named `_config.ts` at the source level to avoid ambiguity with the
// `config/` directory in bundler module resolution. The tsup entry point
// maps this file to the `config` subpath export.

export { defineConfig } from './config/defineConfig'
export type {
  AgentCmsConfig,
  ResolvedConfig,
} from './config/defineConfig'
export { withagntcms } from './config/withagntcms'
// `deriveHandlerDeps` is a pure function (no node:* imports, just a
// `type`-only import from `./defineConfig`), so it's safe to re-export from
// the client-safe `/config` subpath.
export { deriveHandlerDeps } from './config/derive'
export type { HandlerDerivations } from './config/derive'

// Field-type constructors. Available from `/config` for parity with
// `defineConfig`/`defineSection` — keeps user-facing authoring imports
// for `agntcms/sections/*` on a single subpath.
export {
  TextField,
  RichTextField,
  ImageField,
  VideoField,
  ReferenceField,
  LinkField,
  ButtonField,
  NumberField,
  BooleanField,
  ListField,
  SelectField,
} from './domain/index'
