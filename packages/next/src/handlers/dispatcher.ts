// Catch-all route dispatcher for the `app/api/agntcms/[...path]` Next.js
// segment shipped in the template.
//
// Why this exists:
//
// Before v0.3 the template carried ~30 thin proxy files under
// `app/api/agntcms/**/route.ts`, one per endpoint. Adding a new endpoint
// in the framework required every user to copy the new proxy file into
// their (frozen) template. With this dispatcher, the framework owns one
// table of (path, method, handler) tuples, the template ships ONE
// catch-all route, and new endpoints flow into user projects through a
// regular `pnpm up @agntcms/next`.
//
// Design choices:
//
// - The mapping is a flat, hand-written object literal. No reflection,
//   no folder scanning, no decorators. Adding an endpoint is two lines
//   in `ROUTES`. This is the same discipline as the section registry
//   (ARCHITECTURE.md §3 — explicit registration, no codegen).
//
// - The dispatcher does NOT wrap the handler's `Response`. Multipart
//   uploads (assets/upload) must reach the client with their stream /
//   status / headers untouched. The dispatcher's only job is to pick
//   the right method-handler tuple and call it.
//
// - Unknown path → 404. Method known path but unsupported method → 405
//   with the `Allow` header listing the supported methods for that path.
//   No body on either, matching `Response`'s minimal-headers default.
//
// - `params` is a Promise per the Next.js 15 convention for dynamic
//   route segments. The dispatcher awaits it once at the top of every
//   call. We do NOT support synchronous `params` — the template ships
//   with Next 15+.
//
// Import policy (ARCHITECTURE.md §8, Invariant 1):
//   This file sits under `handlers/` and may import from `domain/`,
//   `storage/`, and `runtime/` (transitively, through the sibling
//   handler factories). It MUST NOT import from `react/`, `sections/`,
//   or `config/`. As of v0.5 it no longer depends on `mcp/` or `tasks/`
//   either — the agent channel and in-memory task store were removed
//   when the framework dropped agent-driven editing.

import { createAssetsHandler, type AssetsHandler, type AssetsHandlerDeps } from './assets/index'
import { createDraftHandler, type DraftHandler, type DraftHandlerDeps } from './draft/index'
import { createPageHandler, type PageHandler, type PageHandlerDeps } from './page/index'
import { createGlobalHandler, type GlobalHandler, type GlobalHandlerDeps } from './globals/index'
import {
  createGlobalDraftHandler,
  type GlobalDraftHandler,
  type GlobalDraftHandlerDeps,
} from './global-draft/index'
import { createPreviewHandler, type PreviewHandler, type PreviewHandlerDeps } from './preview/index'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Dependencies for every endpoint the dispatcher serves. Grouped by
 * underlying handler factory so the template wiring mirrors the v0.2
 * `_shared.ts` shape one-to-one (each frozen route file passed the same
 * `deps` object to its factory; the dispatcher merges them at the top).
 *
 * `preview` is optional because `createPreviewHandler` has all-optional
 * deps (cookie name and token store both have defaults / null fallbacks).
 * Everything else is required: omitting a slice would break a real
 * endpoint at runtime, and a typed signature catches that at compile time.
 */
export interface agntcmsRouteHandlerOptions {
  readonly assets: AssetsHandlerDeps
  readonly draft: DraftHandlerDeps
  readonly page: PageHandlerDeps
  readonly global: GlobalHandlerDeps
  /**
   * Dependency slice for the `global-draft/*` endpoints (save, list,
   * publish, discard). Optional: when omitted the dispatcher falls back
   * to `opts.global` directly so existing templates that haven't been
   * updated still get the SAME registry-derived enforcement
   * (`allowedTypes`, `sectionDefaults`, `systemTypes`) on the draft
   * boundary as the live-save endpoint. This works because
   * `GlobalDraftHandlerDeps` is a structural subset of
   * `GlobalHandlerDeps`. Passing this slice explicitly is only required
   * when a template wants a DIFFERENT enforcement surface for drafts
   * than for live saves — uncommon.
   */
  readonly globalDraft?: GlobalDraftHandlerDeps
  readonly preview?: PreviewHandlerDeps
}

