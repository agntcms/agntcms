// Page management route handlers: delete, unpublish, history, rollback, rename.
//
// Import policy (ARCHITECTURE.md §8, Invariant 1):
//   handlers/ may import from domain/, storage/, and runtime/.
//   It MUST NOT import from react/, mcp/, tasks/, sections/, or config/.

import { randomUUID } from 'node:crypto'

import type { Page, Section } from '../../domain/index'
import type { ContentStorageAdapter } from '../../storage/content'
import type { Runtime } from '../../runtime/getContent'
import type { ListPagesInput, ListPagesSort } from '../../runtime/listPages'
import { getReservedPageSlugViolation } from '../../runtime/systemPages'
import { jsonResponse, safeErrorMessage } from '../utils'

export interface PageHandlerDeps {
  readonly contentAdapter: ContentStorageAdapter
  /**
   * Runtime instance. Required: `rollback` saves a draft then republishes
   * it via `runtime.publishDraft`, and the `tag/limit/sort` mode of `list`
   * routes through `runtime.listPages`. Both code paths are part of the
   * public surface, so the type forbids constructing the handler without
   * it. Template route files (frozen zone) all wire it in.
   */
  readonly runtime: Runtime
}

export interface PageHandler {
  readonly list: (req: Request) => Promise<Response>
  readonly read: (req: Request) => Promise<Response>
  readonly deletePage: (req: Request) => Promise<Response>
  readonly unpublish: (req: Request) => Promise<Response>
  readonly listHistory: (req: Request) => Promise<Response>
  readonly rollback: (req: Request) => Promise<Response>
  readonly rename: (req: Request) => Promise<Response>
  /** POST /api/agntcms/page/duplicate -- clone a page under a new slug as a draft */
  readonly duplicate: (req: Request) => Promise<Response>
}

// Slug shape accepted by duplicate: same as the FS adapter's SLUG_PATTERN
// (segments of alphanumerics/_/-, joined by /). Duplicated here so we can
// reject bad slugs early without letting the exception escape from the
// adapter layer. The adapter re-validates on write — defense in depth.
const SLUG_PATTERN = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/

const reservedSlugResponse = (
  slug: string,
  error: string,
): Response | null => {
  const violation = getReservedPageSlugViolation(slug)
  if (!violation) return null
  return jsonResponse({ error, message: violation.message }, 400)
}

/**
 * Clone a section with a fresh id. Preserves every other property
 * (type, data, globalRef) verbatim. The id is regenerated because ids
 * must be unique per page — carrying over the source page's ids would
 * produce key collisions if the user ever reorders, edits, or duplicates
 * again.
 *
 * `data` is passed by reference; sections' field shapes can be deep and
 * contain arbitrary JSON, but because Pages round-trip through JSON on
 * every read, the caller gets a new tree from readPage anyway. No deep
 * clone is necessary here.
 */
const cloneSection = (section: Section): Section => {
  // Fresh uuid — stable, collision-resistant, crypto-backed.
  const fresh: Section = {
    id: `sec_${randomUUID()}`,
    type: section.type,
    data: section.data,
    ...(section.globalRef !== undefined ? { globalRef: section.globalRef } : {}),
  }
  return fresh
}

