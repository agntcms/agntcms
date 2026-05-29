// `defineConfig` — the user-facing configuration factory used in the
// template's `agntcms/config.ts` to register sections and adapters.
//
// ARCHITECTURE.md §3 shows the canonical call site:
//
//   import { defineConfig } from '@agntcms/next/config'
//   import { Hero } from './sections/Hero'
//   export default defineConfig({ sections: [Hero] })
//
// This function resolves user-provided config into a fully-populated
// `ResolvedConfig` with defaults for omitted adapters. It does NOT
// instantiate the runtime — that happens lazily or via a separate factory
// in the runtime layer.
//
// Import policy: this file imports from `../sections/` (for the
// `AnySectionDefinition` type) and from `./defaults-registry` (a
// node-free module that exposes a `globalThis` slot populated by the
// server-only `./defaults.ts`). It MUST NOT statically import
// `./defaults.ts` directly, because doing so would drag `node:fs`,
// `node:fs/promises`, `node:path`, and `node:crypto` into the client
// bundle when a `'use client'` section component transitively imports
// from `@agntcms/next/config` (e.g. via `TextField`).
// See `defaults-registry.ts` for the full rationale.

import type { AnySectionDefinition } from '../sections/defineSection'
import type { AssetStorageAdapter } from '../storage/assets'
import type { ContentStorageAdapter } from '../storage/content'
import { getDefaultAdapterFactories } from './defaults-registry'

/**
 * User-facing configuration shape passed to `defineConfig`.
 *
 * `sections` is required and must contain at least one definition.
 * Adapters are optional — when omitted, the default FS adapters are used
 * with the canonical template paths.
 */
export interface AgentCmsConfig {
  /** Registered section definitions. Order does not matter. */
  readonly sections: readonly AnySectionDefinition[]
  /** Content storage adapter. Defaults to FS adapter with standard paths. */
  readonly contentAdapter?: ContentStorageAdapter
  /** Asset storage adapter. Defaults to FS adapter with standard paths. */
  readonly assetAdapter?: AssetStorageAdapter
}

/**
 * Fully-resolved configuration with all defaults filled in.
 * Downstream code (runtime factory, handlers) can depend on every
 * field being present.
 */
export interface ResolvedConfig {
  readonly sections: readonly AnySectionDefinition[]
  readonly contentAdapter: ContentStorageAdapter
  readonly assetAdapter: AssetStorageAdapter
}

/**
 * Resolve a user config into a fully-populated config with defaults.
 *
 * Default adapters:
 *   - content: `createFsContentAdapter({ contentRoot: process.cwd() + '/content' })`
 *   - asset: `createFsAssetAdapter({ assetsRoot: process.cwd() + '/public/assets', publicUrlBase: '/assets' })`
 *
 * Validates that `sections` is non-empty (warns in dev, does not throw)
 * so that a misconfigured template gets a visible signal rather than
 * silent emptiness at render time.
 */
export function defineConfig(config: AgentCmsConfig): ResolvedConfig {
  // Warn on empty sections — a template with no sections registered will
  // render nothing but won't crash. We warn instead of throwing because
  // the user might be iterating on their first section and not have one
  // ready yet.
  if (config.sections.length === 0) {
    console.warn(
      '[agntcms] defineConfig: `sections` array is empty. ' +
        'No sections will be available for rendering.',
    )
  }

  // Lazy default-adapter resolution. The factories are looked up via the
  // global registry (populated by `./defaults.ts` when `/server` loads).
  // We do the lookup ONLY when the user actually omitted the adapter, so
  // a fully-specified config never touches the side channel — that path
  // works even in pure-client contexts that never load the server barrel.
  const contentAdapter =
    config.contentAdapter ?? getDefaultAdapterFactories('content').content()
  const assetAdapter =
    config.assetAdapter ?? getDefaultAdapterFactories('asset').asset()

  return {
    sections: config.sections,
    contentAdapter,
    assetAdapter,
  }
}
