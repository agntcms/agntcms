// FROZEN — do not edit. Framework file managed by agntcms.
//
// Module-level singletons shared across the frozen route handlers.
//
// Why module-level and not per-request:
//
// - The runtime is stateless: it holds no request-scoped data. Rebuilding
//   it per request would pointlessly re-allocate the same closure on every
//   hit.
//
// - The PreviewTokenStore is in-memory. Creating it per request would lose all
//   pending tokens on the next request. Module-level is required.
//
// Next.js App Router running in Node.js (not Edge Runtime) preserves
// module state across requests within a single process. This file
// correctly exploits that guarantee. Do not import this file from any
// Edge-runtime segment.
//
// In development, Next.js HMR re-evaluates server modules on every file
// change. Without globalThis caching, the preview token store loses all
// pending tokens every time the developer writes a content file. The
// g.__agntcms_previewTokenStore slot below survives re-evaluation because
// globalThis outlives any individual module evaluation in the same process.
// contentAdapter and runtime are stateless closures — they don't need this.

import { createRuntime } from '@agntcms/next/server'
import { createPreviewTokenStore } from '@agntcms/next/handlers'
import config from '@/agntcms/config'

export const contentAdapter = config.contentAdapter
export const assetAdapter = config.assetAdapter

export const runtime = createRuntime({
  contentAdapter,
})

// Persist the preview token store across Next.js HMR re-evaluations in dev mode.
const g = globalThis as unknown as {
  __agntcms_previewTokenStore?: ReturnType<typeof createPreviewTokenStore>
}

export const previewTokenStore = g.__agntcms_previewTokenStore ??= createPreviewTokenStore()
