// Draft management route handlers (T-013).
//
// Three endpoints for the draft lifecycle: save a full-page draft,
// list all pending drafts, and publish (promote) a draft. These are
// thin HTTP wrappers over the content adapter and runtime — validation,
// serialisation, and error mapping only. No business logic lives here.
//
// Import policy (ARCHITECTURE.md §8, Invariant 1):
//   handlers/ may import from domain/, storage/, and runtime/.
//   It MUST NOT import from react/, mcp/, tasks/, sections/, or config/.

import type { Page, Section } from '../../domain/index'
import { assertValidPage } from '../../domain/index'
import type { ContentStorageAdapter, DraftSummary } from '../../storage/content'
import type { Runtime } from '../../runtime/getContent'
import { getReservedPageSlugViolation } from '../../runtime/systemPages'
import { jsonResponse, safeErrorMessage } from '../utils'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DraftHandlerDeps {
  readonly contentAdapter: ContentStorageAdapter
  readonly runtime: Runtime
  /**
   * Per-type default section payloads. Used by `replaceSection` to fill
   * the data of a newly-swapped section. Mirrors the same field on
   * `GlobalHandlerDeps` and `GlobalDraftHandlerDeps` so the wiring layer
   * (`deriveHandlerDeps(config)` — see `config/derive.ts`) can fan out
   * a single ReadonlyMap to all three handler deps.
   *
   * Optional because:
   *   - `replaceSection` is the only consumer; the other endpoints
   *     ignore this field.
   *   - Templates wired before v0.5 can keep working (the existing
   *     handlers stay unchanged); only the new endpoint refuses to
   *     replace when defaults are missing.
   */
  readonly sectionDefaults?: ReadonlyMap<string, Readonly<Record<string, unknown>>>
}

