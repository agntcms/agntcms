// Default adapter factories that wire the FS adapters with the canonical
// template paths from ARCHITECTURE.md §3.
//
// These exist so `defineConfig` can fill in sensible defaults when the user
// omits adapter options, and so the template's `agntcms/config.ts` can
// instantiate the defaults explicitly when needed.
//
// Import policy: this file imports from `../storage/` (FS adapter factories,
// which statically import `node:fs/promises`, `node:path`, `node:crypto`).
// It MUST NOT be reachable from the `_config.ts` (a.k.a. `/config` subpath)
// import graph, because `/config` is consumed by user code that may end up
// in client bundles (e.g. a `'use client'` section component transitively
// imports a field-type constructor from `/config`).
//
// To enforce that, `defineConfig.ts` does NOT statically import this file.
// Instead, this module REGISTERS its factories on a `globalThis` slot at
// load time, and `defineConfig` reads from that slot when filling defaults.
// Server-side entry points (`/server`, `/handlers`) import this module so
// that registration runs before any user-side `defineConfig(...)` call.
//
// ESM evaluation order guarantees correctness: in the template's frozen
// `app/api/agntcms/_shared.ts` the import of `@agntcms/next/server` is
// declared before `import config from '@/agntcms/config'`, so the server
// barrel — and transitively this file — is evaluated before `defineConfig`
// runs. Same pattern in `app/[[...slug]]/page.tsx` and `app/layout.tsx`.

import { createFsAssetAdapter } from '../storage/fs/assets'
import { createFsContentAdapter } from '../storage/fs/content'
import type { AssetStorageAdapter } from '../storage/assets'
import type { ContentStorageAdapter } from '../storage/content'
import {
  type DefaultAdapterFactories,
  registerDefaultAdapterFactories,
} from './defaults-registry'

import * as path from 'node:path'

export interface DefaultAdapterOptions {
  /** Project root. Defaults to `process.cwd()`. */
  readonly projectRoot?: string
}

/**
 * Create the default FS content adapter using the canonical path
 * `<projectRoot>/content` (ARCHITECTURE.md §3).
 */
export function createDefaultContentAdapter(
  options?: DefaultAdapterOptions,
): ContentStorageAdapter {
  const root = options?.projectRoot ?? process.cwd()
  return createFsContentAdapter({
    contentRoot: path.resolve(root, 'content'),
  })
}

/**
 * Create the default FS asset adapter using the canonical path
 * `<projectRoot>/public/assets` with URL base `/assets`
 * (ARCHITECTURE.md §3).
 */
export function createDefaultAssetAdapter(
  options?: DefaultAdapterOptions,
): AssetStorageAdapter {
  const root = options?.projectRoot ?? process.cwd()
  return createFsAssetAdapter({
    assetsRoot: path.resolve(root, 'public/assets'),
    publicUrlBase: '/assets',
  })
}

// Expose the FS-backed factories on the `globalThis` slot so `defineConfig`
// (which lives in a client-reachable module graph and CANNOT statically
// import this file) can call them when the user omits adapter options.
// See `defaults-registry.ts` for the full rationale.
//
// Why this is exported as a callable function rather than run as a bare
// top-level statement: tsup's `sideEffects: false` (declared in
// package.json so consumer bundlers can tree-shake aggressively) lets
// esbuild drop bare side-effect imports from non-entry modules. Wrapping
// the registration in a named export and CALLING it from the
// server/handlers barrels means the registration is preserved — its
// invocation is the value of an explicit statement in those barrels, not
// a bare import that is allowed to be elided.
export function installDefaultAdapterFactories(): void {
  const factories: DefaultAdapterFactories = {
    content: createDefaultContentAdapter,
    asset: createDefaultAssetAdapter,
  }
  registerDefaultAdapterFactories(factories)
}