export function createPageHandler(deps: PageHandlerDeps): PageHandler {
  const { contentAdapter, runtime } = deps

  // Parse the `limit` query param. Returns:
  //   - undefined when the param is missing
  //   - { ok: true, value: n } for a valid non-negative integer
  //   - { ok: false } for malformed input (NaN, negative, non-integer)
  // Empty string is treated as missing (matches `URL.searchParams.has`-then-
  // empty pattern used elsewhere in this file). Decimal values are rejected;
  // pagination semantics demand whole-number limits.
  const parseLimitParam = (
    raw: string | null,
  ): { ok: true; value: number | undefined } | { ok: false } => {
    if (raw === null || raw === '') return { ok: true, value: undefined }
    const n = Number(raw)
    if (!Number.isFinite(n)) return { ok: false }
    if (!Number.isInteger(n)) return { ok: false }
    if (n < 0) return { ok: false }
    return { ok: true, value: n }
  }

  const parseSortParam = (
    raw: string | null,
  ): { ok: true; value: ListPagesSort | undefined } | { ok: false } => {
    if (raw === null || raw === '') return { ok: true, value: undefined }
    if (raw === 'newest' || raw === 'oldest') return { ok: true, value: raw }
    return { ok: false }
  }

  const listSummaries = async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const tagRaw = url.searchParams.get('tag')
    const limitParsed = parseLimitParam(url.searchParams.get('limit'))
    const sortParsed = parseSortParam(url.searchParams.get('sort'))

    if (!limitParsed.ok) {
      return jsonResponse(
        { error: 'invalid_limit', message: 'limit must be a non-negative integer' },
        400,
      )
    }
    if (!sortParsed.ok) {
      return jsonResponse(
        { error: 'invalid_sort', message: "sort must be 'newest' or 'oldest'" },
        400,
      )
    }

    // Empty `tag=` is treated as "no filter" — the same shape we use for
    // missing string params elsewhere in this file (`slug=` → 400 there
    // because it's required, but here `tag` is optional).
    const tag = tagRaw === null || tagRaw === '' ? undefined : tagRaw

    // Build the input via a mutable shape, then narrow back to the readonly
    // ListPagesInput. Conditional spread is not enough here because three
    // optional fields would generate eight branches.
    const mutableInput: { tag?: string; limit?: number; sort?: ListPagesSort } = {}
    if (tag !== undefined) mutableInput.tag = tag
    if (limitParsed.value !== undefined) mutableInput.limit = limitParsed.value
    if (sortParsed.value !== undefined) mutableInput.sort = sortParsed.value
    const input: ListPagesInput = mutableInput

    try {
      const pages = await runtime.listPages(input)
      return jsonResponse({ pages }, 200)
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'list_pages_failed', message: safeErrorMessage(err) },
        500,
      )
    }
  }

  const list = async (req: Request): Promise<Response> => {
    // The list handler has two modes selected by query string presence
    // (ARCHITECTURE.md §4 — Selections):
    //
    //   1. No `tag`/`limit`/`sort` params → admin-list shape:
    //        { pages: [{ slug, hasPublished, hasDraft, updatedAt }] }
    //      Used by AdminModal's Pages tab to merge published + drafts.
    //
    //   2. Any of `tag`, `limit`, `sort` present → blog-index shape:
    //        { pages: PageSummary[] }
    //      Routes to `runtime.listPages(...)`. Used by client-side
    //      listing sections (e.g. PostList) to paginate by tag.
    //
    // The two shapes coexist on one route to keep the frozen template
    // proxy file (`template/app/api/agntcms/page/list/route.ts`) a
    // one-liner and avoid expanding the frozen surface.
    const url = new URL(req.url)
    const hasListPagesParams =
      url.searchParams.has('tag') ||
      url.searchParams.has('limit') ||
      url.searchParams.has('sort')

    if (hasListPagesParams) {
      return listSummaries(req)
    }

    try {
      const [pages, drafts] = await Promise.all([
        contentAdapter.listPages(),
        contentAdapter.listDrafts(),
      ])

      // Build a map keyed by slug, merging published and draft info.
      const map = new Map<string, {
        slug: string
        hasPublished: boolean
        hasDraft: boolean
        updatedAt: string
      }>()

      for (const p of pages) {
        map.set(p.slug, {
          slug: p.slug,
          hasPublished: true,
          hasDraft: false,
          updatedAt: p.updatedAt.toISOString(),
        })
      }

      for (const d of drafts) {
        const existing = map.get(d.slug)
        if (existing) {
          existing.hasDraft = true
          // Keep the latest of published/draft dates.
          const existingDate = new Date(existing.updatedAt)
          if (d.updatedAt > existingDate) {
            existing.updatedAt = d.updatedAt.toISOString()
          }
        } else {
          map.set(d.slug, {
            slug: d.slug,
            hasPublished: false,
            hasDraft: true,
            updatedAt: d.updatedAt.toISOString(),
          })
        }
      }

      // Stable alphabetical ordering by slug.
      const combined = Array.from(map.values()).sort((a, b) =>
        a.slug.localeCompare(b.slug),
      )

      return jsonResponse({ pages: combined }, 200)
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'list_pages_failed', message: safeErrorMessage(err) },
        500,
      )
    }
  }

  const read = async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug')

    if (!slug || slug === '') {
      return jsonResponse({ error: 'missing_slug' }, 400)
    }

    try {
      // Try draft first — the metadata modal edits the most recent version,
      // which is the draft if one exists, otherwise the published page.
      const page =
        (await contentAdapter.readPage(slug, 'draft')) ??
        (await contentAdapter.readPage(slug, 'published'))

      if (!page) {
        return jsonResponse({ error: 'page_not_found' }, 404)
      }

      return jsonResponse({ page }, 200)
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'read_page_failed', message: safeErrorMessage(err) },
        500,
      )
    }
  }

  const deletePage = async (req: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400)
    }

    if (
      !body ||
      typeof body !== 'object' ||
      !('slug' in body) ||
      typeof (body as Record<string, unknown>).slug !== 'string'
    ) {
      return jsonResponse({ error: 'missing_slug' }, 400)
    }

    const slug = (body as Record<string, unknown>).slug as string

    try {
      await contentAdapter.deletePage(slug)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('page not found')) {
        return jsonResponse({ error: message }, 404)
      }
      return jsonResponse({ error: message }, 500)
    }

    return jsonResponse({ ok: true }, 200)
  }

  const unpublish = async (req: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400)
    }

    if (
      !body ||
      typeof body !== 'object' ||
      !('slug' in body) ||
      typeof (body as Record<string, unknown>).slug !== 'string'
    ) {
      return jsonResponse({ error: 'missing_slug' }, 400)
    }

    const slug = (body as Record<string, unknown>).slug as string

    try {
      await contentAdapter.unpublishPage(slug)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Same "page not found" shape as deletePage — the storage layer
      // throws with that exact prefix when no published file exists.
      if (message.includes('page not found')) {
        return jsonResponse({ error: message }, 404)
      }
      return jsonResponse({ error: message }, 500)
    }

    return jsonResponse({ ok: true }, 200)
  }

  const listHistory = async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug')
    // Optional `ts` selector — when present, return the full body of the
    // matching single snapshot instead of the entries list. This is the
    // read side of the history UI: the diff + preview pane needs whole
    // `Page` bodies, which the summary entries don't carry. Kept on the
    // same route so the template's frozen history/route.ts proxy does
    // not need to change.
    const timestamp = url.searchParams.get('ts')

    if (!slug || slug === '') {
      return jsonResponse({ error: 'missing_slug' }, 400)
    }

    if (timestamp !== null) {
      if (timestamp === '') {
        return jsonResponse({ error: 'missing_timestamp' }, 400)
      }
      try {
        const snapshot = await contentAdapter.readHistorySnapshot(slug, timestamp)
        if (snapshot === null) {
          return jsonResponse({ error: 'snapshot_not_found' }, 404)
        }
        return jsonResponse({ page: snapshot }, 200)
      } catch (err: unknown) {
        return jsonResponse(
          { error: 'read_history_snapshot_failed', message: safeErrorMessage(err) },
          500,
        )
      }
    }

    try {
      const entries = await contentAdapter.listHistory(slug)
      return jsonResponse({ entries }, 200)
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

    if (typeof obj['slug'] !== 'string' || obj['slug'] === '') {
      return jsonResponse({ error: 'missing_slug' }, 400)
    }
    if (typeof obj['timestamp'] !== 'string' || obj['timestamp'] === '') {
      return jsonResponse({ error: 'missing_timestamp' }, 400)
    }

    const slug = obj['slug'] as string
    const timestamp = obj['timestamp'] as string

    // Read the history snapshot. Wrapped in try/catch so a corrupt JSON
    // file or transient disk error returns a structured 500 instead of
    // an uncaught exception — matches the discipline of every sibling
    // handler in this file (read / list / delete / unpublish / rollback's
    // own publishDraft block below). Same shape as `listHistory`'s
    // `read_history_snapshot_failed` path.
    let snapshot: Page | null
    try {
      snapshot = await contentAdapter.readHistorySnapshot(slug, timestamp)
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'read_history_snapshot_failed', message: safeErrorMessage(err) },
        500,
      )
    }
    if (snapshot === null) {
      return jsonResponse({ error: 'snapshot_not_found' }, 404)
    }

    // Save the snapshot as a draft, then publish it. This creates a new
    // history entry for the rollback itself, which is correct: the
    // rollback is a new version that happens to have old content.
    try {
      await contentAdapter.saveDraft(snapshot)
      await runtime.publishDraft(slug)
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'rollback_failed', message: safeErrorMessage(err) },
        500,
      )
    }

    return jsonResponse({ ok: true }, 200)
  }

  const rename = async (req: Request): Promise<Response> => {
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

    if (typeof obj['fromSlug'] !== 'string' || obj['fromSlug'] === '') {
      return jsonResponse({ error: 'missing_from_slug' }, 400)
    }
    if (typeof obj['toSlug'] !== 'string' || obj['toSlug'] === '') {
      return jsonResponse({ error: 'missing_to_slug' }, 400)
    }

    const fromSlug = obj['fromSlug'] as string
    const toSlug = obj['toSlug'] as string

    const reservedToSlug = reservedSlugResponse(toSlug, 'reserved_to_slug')
    if (reservedToSlug) return reservedToSlug

    try {
      await contentAdapter.renamePage(fromSlug, toSlug)
    } catch (err: unknown) {
      const message = safeErrorMessage(err)
      if (message.includes('page not found')) {
        return jsonResponse({ error: message }, 404)
      }
      if (message.includes('target slug already exists')) {
        return jsonResponse({ error: message }, 409)
      }
      return jsonResponse({ error: message }, 500)
    }

    return jsonResponse({ ok: true }, 200)
  }

  const duplicate = async (req: Request): Promise<Response> => {
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

    if (typeof obj['slug'] !== 'string' || obj['slug'] === '') {
      return jsonResponse({ error: 'missing_slug' }, 400)
    }
    if (typeof obj['newSlug'] !== 'string' || obj['newSlug'] === '') {
      return jsonResponse({ error: 'missing_new_slug' }, 400)
    }

    const slug = obj['slug'] as string
    const newSlug = obj['newSlug'] as string

    // Shape check for newSlug. The source slug is trusted because it came
    // from the pages list, but the new slug is user input. We re-check
    // shape here (even though the adapter would throw) so the response is
    // a clean 400 instead of a 500 from an unhandled adapter error.
    if (!SLUG_PATTERN.test(newSlug)) {
      return jsonResponse({ error: 'invalid_new_slug', message: 'Slug must contain only letters, numbers, hyphens, underscores, and forward slashes.' }, 400)
    }

    const reservedNewSlug = reservedSlugResponse(newSlug, 'reserved_new_slug')
    if (reservedNewSlug) return reservedNewSlug

    if (newSlug === slug) {
      return jsonResponse({ error: 'same_slug', message: 'newSlug must differ from slug' }, 400)
    }

    // Collision check — refuse to clobber an existing page or draft.
    // We do NOT auto-increment the slug; the UI is responsible for
    // choosing a suitable target (the spec is explicit about this).
    // NOTE: this check + the later saveDraft are three separate IO ops
    // with no cross-operation lock — two concurrent duplicates targeting
    // the same newSlug could both pass and the second would clobber the
    // first. Accepted trade-off for v1 (single-user editor); see
    // ARCHITECTURE.md §11.
    const existingPublished = await contentAdapter.readPage(newSlug, 'published')
    const existingDraft = await contentAdapter.readPage(newSlug, 'draft')
    if (existingPublished !== null || existingDraft !== null) {
      return jsonResponse({ error: 'slug_exists', message: `Slug "${newSlug}" is already in use.` }, 409)
    }

    // Load the source. Prefer published because that's the version users
    // typically mean by "duplicate this page"; fall back to draft if the
    // page has never been published.
    const source =
      (await contentAdapter.readPage(slug, 'published')) ??
      (await contentAdapter.readPage(slug, 'draft'))
    if (source === null) {
      return jsonResponse({ error: 'source_not_found', message: `No page found for slug: ${slug}` }, 404)
    }

    // Deep-clone: regenerate section ids (uniqueness per page), preserve
    // section data / globalRef / type verbatim, and ride ALL page-level
    // metadata (seo, tags, excerpt, coverImage, publishedAt, …) through
    // unchanged. Spread-then-override so any future field added to `Page`
    // is preserved by default rather than silently dropped.
    const clonedSections = source.sections.map(cloneSection)
    const { sections: _srcSections, slug: _srcSlug, ...metaFromSource } = source
    void _srcSections
    void _srcSlug
    const clone: Page = {
      ...metaFromSource,
      slug: newSlug,
      sections: clonedSections,
    }

    try {
      await contentAdapter.saveDraft(clone)
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'duplicate_failed', message: safeErrorMessage(err) },
        500,
      )
    }

    return jsonResponse({ ok: true, slug: newSlug }, 200)
  }

  return { list, read, deletePage, unpublish, listHistory, rollback, rename, duplicate }
}