/** HTTP methods the dispatcher routes. */
export type DispatcherMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/**
 * Shape Next.js 15 passes as the second argument to a catch-all route's
 * method handlers. `params.path` is a Promise resolving to the path
 * segments after `/api/agntcms/` — for `assets/upload` it resolves to
 * `['assets', 'upload']`.
 */
export interface agntcmsRouteContext {
  readonly params: Promise<{ readonly path: readonly string[] }>
}

export interface agntcmsRouteHandler {
  readonly GET: (req: Request, ctx: agntcmsRouteContext) => Promise<Response>
  readonly POST: (req: Request, ctx: agntcmsRouteContext) => Promise<Response>
  readonly PUT: (req: Request, ctx: agntcmsRouteContext) => Promise<Response>
  readonly DELETE: (req: Request, ctx: agntcmsRouteContext) => Promise<Response>
}

// ---------------------------------------------------------------------------
// Internal route table
// ---------------------------------------------------------------------------

// Per-method handler-function map for a single path. Only the methods
// the endpoint actually supports appear here — missing entries become
// 405 responses at dispatch time.
type RouteMethods = Partial<Record<DispatcherMethod, (req: Request) => Promise<Response> | Response>>

interface BuiltHandlers {
  readonly assets: AssetsHandler
  readonly draft: DraftHandler
  readonly page: PageHandler
  readonly global: GlobalHandler
  readonly globalDraft: GlobalDraftHandler
  readonly preview: PreviewHandler
}

/**
 * Build the routing table from the per-handler instances. The table is
 * keyed by the path joined with '/' so a single lookup is O(1). Path
 * segments are joined verbatim (no normalisation) because the source of
 * truth is the URL passed by Next.js — the catch-all already excludes
 * empty segments.
 */
