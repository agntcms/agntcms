// Global management route handlers: list, save, delete.
//
// Import policy (ARCHITECTURE.md section 8, Invariant 1):
//   handlers/ may import from domain/, storage/, and runtime/.
//   It MUST NOT import from react/, mcp/, tasks/, sections/, or config/.

import type { ContentStorageAdapter } from '../../storage/content'
import { jsonResponse, safeErrorMessage } from '../utils'

export interface GlobalHandlerDeps {
  readonly contentAdapter: ContentStorageAdapter
  /** When provided, `save` rejects types not in this set with 400 `unknown_type`. */
  readonly allowedTypes?: ReadonlySet<string>
  /** Pre-resolved section defaults. When provided, the save handler fills
   *  missing fields in global data with these defaults so that a freshly
   *  created global (with `data: {}`) starts with valid placeholder values
   *  instead of crashing the section component at render time. */
  readonly sectionDefaults?: ReadonlyMap<string, Readonly<Record<string, unknown>>>
  /**
   * Names of section TYPES whose `system: true` flag was set in
   * `defineSection`. The handler uses this set to:
   *   - tag each entry returned by `list` with `system: boolean` so UIs
   *     can render system globals separately (e.g. the AdminModal
   *     "Settings" group);
   *   - expose the set on the `list` response as a sibling `systemTypes`
   *     field so a UI can decide how to surface system types in its
   *     "create global" affordances;
   *   - reject `save` that would OVERWRITE an existing system global at
   *     the same name with a different (non-system or other) type with
   *     `system_global_cannot_be_overwritten` (defense-in-depth against
   *     silently clobbering e.g. a `site-meta` SiteMeta record by
   *     submitting a Hero record at the same name).
   *
   * The flag NO LONGER blocks create or delete: a system global may be
   * deleted and a new global of the same system type re-created at the
   * same name. The user-facing "Settings" grouping in the UI is purely
   * presentation; deletion and re-creation are first-class operations.
   *
   * When absent (or when a global's type is not in the set), every entry
   * is treated as a regular user global. This keeps existing callers
   * working without a wire-shape break — `system` simply defaults to
   * `false` everywhere.
   *
   * Resolution lives in the handler, not in the storage layer, because
   * `system` is a property of the section REGISTRY (handler/UI concern),
   * not of the stored global itself. See ARCHITECTURE.md §3 "Section
   * registration".
   */
  readonly systemTypes?: ReadonlySet<string>
}

export interface GlobalHandler {
  /** GET /api/agntcms/global/list */
  readonly list: (req: Request) => Promise<Response>
  /** GET /api/agntcms/global/read?name=xxx */
  readonly read: (req: Request) => Promise<Response>
  /** POST /api/agntcms/global/save */
  readonly save: (req: Request) => Promise<Response>
  /** POST /api/agntcms/global/delete */
  readonly delete: (req: Request) => Promise<Response>
  /**
   * GET /api/agntcms/global/history?name=xxx[&ts=...]
   *
   * Without `ts`: returns the list of history entries for the global.
   * With `ts`: returns the full body of the matching single snapshot.
   * Mirrors the page handler's `listHistory`/?ts= behaviour exactly.
   */
  readonly listHistory: (req: Request) => Promise<Response>
  /** POST /api/agntcms/global/rollback — body: { name, timestamp } */
  readonly rollback: (req: Request) => Promise<Response>
}

// Globals are flat (no nesting). Restrict names to single segments:
// letters, digits, hyphens, underscores only. No `/` separator.
const GLOBAL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/

