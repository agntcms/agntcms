// Default-adapter side channel.
//
// Why this exists: `defineConfig` lives in the `_config.ts` subpath barrel
// (`@agntcms/next/config`), which is consumed by user code that may be
// imported into a client bundle. Concretely, a `'use client'` section
// component can transitively import a field-type constructor from
// `/config`; tsup bundles `/config` as a single chunk (`splitting: false`),
// so anything statically reachable from `_config.ts` lands in the browser.
//
// `defineConfig` needs to fill default adapters when the user omits them,
// but the FS adapter factories transitively import `node:fs/promises`,
// `node:path`, and `node:crypto`. Static-importing them from `defineConfig`
// would drag those `node:*` specifiers into the client bundle and break the
// template's `next build`.
//
// Solution: keep the registration of default factories in a server-only
// module (`./defaults.ts`) that imports `node:*` legitimately, and expose
// them to `defineConfig` via a `globalThis` slot populated by side effect
// when `/server` (or `/handlers`) is loaded. `defineConfig` only imports
// THIS file, which has no Node-specific dependencies.
//
// Correctness depends on ESM evaluation order: in the template's frozen
// route handlers and pages, `@agntcms/next/server` is imported BEFORE
// `agntcms/config`, so the server barrel — and transitively
// `./defaults.ts` — fully evaluates and populates the slot before
// `defineConfig(...)` runs. See `_shared.ts`, `app/[[...slug]]/page.tsx`,
// `app/layout.tsx` in the template for the canonical ordering.
//
// If a caller invokes `defineConfig({ /* no adapters */ })` WITHOUT first
// loading `/server` (e.g. a standalone test script that imports only
// `/config`), the lookup throws with a clear, actionable message.

import type { AssetStorageAdapter } from '../storage/assets'
import type { ContentStorageAdapter } from '../storage/content'

export interface DefaultAdapterOptions {
  readonly projectRoot?: string
}

export interface DefaultAdapterFactories {
  readonly content: (options?: DefaultAdapterOptions) => ContentStorageAdapter
  readonly asset: (options?: DefaultAdapterOptions) => AssetStorageAdapter
}

// Symbol-keyed slot. Symbols sidestep accidental key collisions with user
// code that pokes at `globalThis`, and survive HMR re-evaluation because
// `Symbol.for` is interned in the per-process registry.
const SLOT = Symbol.for('@agntcms/next/default-adapter-factories')

interface SlotHolder {
  [SLOT]?: DefaultAdapterFactories
}

function holder(): SlotHolder {
  return globalThis as unknown as SlotHolder
}

/**
 * Register default adapter factories on the process-wide slot. Called as
 * a side effect from `./defaults.ts` when the server barrel is loaded.
 *
 * Idempotent: a second call overwrites with the same factory set, which
 * is a no-op for production code. HMR re-evaluation in dev relies on
 * this idempotence.
 */
export function registerDefaultAdapterFactories(
  factories: DefaultAdapterFactories,
): void {
  holder()[SLOT] = factories
}

/**
 * Read the registered factories. Throws when called from a context that
 * never loaded the server barrel (e.g. a client bundle that somehow
 * called `defineConfig` without adapters). The error names the missing
 * adapter key so the developer knows what was requested.
 */
export function getDefaultAdapterFactories(
  requested: keyof DefaultAdapterFactories,
): DefaultAdapterFactories {
  const f = holder()[SLOT]
  if (f === undefined) {
    throw new Error(
      `[agntcms] defineConfig: cannot fill the default ${requested} adapter ` +
        'because the server-only adapter factories were never registered. ' +
        'Import `@agntcms/next/server` (or `@agntcms/next/handlers`) before ' +
        'evaluating `agntcms/config.ts`, or pass an explicit adapter to ' +
        '`defineConfig({ contentAdapter, assetAdapter })`.',
    )
  }
  return f
}
