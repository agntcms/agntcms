// Global draft lifecycle route handlers: save / list / publish / discard.
//
// Mirrors `handlers/draft/draft-handler.ts` for pages. Globals gained a
// real draft → publish cycle in v0.2: the editor's save now POSTs to the
// `global-draft/save` endpoint here, which writes only to the draft
// bucket. Publish promotes the draft to the live global (and writes a
// history snapshot). Discard removes the draft, leaving the live global
// intact.
//
// Why this lives in its own folder (not in `handlers/globals/`):
//   The page-draft and page-read handlers live in sibling folders
//   (`handlers/draft/` and `handlers/page/`) for the same reason — the
//   draft-lifecycle endpoints have a distinct shape (no list/read,
//   different dep needs) from the published-CRUD endpoints. Keeping the
//   same split for globals preserves symmetry between the two.
//
// Import policy (ARCHITECTURE.md §8, Invariant 1):
//   handlers/ may import from domain/, storage/, and runtime/. It MUST
//   NOT import from react/, mcp/, tasks/, sections/, or config/.

import type { Global } from '../../domain/index'
import type { ContentStorageAdapter, GlobalDraftSummary } from '../../storage/content'
import { jsonResponse, safeErrorMessage } from '../utils'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Dependency surface intentionally mirrors `GlobalHandlerDeps`: the same
 * registry-derived collections (`allowedTypes`, `sectionDefaults`,
 * `systemTypes`) the live-save handler consults must be applied at the
 * draft-save boundary too, otherwise a draft could carry a payload the
 * publish-time `assertValidGlobal`-equivalent never gets a chance to
 * reject (the published `saveGlobal` path validated those rules and
 * draft-publish goes through `publishGlobalDraft` which only validates
 * the storage side of the contract).
 */
export interface GlobalDraftHandlerDeps {
  readonly contentAdapter: ContentStorageAdapter
  /** When provided, `save` rejects types not in this set with 400 `unknown_type`. */
  readonly allowedTypes?: ReadonlySet<string>
  /** Pre-resolved per-type field defaults, merged into incoming `data`. */
  readonly sectionDefaults?: ReadonlyMap<string, Readonly<Record<string, unknown>>>
  /**
   * Names of section TYPES whose `system: true` flag was set in
   * `defineSection`. Used here for the Branch B overwrite guard only:
   * a draft saved at an existing system global's name with a different
   * type is rejected. (Branch A was removed in Commit 1.)
   */
  readonly systemTypes?: ReadonlySet<string>
}

export interface GlobalDraftHandler {
  /** POST /api/agntcms/global-draft/save -- persist a draft global */
  readonly save: (req: Request) => Promise<Response>
  /** GET /api/agntcms/global-draft/list -- list pending global drafts */
  readonly list: (req: Request) => Promise<Response>
  /** POST /api/agntcms/global-draft/publish -- promote a draft to live */
  readonly publish: (req: Request) => Promise<Response>
  /** POST /api/agntcms/global-draft/discard -- remove a draft (live untouched) */
  readonly discard: (req: Request) => Promise<Response>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Globals are flat (no nesting). Restrict names to single segments:
// letters, digits, hyphens, underscores only. No `/` separator.
// Kept handler-internal (not exported from `global-handler.ts`) so each
// handler module stays self-contained — same discipline as the
// `GLOBAL_NAME_PATTERN` in the live-CRUD handler.
const GLOBAL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createGlobalDraftHandler(
  deps: GlobalDraftHandlerDeps,
): GlobalDraftHandler {
  const { contentAdapter } = deps

  const save = async (req: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400)
    }

    if (body === null || typeof body !== 'object') {
      return jsonResponse({ error: 'invalid_body', message: 'Expected a JSON object' }, 400)
    }

    const obj = body as Record<string, unknown>

    if (typeof obj['name'] !== 'string' || obj['name'] === '') {
      return jsonResponse({ error: 'missing_name' }, 400)
    }
    if (!GLOBAL_NAME_PATTERN.test(obj['name'] as string)) {
      return jsonResponse(
        { error: 'invalid_name', message: 'Global name must contain only letters, numbers, hyphens, and underscores' },
        400,
      )
    }
    if (typeof obj['type'] !== 'string' || obj['type'] === '') {
      return jsonResponse({ error: 'missing_type' }, 400)
    }
    if (deps.allowedTypes && !deps.allowedTypes.has(obj['type'] as string)) {
      return jsonResponse(
        { error: 'unknown_type', message: `Type "${obj['type'] as string}" is not registered` },
        400,
      )
    }
    if (
      obj['data'] === undefined ||
      obj['data'] === null ||
      typeof obj['data'] !== 'object' ||
      Array.isArray(obj['data'])
    ) {
      return jsonResponse({ error: 'missing_data' }, 400)
    }

    const name = obj['name'] as string
    const type = obj['type'] as string