export interface DraftHandler {
  /** POST /api/agntcms/draft/save -- save a draft page */
  readonly save: (req: Request) => Promise<Response>
  /** GET /api/agntcms/draft/list -- list all drafts */
  readonly list: (req: Request) => Promise<Response>
  /** POST /api/agntcms/draft/publish -- publish a draft */
  readonly publish: (req: Request) => Promise<Response>
  /** POST /api/agntcms/draft/reorder -- reorder sections within a draft */
  readonly reorder: (req: Request) => Promise<Response>
  /** POST /api/agntcms/draft/discard -- delete a draft (published version must exist) */
  readonly discard: (req: Request) => Promise<Response>
  /**
   * POST /api/agntcms/draft/replace-section -- swap a section's type in
   * a draft, replacing its data with the new type's default payload.
   * The section's `id` is preserved so the preview tree re-renders the
   * same slot rather than remounting from scratch.
   */
  readonly replaceSection: (req: Request) => Promise<Response>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate the save request body. Returns a well-formed `Page` on
 * success or a 400 `Response` on failure.
 *
 * Delegates to the domain-layer `assertValidPage` so the HTTP write
 * boundary and the storage→runtime read boundary share a single
 * source of truth for "what makes a Page valid". Defense in depth:
 * the agent's file-edit path goes through read, the editor's HTTP path
 * goes through write — both are now covered by the same rules.
 */
const parseSaveBody = (body: unknown): Page | Response => {
  if (body === null || typeof body !== 'object') {
    return jsonResponse({ error: 'invalid_body', message: 'Expected a JSON object' }, 400)
  }

  try {
    assertValidPage(body)
  } catch (err) {
    // Preserve the historical 400 error code (`missing_field`). The
    // validator's message already pinpoints the offending field — we
    // forward it verbatim so the client UI can show a useful message.
    return jsonResponse(
      { error: 'missing_field', message: safeErrorMessage(err) },
      400,
    )
  }

  const reservedSlug = getReservedPageSlugViolation(body.slug)
  if (reservedSlug) {
    return jsonResponse(
      { error: 'reserved_slug_alias', message: reservedSlug.message },
      400,
    )
  }

  // `assertValidPage` narrows `body` to `Page`. The reshape below
  // enumerates the canonical Page fields so unknown TOP-LEVEL keys on
  // the request body are not persisted. It does NOT validate nested
  // fields (e.g. unknown keys inside `seo` or `coverImage`); page
  // metadata is not user-rendered, so deeper reshape is YAGNI for v0.1.
  //
  // When `Page` gains a new optional metadata field, add it to the
  // spread chain below — otherwise it will be silently dropped on save.
  // Optional fields are spread conditionally so they round-trip when
  // present and stay absent when missing (`exactOptionalPropertyTypes`).
  const page: Page = {
    slug: body.slug,
    seo: body.seo,
    sections: body.sections,
    ...(body.tags !== undefined ? { tags: body.tags } : {}),
    ...(body.excerpt !== undefined ? { excerpt: body.excerpt } : {}),
    ...(body.coverImage !== undefined ? { coverImage: body.coverImage } : {}),
    ...(body.publishedAt !== undefined ? { publishedAt: body.publishedAt } : {}),
  }

  return page
}

/**
 * Validate the publish request body. Returns the slug on success or
 * a 400 `Response` on failure.
 */
const parsePublishBody = (body: unknown): string | Response => {
  if (body === null || typeof body !== 'object') {
    return jsonResponse({ error: 'invalid_body', message: 'Expected a JSON object' }, 400)
  }

  const obj = body as Record<string, unknown>

  if (typeof obj['slug'] !== 'string' || obj['slug'] === '') {
    return jsonResponse(
      { error: 'missing_field', message: 'Missing or empty required field: slug' },
      400,
    )
  }

  return obj['slug'] as string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDraftHandler(deps: DraftHandlerDeps): DraftHandler {
  const { contentAdapter, runtime } = deps
  const sectionDefaults = deps.sectionDefaults

  const save = async (req: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_body', message: 'Invalid JSON' }, 400)
    }

    const pageOrError = parseSaveBody(body)
    if (pageOrError instanceof Response) return pageOrError
    const page = pageOrError

    try {
      await contentAdapter.saveDraft(page)
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'save_failed', message: safeErrorMessage(err) },
        500,
      )
    }

