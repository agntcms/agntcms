// Barrel for the `config/` module. Named exports only (repo code style).
//
// `config/` is a top-level composition module that wires sections and
// storage together. Its import dependencies:
//   - `sections/` (for `AnySectionDefinition` type)
//   - `storage/` (for adapter interfaces and FS adapter factories)
//
// It MUST NOT import from `runtime/`, `handlers/`, `mcp/`, `tasks/`,
// or `react/`.
//
// IMPORTANT: this barrel is INTERNAL — used by `config.test.ts` and
// internal cross-module composition only. The public `/config` subpath
// (`_config.ts`) imports directly from `./defineConfig` and
// `./withagntcms`, deliberately bypassing this barrel so the FS-tied
// `./defaults` re-exports below do NOT land in the client-bundled
// `dist/config.mjs`. See `_config.ts` for the full rationale.
//
// The `installDefaultAdapterFactories()` call below registers the
// FS-backed default adapter factories on the `globalThis` slot read by
// `defineConfig`. Tests that import from this barrel and then call
// `defineConfig({ /* no adapters */ })` rely on this registration.

import { installDefaultAdapterFactories } from './defaults'
installDefaultAdapterFactories()

export { defineConfig } from './defineConfig'
export type {
  AgentCmsConfig,
  ResolvedConfig,
} from './defineConfig'
export { withagntcms } from './withagntcms'
export { deriveHandlerDeps } from './derive'
export type { HandlerDerivations } from './derive'
export {
  createDefaultContentAdapter,
  createDefaultAssetAdapter,
} from './defaults'
export type { DefaultAdapterOptions } from './defaults'