function buildRouteTable(h: BuiltHandlers): ReadonlyMap<string, RouteMethods> {
  const table = new Map<string, RouteMethods>()

  // -- Assets --
  // `/assets`         — GET list
  // `/assets/upload`  — POST upload
  table.set('assets', { GET: h.assets.list })
  table.set('assets/upload', { POST: h.assets.upload })

  // -- Drafts --
  table.set('draft/save', { POST: h.draft.save })
  table.set('draft/list', { GET: h.draft.list })
  table.set('draft/publish', { POST: h.draft.publish })
  table.set('draft/reorder', { POST: h.draft.reorder })
  table.set('draft/discard', { POST: h.draft.discard })
  table.set('draft/replace-section', { POST: h.draft.replaceSection })

  // -- Pages --
  table.set('page/list', { GET: h.page.list })
  table.set('page/read', { GET: h.page.read })
  table.set('page/delete', { POST: h.page.deletePage })
  table.set('page/unpublish', { POST: h.page.unpublish })
  table.set('page/history', { GET: h.page.listHistory })
  table.set('page/rollback', { POST: h.page.rollback })
  table.set('page/rename', { POST: h.page.rename })
  table.set('page/duplicate', { POST: h.page.duplicate })

  // -- Globals --
  // global/delete uses DELETE (REST-style) — preserved from the existing
  // template route to avoid changing the wire shape.
  table.set('global/list', { GET: h.global.list })
  table.set('global/read', { GET: h.global.read })
  table.set('global/save', { POST: h.global.save })
  table.set('global/delete', { DELETE: h.global.delete })
  table.set('global/history', { GET: h.global.listHistory })
  table.set('global/rollback', { POST: h.global.rollback })

  // -- Global drafts --
  // Mirror of the page-draft endpoints — see `handlers/global-draft/`.
  table.set('global-draft/save', { POST: h.globalDraft.save })
  table.set('global-draft/list', { GET: h.globalDraft.list })
  table.set('global-draft/publish', { POST: h.globalDraft.publish })
  table.set('global-draft/discard', { POST: h.globalDraft.discard })

  // -- Preview --
  // `enter` accepts BOTH POST (set cookie directly) and GET (token
  // exchange + redirect). This is the only path served by two methods
  // in the entire dispatcher; everything else is single-method.
  table.set('preview/enter', { POST: async (req) => h.preview.enter(req), GET: async (req) => h.preview.enterWithToken(req) })
  table.set('preview/exit', { POST: async (req) => h.preview.exit(req) })
  table.set('preview/issue', { POST: h.preview.issueToken })

  return table
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the agntcms catch-all route handler for Next.js.
 *
 * Usage in the template's frozen `app/api/agntcms/[...path]/route.ts`:
 *
 * ```ts
 * import { createagntcmsRouteHandler } from '@agntcms/next/handlers'
 * import { contentAdapter, assetAdapter, runtime, ... } from '../_shared'
 *
 * export const { GET, POST, PUT, DELETE } = createagntcmsRouteHandler({
 *   assets: { assetAdapter },
 *   draft: { contentAdapter, runtime },
 *   // ... etc
 * })
 * ```
 *
 * The returned object also exports `PUT` even though no current endpoint
 * uses it. Exporting all four method symbols keeps the template's
 * frozen `route.ts` shape stable as new endpoints are added.
 */
export function createagntcmsRouteHandler(
  opts: agntcmsRouteHandlerOptions,
): agntcmsRouteHandler {
  const handlers: BuiltHandlers = {
    assets: createAssetsHandler(opts.assets),
    draft: createDraftHandler(opts.draft),
    page: createPageHandler(opts.page),
    global: createGlobalHandler(opts.global),
    // `globalDraft` is optional on the public options surface. When the
    // caller omits it, fall back to `opts.global` directly — this works
    // because `GlobalDraftHandlerDeps` and `GlobalHandlerDeps` are kept
    // structurally aligned (both expose `contentAdapter` and the same
    // optional `allowedTypes` / `sectionDefaults` / `systemTypes`
    // fields). This alignment is load-bearing for this fallback: adding
    // a required field to `GlobalHandlerDeps` without mirroring it on
    // `GlobalDraftHandlerDeps` (or vice versa) would silently drop the
    // field along this path and break the Branch B enforcement
    // (system-global overwrite guard) or section defaults that the
    // draft boundary relies on. Any change to either interface MUST be
    // mirrored on the other; the two are joined at the hip by design.
    globalDraft: createGlobalDraftHandler(opts.globalDraft ?? opts.global),
    // `preview` deps are optional; pass undefined explicitly so the
    // factory's `deps?` parameter sees `undefined` rather than `{}` (the
    // factory branches on `deps?.tokenStore` and `deps?.cookieName`).
    preview: createPreviewHandler(opts.preview),
  }

  const table = buildRouteTable(handlers)

  // The actual dispatch. Resolves `params.path`, joins it as the table
  // key, picks the per-method entry, and either calls or 405/404s.
  const dispatch = async (
    method: DispatcherMethod,
    req: Request,
    ctx: agntcmsRouteContext,
  ): Promise<Response> => {
    const { path } = await ctx.params
    // Defensive: an empty path array is impossible for a catch-all
    // segment in practice (Next.js redirects to the parent), but we
    // guard anyway so the join key cannot collide with a real entry.
    if (!path || path.length === 0) {
      return new Response(null, { status: 404 })
    }

    const key = path.join('/')
    const entry = table.get(key)
    if (!entry) {
      return new Response(null, { status: 404 })
    }

    const handler = entry[method]
    if (!handler) {
      // Build the `Allow` header from the methods actually registered
      // for this path. RFC 7231 §6.5.5 requires it on a 405.
      const allowed = (Object.keys(entry) as DispatcherMethod[]).join(', ')
      return new Response(null, { status: 405, headers: { Allow: allowed } })
    }

    // The handler returns `Response | Promise<Response>` — `await` is
    // safe for both. The Response is passed back verbatim to preserve
    // multipart upload semantics.
    return await handler(req)
  }

  return {
    GET: (req, ctx) => dispatch('GET', req, ctx),
    POST: (req, ctx) => dispatch('POST', req, ctx),
    PUT: (req, ctx) => dispatch('PUT', req, ctx),
    DELETE: (req, ctx) => dispatch('DELETE', req, ctx),
  }
}
