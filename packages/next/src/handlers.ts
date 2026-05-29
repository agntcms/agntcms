// Subpath barrel: `@agntcms/next/handlers`
//
// Re-exports all route handler factories and their option types from
// `handlers/`. These are consumed by the frozen route files in the
// template's `app/api/agntcms/` directory.

// See the matching block at the top of `server.ts` for the rationale.
// `/handlers` is consumed by frozen route files which import from
// `/handlers` at the top of the file BEFORE importing `agntcms/config`.
// ESM evaluation order means `/handlers` must register the FS-backed
// default adapter factories on `globalThis` before `defineConfig` is
// called. See `config/defaults-registry.ts` for the full rationale.
import { installDefaultAdapterFactories } from './config/defaults'
installDefaultAdapterFactories()

export {
  createPreviewHandler,
  createDraftHandler,
  createAssetsHandler,
} from './handlers/index'

export type {
  PreviewHandler,
  PreviewHandlerDeps,
  DraftHandler,
  DraftHandlerDeps,
  AssetsHandler,
  AssetsHandlerDeps,
} from './handlers/index'

export { createPreviewTokenStore } from './handlers/index'
export type { PreviewTokenStore, PreviewToken, PreviewTokenStoreOptions } from './handlers/index'

export { createPageHandler } from './handlers/index'
export type { PageHandler, PageHandlerDeps } from './handlers/index'

export { createGlobalHandler } from './handlers/index'
export type { GlobalHandler, GlobalHandlerDeps } from './handlers/index'

export { createGlobalDraftHandler } from './handlers/index'
export type { GlobalDraftHandler, GlobalDraftHandlerDeps } from './handlers/index'

// Catch-all route dispatcher. The template's frozen `app/api/agntcms/
// [...path]/route.ts` consumes this in lieu of the previous ~30 thin
// proxy files. Adding a new endpoint to the framework no longer requires
// editing any user template — `pnpm up @agntcms/next` is enough.
export { createagntcmsRouteHandler } from './handlers/index'
export type {
  agntcmsRouteHandler,
  agntcmsRouteHandlerOptions,
  agntcmsRouteContext,
  DispatcherMethod,
} from './handlers/index'