    // System-global overwrite guard (Branch B), mirrored from the live
    // save handler. A draft that would later publish over an existing
    // system-flagged global at the same name with a different type would
    // destroy SEO configuration on publish; reject it here so the user
    // sees the error at save time, not at publish time.
    //
    // We must check the EXISTING record's type (published OR a previously
    // saved draft) against `obj.type`, not branch on `obj.type` first —
    // a non-system type submitted at a system-occupied name is exactly
    // the case we want to catch.
    //
    // We read BOTH buckets: a draft saved at a system name still counts
    // as "occupying" the name from the user's perspective. If neither
    // exists, the save is a clean create-as-draft. Errors propagate as
    // 500: fail closed so a misbehaving adapter cannot slip a forbidden
    // overwrite past the guard.
    if (deps.systemTypes && deps.systemTypes.size > 0) {
      let existing: Global | null
      try {
        existing = await contentAdapter.readGlobal(name, 'published')
        if (existing === null) {
          existing = await contentAdapter.readGlobal(name, 'draft')
        }
      } catch (err: unknown) {
        return jsonResponse(
          { error: 'read_global_failed', message: safeErrorMessage(err) },
          500,
        )
      }
      if (
        existing !== null &&
        deps.systemTypes.has(existing.type) &&
        existing.type !== type
      ) {
        return jsonResponse(
          {
            error: 'system_global_cannot_be_overwritten',
            message: `Cannot overwrite system global "${name}" (type "${existing.type}") with a different type`,
          },
          400,
        )
      }
    }

    // Merge section defaults for fields not present in the submitted
    // data. Same rule as the live save handler: a draft created with
    // `data: {}` should not crash the section component at render time.
    let mergedData = obj['data'] as Readonly<Record<string, unknown>>
    if (deps.sectionDefaults) {
      const defaults = deps.sectionDefaults.get(type)
      if (defaults) {
        const result: Record<string, unknown> = { ...defaults }
        for (const key of Object.keys(mergedData)) {
          result[key] = mergedData[key] // user-provided values win
        }
        mergedData = result
      }
    }

    try {
      await contentAdapter.saveGlobalDraft({ name, type, data: mergedData })
      return jsonResponse({ ok: true }, 200)
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'save_failed', message: safeErrorMessage(err) },
        500,
      )
    }
  }

  const list = async (_req: Request): Promise<Response> => {
    let drafts: ReadonlyArray<GlobalDraftSummary>
    try {
      drafts = await contentAdapter.listGlobalDrafts()
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'list_failed', message: safeErrorMessage(err) },
        500,
      )
    }

    // Serialize updatedAt as ISO string for JSON transport — same
    // discipline as page-draft `list`.
    const serialized = drafts.map((d) => ({
      name: d.name,
      updatedAt: d.updatedAt.toISOString(),
    }))

    return jsonResponse({ drafts: serialized }, 200)
  }

  const publish = async (req: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400)
    }

    if (body === null || typeof body !== 'object') {
      return jsonResponse({ error: 'invalid_body', message: 'Expected a JSON object' }, 400)
    }

    const obj = body as Record<string, unknown>

    if (typeof obj['name'] !== 'string' || obj['name'] === '') {
      return jsonResponse({ error: 'missing_name' }, 400)
    }
    if (!GLOBAL_NAME_PATTERN.test(obj['name'] as string)) {
      return jsonResponse(
        { error: 'invalid_name', message: 'Global name must contain only letters, numbers, hyphens, and underscores' },
        400,
      )
    }

    const name = obj['name'] as string

    let global: Global
    try {
      global = await contentAdapter.publishGlobalDraft(name)
    } catch (err: unknown) {
      const message = safeErrorMessage(err)
      // The FS adapter throws "no global draft to publish for name: ..."
      // when the draft file is missing. Map that exact case to 404.
      // Everything else (I/O failure, corrupt JSON, traversal-guard trip,
      // validation error on the draft contents) is a real server error
      // and must surface as 500 — otherwise a caller debugging a corrupt
      // draft would chase a phantom "not found" instead of the real cause.
      // Mirrors the substring discrimination used by `discard` in the same file.
      if (message.includes('no global draft to publish')) {
        return jsonResponse({ error: 'not_found', message }, 404)
      }
      return jsonResponse(
        { error: 'publish_global_draft_failed', message },
        500,
      )
    }

    return jsonResponse({ ok: true, global }, 200)
  }

  const discard = async (req: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400)
    }

    if (body === null || typeof body !== 'object') {
      return jsonResponse({ error: 'invalid_body', message: 'Expected a JSON object' }, 400)
    }

    const obj = body as Record<string, unknown>

    if (typeof obj['name'] !== 'string' || obj['name'] === '') {
      return jsonResponse({ error: 'missing_name' }, 400)
    }
    if (!GLOBAL_NAME_PATTERN.test(obj['name'] as string)) {
      return jsonResponse(
        { error: 'invalid_name', message: 'Global name must contain only letters, numbers, hyphens, and underscores' },
        400,
      )
    }

    const name = obj['name'] as string

    // No "no_published_version" guard. Unlike pages, where discarding a
    // draft without a published version would orphan editable content,
    // globals can legitimately exist as draft-only: a user creates a new
    // global in preview, edits it, and may then decide to abandon it
    // before ever publishing. The right behaviour is to remove the draft
    // and leave the user with no record — same as if they had never
    // created it. If the live global exists too, it is untouched.

    try {
      await contentAdapter.deleteGlobalDraft(name)
    } catch (err: unknown) {
      const message = safeErrorMessage(err)
      // The adapter throws "no global draft to discard..." when the file
      // is already gone — map to 404. Any other failure is a 500.
      if (message.includes('no global draft to discard')) {
        return jsonResponse({ error: 'not_found', message }, 404)
      }
      return jsonResponse({ error: 'discard_failed', message }, 500)
    }

    return jsonResponse({ ok: true }, 200)
  }

  return { save, list, publish, discard }
}
