// Barrel for route handler factories.
//
// Dependency invariant (CLAUDE.md Hard Invariant #1 / ARCHITECTURE.md):
// handlers/ sits at the top of the graph: domain <- storage <- runtime <- handlers.
// As of v0.5, handlers/ no longer depends on `mcp/` or `tasks/` — both
// modules were removed when the agent channel was dropped. Nothing
// below `handlers/` may import from it.

export { createPreviewHandler } from './preview/index'
export type { PreviewHandler, PreviewHandlerDeps } from './preview/index'

export { createDraftHandler } from './draft/index'
export type { DraftHandler, DraftHandlerDeps } from './draft/index'

export { createAssetsHandler } from './assets/index'
export type { AssetsHandler, AssetsHandlerDeps } from './assets/index'

export { createPreviewTokenStore } from '../preview-tokens/index'
export type { PreviewTokenStore, PreviewToken, PreviewTokenStoreOptions } from '../preview-tokens/index'

export { createPageHandler } from './page/index'
export type { PageHandler, PageHandlerDeps } from './page/index'

export { createGlobalHandler } from './globals/index'
export type { GlobalHandler, GlobalHandlerDeps } from './globals/index'

export { createGlobalDraftHandler } from './global-draft/index'
export type { GlobalDraftHandler, GlobalDraftHandlerDeps } from './global-draft/index'

// -- Catch-all route dispatcher --
// One factory wires every admin endpoint above into a single Next.js
// catch-all route. The template ships ONE `app/api/agntcms/[...path]/
// route.ts` proxy instead of ~30 per-endpoint files. See `./dispatcher.ts`.
export { createagntcmsRouteHandler } from './dispatcher'
export type {
  agntcmsRouteHandler,
  agntcmsRouteHandlerOptions,
  agntcmsRouteContext,
  DispatcherMethod,
} from './dispatcher'