    return jsonResponse({ ok: true }, 200)
  }

  const list = async (_req: Request): Promise<Response> => {
    let drafts: ReadonlyArray<DraftSummary>
    try {
      drafts = await contentAdapter.listDrafts()
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'list_failed', message: safeErrorMessage(err) },
        500,
      )
    }

    // Serialize updatedAt as ISO string for JSON transport.
    const serialized = drafts.map((d) => ({
      slug: d.slug,
      updatedAt: d.updatedAt.toISOString(),
    }))

    return jsonResponse({ drafts: serialized }, 200)
  }

  const publish = async (req: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_body', message: 'Invalid JSON' }, 400)
    }

    const slugOrError = parsePublishBody(body)
    if (slugOrError instanceof Response) return slugOrError
    const slug = slugOrError

    let page: Page
    try {
      page = await runtime.publishDraft(slug)
    } catch (err: unknown) {
      // The adapter throws when no draft exists for the slug.
      // Map that to a 404.
      return jsonResponse(
        { error: 'not_found', message: safeErrorMessage(err) },
        404,
      )
    }

    return jsonResponse({ ok: true, page }, 200)
  }

  const reorder = async (req: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_body', message: 'Invalid JSON' }, 400)
    }

    if (body === null || typeof body !== 'object') {
      return jsonResponse({ error: 'invalid_body', message: 'Expected a JSON object' }, 400)
    }

    const obj = body as Record<string, unknown>

    if (typeof obj['slug'] !== 'string' || obj['slug'] === '') {
      return jsonResponse(
        { error: 'missing_field', message: 'Missing or empty required field: slug' },
        400,
      )
    }

    if (!Array.isArray(obj['order'])) {
      return jsonResponse(
        { error: 'missing_field', message: 'Missing or non-array required field: order' },
        400,
      )
    }

    const slug = obj['slug'] as string
    const order = obj['order'] as string[]

    // Validate that every entry in order is a string.
    if (!order.every((id): id is string => typeof id === 'string')) {
      return jsonResponse(
        { error: 'invalid_field', message: 'order must be an array of string section IDs' },
        400,
      )
    }

    // Read the current page: try draft first, fall back to published.
    let page: Page | null = await contentAdapter.readPage(slug, 'draft')
    if (page === null) {
      page = await contentAdapter.readPage(slug, 'published')
    }
    if (page === null) {
      return jsonResponse({ error: 'not_found', message: `No page found for slug: ${slug}` }, 404)
    }

    // Validate that order contains exactly the same IDs as the current sections.
    const currentIds = page.sections.map((s) => s.id)
    const sortedCurrent = [...currentIds].sort()
    const sortedOrder = [...order].sort()

    if (sortedCurrent.length !== sortedOrder.length) {
      return jsonResponse(
        { error: 'invalid_order', message: 'order must contain exactly the same section IDs as the page' },
        400,
      )
    }
    for (let i = 0; i < sortedCurrent.length; i++) {
      if (sortedCurrent[i] !== sortedOrder[i]) {
        return jsonResponse(
          { error: 'invalid_order', message: 'order must contain exactly the same section IDs as the page' },
          400,
        )
      }
    }

    // Build a lookup map for O(1) access by ID.
    const sectionById = new Map(page.sections.map((s) => [s.id, s]))
    const reordered: Section[] = order.map((id) => sectionById.get(id)!)

    // Build the reordered page. Spread `page` to preserve every metadata
    // field (seo, tags, excerpt, coverImage, publishedAt, …) so future
    // additions ride through automatically — listing fields by name has
    // already burned us once (regression B1, see runtime/getContent.ts).
    const reorderedPage: Page = { ...page, sections: reordered }

    try {
      await contentAdapter.saveDraft(reorderedPage)
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'save_failed', message: safeErrorMessage(err) },
        500,
      )
    }

    return jsonResponse({ ok: true }, 200)
  }

  const discard = async (req: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_body', message: 'Invalid JSON' }, 400)
    }

    // Reuse the same shape validator as `publish` — they share the same
    // request body (`{ slug }`). The adapter re-runs slug-shape validation
    // via `assertValidSlug`, catching anything exotic the handler let pass.
    const slugOrError = parsePublishBody(body)
    if (slugOrError instanceof Response) return slugOrError
    const slug = slugOrError

    // Guard: discarding would lose all editable state if there is no
    // published version to fall back to. Block with a distinct error code
    // so the UI can explain the situation to the user. Using `deletePage`
    // instead would be semantically wrong (it nukes the live page too).
    // NOTE: the readPage + deleteDraft pair is non-atomic — a concurrent
    // deletePage between the two would let the discard proceed even
    // though no published version remains. Accepted trade-off for v1
    // (single-user editor); see ARCHITECTURE.md §11.
    const published = await contentAdapter.readPage(slug, 'published')
    if (published === null) {
      return jsonResponse(
        { error: 'no_published_version', message: `No published version exists for slug: ${slug}. Discarding the draft would lose all data.` },
        400,
      )
    }

    try {
      await contentAdapter.deleteDraft(slug)
    } catch (err: unknown) {
      const message = safeErrorMessage(err)
      // The adapter throws "no draft to discard..." when the file is
      // already gone — map to 404. Any other failure is a 500.
      if (message.includes('no draft to discard')) {
        return jsonResponse({ error: 'not_found', message }, 404)
      }
      return jsonResponse({ error: 'discard_failed', message }, 500)
    }

    return jsonResponse({ ok: true }, 200)
  }

  const replaceSection = async (req: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'invalid_body', message: 'Invalid JSON' }, 400)
    }

    if (body === null || typeof body !== 'object') {
      return jsonResponse({ error: 'invalid_body', message: 'Expected a JSON object' }, 400)
    }

    const obj = body as Record<string, unknown>

    // Three required string fields. Match the validation style of the
    // sibling handlers (one explicit check per field, distinct messages
    // — the UI shows the message verbatim).
    if (typeof obj['pageSlug'] !== 'string' || obj['pageSlug'] === '') {
      return jsonResponse(
        { error: 'missing_field', message: 'Missing or empty required field: pageSlug' },
        400,
      )
    }
    if (typeof obj['sectionId'] !== 'string' || obj['sectionId'] === '') {
      return jsonResponse(
        { error: 'missing_field', message: 'Missing or empty required field: sectionId' },
        400,
      )
    }
    if (typeof obj['newType'] !== 'string' || obj['newType'] === '') {
      return jsonResponse(
        { error: 'missing_field', message: 'Missing or empty required field: newType' },
        400,
      )
    }

    const pageSlug = obj['pageSlug']
    const sectionId = obj['sectionId']
    const newType = obj['newType']

    // Resolve defaults BEFORE touching storage. A missing-type 400 should
    // not also produce a half-completed disk read.
    //
    // No `sectionDefaults` map at all → 400 too. Replacing a section without
    // defaults would silently produce an empty `data: {}` whose rendering
    // depends on the section component's tolerance for missing fields —
    // not a contract we want to take on. The wiring layer
    // (`deriveHandlerDeps`) is the source of truth; templates that don't
    // pass it haven't completed v0.5 migration.
    if (sectionDefaults === undefined) {
      return jsonResponse(
        { error: 'unknown_section_type', message: `Unknown section type: ${newType}` },
        400,
      )
    }
    const defaults = sectionDefaults.get(newType)
    if (defaults === undefined) {
      return jsonResponse(
        { error: 'unknown_section_type', message: `Unknown section type: ${newType}` },
        400,
      )
    }

    // Same draft-or-published fallback as `reorder`: a user can replace
    // a section on a freshly-loaded published page without first making
    // an explicit draft. The new draft is created implicitly by the save.
    let page: Page | null = await contentAdapter.readPage(pageSlug, 'draft')
    if (page === null) {
      page = await contentAdapter.readPage(pageSlug, 'published')
    }
    if (page === null) {
      return jsonResponse(
        { error: 'not_found', message: `No page found for slug: ${pageSlug}` },
        404,
      )
    }

    const index = page.sections.findIndex((s) => s.id === sectionId)
    if (index === -1) {
      return jsonResponse(
        { error: 'not_found', message: `No section found for id: ${sectionId}` },
        404,
      )
    }

    // Preserve the section's `id` so the React tree sees the same key and
    // re-renders the same slot in place. Drop `globalRef` — the replaced
    // section is a fresh local section, not a reference. Spread defaults
    // into a fresh object so the registry's frozen default record stays
    // untouched.
    const replaced: Section = {
      id: sectionId,
      type: newType,
      data: { ...defaults },
    }
    const newSections = [...page.sections]
    newSections[index] = replaced

    // Snapshot save — same reasoning as `reorder`. Spread `page` first
    // so every metadata field (seo, tags, excerpt, coverImage,
    // publishedAt) rides through automatically; listing fields by name
    // has burned us before (regression B1 in runtime/getContent.ts).
    const updatedPage: Page = { ...page, sections: newSections }

    try {
      await contentAdapter.saveDraft(updatedPage)
    } catch (err: unknown) {
      return jsonResponse(
        { error: 'save_failed', message: safeErrorMessage(err) },
        500,
      )
    }

    return jsonResponse({ ok: true }, 200)
  }

  return { save, list, publish, reorder, discard, replaceSection }
}