export function createGlobalHandler(deps: GlobalHandlerDeps): GlobalHandler {
  const { contentAdapter } = deps

  const list = async (_req: Request): Promise<Response> => {
    try {
      const globals = await contentAdapter.listGlobals()
      // Serialize updatedAt as ISO string for JSON transport. `system` is
      // resolved by looking up the global's `type` in the registry set
      // passed by the dispatcher — see `systemTypes` on the deps. Always
      // present on the wire so the UI doesn't need to branch on its
      // absence; defaults to `false` when no set is provided or the type
      // is unknown.
      const serialized = globals.map((g) => ({
        name: g.name,
        type: g.type,
        updatedAt: g.updatedAt.toISOString(),
        system: deps.systemTypes?.has(g.type) ?? false,
      }))
      // Include registered section types when available so the UI can offer
      // them as autocomplete suggestions in the "create global" form.
      // `systemTypes` is a sibling field (not a reshape of `types`) so
      // existing consumers that destructure `{ globals, types }` keep
      // working — the field is additive. The AdminModal filters
      // `types` against `systemTypes` to drop system-flagged entries
      // from the create datalist (we don't want to OFFER a path that
      // the save handler then rejects).
      const body: Record<string, unknown> = { globals: serialized }
      if (deps.allowedTypes) {
        body['types'] = Array.from(deps.allowedTypes).sort()
      }
      if (deps.systemTypes) {
        body['systemTypes'] = Array.from(deps.systemTypes).sort()
      }
      return jsonResponse(body, 200)
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'list_globals_failed', message: safeErrorMessage(err) },
        500,
      )
    }
  }

  const read = async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const name = url.searchParams.get('name')
    // Optional `?mode=draft|published`. Default is `published` so existing
    // callers (older templates, integrations) see no behaviour change.
    // The admin Edit-global modal passes `mode=draft` when a draft exists
    // so the user picks up where they left off; with no draft it falls
    // back to published in the runtime layer (`getGlobal`).
    const modeParam = url.searchParams.get('mode')

    if (!name) {
      return jsonResponse({ error: 'missing_name' }, 400)
    }
    if (!GLOBAL_NAME_PATTERN.test(name)) {
      return jsonResponse(
        { error: 'invalid_name', message: 'Global name must contain only letters, numbers, hyphens, and underscores' },
        400,
      )
    }

    // Validate the mode param exhaustively rather than coercing — typos
    // ('drafts', 'preview') should be a 400, not a silent fall-through
    // to published which would mask the caller bug.
    let mode: 'published' | 'draft' = 'published'
    if (modeParam !== null) {
      if (modeParam === 'draft' || modeParam === 'published') {
        mode = modeParam
      } else {
        return jsonResponse(
          { error: 'invalid_mode', message: 'mode must be "draft" or "published"' },
          400,
        )
      }
    }

    try {
      // Admin-read draft→published fallback, mirroring the runtime
      // `getGlobal` discipline (see runtime/getGlobal.ts:162-169). The
      // storage adapter intentionally has NO cross-mode fallback — each
      // bucket is single-purpose — so the fallback lives here, at the
      // boundary that the admin UI talks to.
      //
      // Motivation: the AdminModal passes `mode=draft` whenever its row
      // hint says a draft exists. That hint can go stale (another tab
      // discarded the draft, a publish ran in the background, etc.). In
      // the stale-hint case, returning 404 forces the user to recover
      // from an opaque error; falling back transparently lets them keep
      // editing from the live published copy.
      //
      // The fallback is intentionally one-directional: `mode=published`
      // is the live-content read and must NOT silently serve a draft.
      // Only the draft→published direction is forgiving.
      let global = await contentAdapter.readGlobal(name, mode)
      let resolvedMode: 'draft' | 'published' = mode
      if (!global && mode === 'draft') {
        global = await contentAdapter.readGlobal(name, 'published')
        resolvedMode = 'published'
      }
      if (!global) {
        return jsonResponse({ error: 'not_found', message: `Global "${name}" not found` }, 404)
      }
      // `mode` on the response surfaces the bucket actually consumed so
      // the client can detect the fallback (e.g. clear a stale draft
      // badge). Additive to the existing `{ global }` payload — older
      // callers that destructure only `global` are unaffected.
      return jsonResponse(
        {
          global: { name: global.name, type: global.type, data: global.data },
          mode: resolvedMode,
        },
        200,
      )
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'read_global_failed', message: safeErrorMessage(err) },
        500,
      )
    }
  }

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
      return jsonResponse({ error: 'invalid_name', message: 'Global name must contain only letters, numbers, hyphens, and underscores' }, 400)
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
    if (obj['data'] === undefined || obj['data'] === null || typeof obj['data'] !== 'object' || Array.isArray(obj['data'])) {
      return jsonResponse({ error: 'missing_data' }, 400)
    }

    // System-global overwrite guard (defense-in-depth). A system-flagged
    // record at `obj.name` must not be silently clobbered by a save of a
    // DIFFERENT type — e.g. submitting a Hero record at `site-meta` would
    // destroy SEO configuration. Create-of-a-new-system-type and
    // delete-of-a-system-type are both allowed (the user-facing "Settings"
    // group is purely presentation): only the type-mismatch overwrite at
    // an existing system-occupied name is rejected here.
    //
    // We read unconditionally when `systemTypes` is configured (and non-empty)
    // because the guard depends on the EXISTING record's type, not on
    // `obj.type` — branching on `obj.type` first would miss the case where a
    // non-system type is submitted at a system-occupied name.
    //
    // We read BOTH buckets: a draft saved at a system name still counts as
    // "occupying" the name from the user's perspective. Without the draft
    // read this guard is asymmetric with the draft-save path — a user
    // could save a draft of a system type, then a live POST at the same
    // name with a different non-system type would slip past Branch B and
    // (per saveGlobal's sibling-draft cleanup) silently destroy the
    // pending draft on disk. Reading both makes the guard symmetric with
    // the draft-save path.
    //
    // The read must fail CLOSED on adapter errors (return 500): a misbehaving
    // adapter must not be able to slip a forbidden overwrite past the
    // guard by throwing. Same read-error discipline as the delete handler.
    if (deps.systemTypes && deps.systemTypes.size > 0) {
      let existing
      try {
        existing = await contentAdapter.readGlobal(obj['name'] as string, 'published')
        if (existing === null) {
          existing = await contentAdapter.readGlobal(obj['name'] as string, 'draft')
        }
      } catch (err: unknown) {
        return jsonResponse(
          { error: 'read_global_failed', message: safeErrorMessage(err) },
          500,
        )
      }
      // Overwriting an EXISTING system global with a different
      // (non-system or other) type is forbidden.
      if (
        existing !== null &&
        deps.systemTypes.has(existing.type) &&
        existing.type !== obj['type']
      ) {
        return jsonResponse(
          {
            error: 'system_global_cannot_be_overwritten',
            message: `Cannot overwrite system global "${obj['name'] as string}" (type "${existing.type}") with a different type`,
          },
          400,
        )
      }
    }

    // Merge section defaults for fields not present in the submitted data.
    // This prevents runtime crashes when a global is created with `data: {}`
    // and the section component expects populated fields.
    let mergedData = obj['data'] as Readonly<Record<string, unknown>>
    if (deps.sectionDefaults) {
      const defaults = deps.sectionDefaults.get(obj['type'] as string)
      if (defaults) {
        const result: Record<string, unknown> = { ...defaults }
        for (const key of Object.keys(mergedData)) {
          result[key] = mergedData[key] // user-provided values win
        }
        mergedData = result
      }
    }

    try {
      await contentAdapter.saveGlobal({
        name: obj['name'] as string,
        type: obj['type'] as string,
        data: mergedData,
      })
      return jsonResponse({ ok: true }, 200)
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'save_global_failed', message: safeErrorMessage(err) },
        500,
      )
    }
  }

  const deleteHandler = async (req: Request): Promise<Response> => {
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
      return jsonResponse({ error: 'invalid_name', message: 'Global name must contain only letters, numbers, hyphens, and underscores' }, 400)
    }

    const name = obj['name'] as string

    // System globals are now deletable: the `system: true` flag drives only
    // the UI "Settings" grouping and the Branch-B overwrite guard in `save`.
    // Deletion proceeds straight to the storage adapter — re-creation of a
    // global of the same system type at the same name is a supported flow
    // (see ARCHITECTURE.md §3 "Section registration").

    try {
      await contentAdapter.deleteGlobal(name)
      return jsonResponse({ ok: true }, 200)
    } catch (err: unknown) {
      const message = safeErrorMessage(err)
      if (message.includes('global not found')) {
        return jsonResponse({ error: message }, 404)
      }
      return jsonResponse(
        { error: 'delete_global_failed', message },
        500,
      )
    }
  }

  const listHistory = async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const name = url.searchParams.get('name')
    // Optional `ts` selector — when present, return the full body of the
    // matching snapshot instead of the entries list. Same shape as the
    // page handler's listHistory so a template proxy stays uniform.
    const timestamp = url.searchParams.get('ts')

    if (!name || name === '') {
      return jsonResponse({ error: 'missing_name' }, 400)
    }
    if (!GLOBAL_NAME_PATTERN.test(name)) {
      return jsonResponse(
        { error: 'invalid_name', message: 'Global name must contain only letters, numbers, hyphens, and underscores' },
        400,
      )
    }

    if (timestamp !== null) {
      if (timestamp === '') {
        return jsonResponse({ error: 'missing_timestamp' }, 400)
      }
      try {
        const snapshot = await contentAdapter.readGlobalHistorySnapshot(name, timestamp)
        if (snapshot === null) {
          return jsonResponse({ error: 'not_found' }, 404)
        }
        return jsonResponse({ global: snapshot }, 200)
      } catch (err: unknown) {
        return jsonResponse(
          { error: 'read_history_snapshot_failed', message: safeErrorMessage(err) },
          500,
        )
      }
    }

    try {
      const entries = await contentAdapter.listGlobalHistory(name)
      // Project down to `{ timestamp }` — mirroring what the page handler
      // effectively returns to the UI (HistoryEntry carries `slug`/`size`
      // which the admin UI ignores for the timeline list).
      const projected = entries.map((e) => ({ timestamp: e.timestamp }))
      return jsonResponse({ entries: projected }, 200)
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'list_history_failed', message: safeErrorMessage(err) },
        500,
      )
    }
  }

  const rollback = async (req: Request): Promise<Response> => {
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
    if (typeof obj['timestamp'] !== 'string' || obj['timestamp'] === '') {
      return jsonResponse({ error: 'missing_timestamp' }, 400)
    }

    const name = obj['name'] as string
    const timestamp = obj['timestamp'] as string

    try {
      await contentAdapter.rollbackGlobal(name, timestamp)
    } catch (err: unknown) {
      const message = safeErrorMessage(err)
      // The adapter throws with the exact "global history snapshot not
      // found" prefix when the snapshot file is missing.
      if (message.includes('global history snapshot not found')) {
        return jsonResponse({ error: 'not_found' }, 404)
      }
      return jsonResponse(
        { error: 'rollback_failed', message },
        500,
      )
    }

    return jsonResponse({ ok: true }, 200)
  }

  return { list, read, save, delete: deleteHandler, listHistory, rollback }
}
