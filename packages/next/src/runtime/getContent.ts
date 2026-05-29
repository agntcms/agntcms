// `getContent` + `publishDraft` runtime implementation (T-008).
//
// This is the core of the dual-mode content reading API described in
// ARCHITECTURE.md section 6. The factory `createRuntime` takes a content
// adapter via dependency injection and returns the two operations the
// runtime needs. No global state, no module-level singletons — the
// adapter is injected so tests can substitute a real or fake adapter
// without ceremony.
//
// SLOT-WRAPPING DOES NOT HAPPEN HERE — DO NOT "HARMONIZE"
// -------------------------------------------------------
// EDITABILITY_DESIGN.md (decision #5) introduces `EditableSlot<K, V>` —
// the opaque section-component prop shape that turns raw renders like
// `<h1>{title}</h1>` into TS errors. Slot wrapping happens INSIDE
// `SectionRenderer` (sub-task 2) via `wrapAsSlot` from `sections/`,
// NOT here.
//
// The reason is the public preview/published contract: `getContent`
// returns BARE DATA in published mode (zero allocation, the prod hot
// path) and `PreviewField`-wrapped data in preview mode (origin
// metadata for the editor). This is the public-API shape ARCHITECTURE.md
// §6 names as the "single most delicate point". Wrapping every value
// here in an additional slot layer would (a) change the public preview/
// published return shape, breaking every external consumer of
// `getContent`, and (b) double-wrap on the SectionRenderer path. The
// slot is a SectionRenderer-↔-section-component-internal representation
// only.
//
// A future reviewer who tries to "unify" the two by wrapping at this
// layer is breaking the public contract. Don't.
//
// The two code paths in `getContent` have fundamentally different goals:
//
//   'published' — the prod hot path. Returns the bare Page the adapter
//     returns, with zero allocation, zero per-field wrapping. A page read
//     a million times per minute must not pay for editor metadata.
//
//   'preview' — the editor path. Reads draft-first (falling back to
//     published when no draft exists), then wraps every field in every
//     section with a `PreviewField<T>` carrying origin metadata that the
//     `EditableText` / `EditableImage` components (T-016) need for the
//     save round-trip.
//
// Import policy: this file imports from `../domain/` and `../storage/`.
// It MUST NOT import from `../sections/`, `../react/`, `../handlers/`,
// `../mcp/`, `../tasks/`, or `../config/`. It uses `node:crypto` for the
// revision hash.

import { createHash } from 'node:crypto'

import type { Global, Page, Section } from '../domain/index'
import { assertValidPage, normalizeLinkValue } from '../domain/index'
import type { ContentStorageAdapter } from '../storage/content'
import type {
  PreviewField,
  PreviewFieldOrigin,
  PreviewMode,
} from './getContent.types'
import { createGetGlobal, type GetGlobal } from './getGlobal'
import { createListPages, type ListPages } from './listPages'

// ---------------------------------------------------------------------------
// Factory types
// ---------------------------------------------------------------------------

/** Dependencies for the runtime. */
export interface RuntimeOptions {
  readonly contentAdapter: ContentStorageAdapter
}

/**
 * The runtime surface returned by `createRuntime`. This is what
 * `defineConfig` (T-019) will later wire up and what the handlers
 * layer consumes.
 */
export interface Runtime {
  /**
   * Read a page in the requested mode.
   *
   * In 'published' mode the bare `Page` from the adapter is returned
   * as-is — zero allocation, no wrapping.
   *
   * In 'preview' mode every field value in every section is wrapped in
   * a `PreviewField` carrying origin metadata. The runtime tries the
   * draft bucket first and falls back to the published bucket.
   *
   * Returns `null` when neither bucket has a page for the given slug.
   */
  readonly getContent: (
    options: GetContentInput,
  ) => Promise<Page | null>

  /**
   * Thin wrapper over the adapter's `publishDraft`. Git commits are
   * T-009's scope — this function does NOT touch git.
   */
  readonly publishDraft: (slug: string) => Promise<Page>

  /**
   * Read a named global in the requested mode.
   *
   * Mirrors `getContent`'s dual nature (ARCHITECTURE.md §6) for
   * standalone globals. In `'published'` mode returns the bare
   * `Global`; in `'preview'` mode wraps every field in `PreviewField`
   * with a `kind: 'global'` origin and composes draft → published
   * (same fallback rule as page content). `PreviewFieldOrigin.source`
   * reflects which bucket fed the data. See `runtime/getGlobal.ts`
   * header for the full rationale.
   *
   * Returns `null` when no global with `name` exists in either bucket.
   */
  readonly getGlobal: GetGlobal

  /**
   * Return metadata-only summaries of every published page, optionally
   * filtered by a single tag and capped by `limit`. Used by user-defined
   * listing sections (e.g. PostList) for blog-index-style queries.
   *
   * See `runtime/listPages.ts` for the sort and filter semantics
   * (ARCHITECTURE.md §4).
   */
  readonly listPages: ListPages
}

export type { GetGlobal, GetGlobalInput } from './getGlobal'

export interface GetContentInput {
  readonly slug: string
  readonly mode: PreviewMode
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Link-value migration adapter
//
// `LinkValue` changed shape from the legacy `{ href, label, external? }`
// to a discriminated `{ type: 'internal'|'external', ... }` union (see
// `domain/fields.ts` and `domain/link.ts`). Content authored under the
// old shape may still live in `content/**/*.json` until the skills-dev
// migration runs. We normalise on read so section components can rely
// on the new shape unconditionally and never crash on unmigrated data.
//
// The runtime does not know section schemas (data is `Record<string,
// unknown>`), so the detection is structural: an object is treated as
// a link if it carries the new discriminator OR the legacy `{ href,
// label }` pair. Non-link objects (images, reference values, list
// items) are walked recursively so a link nested inside a list cell
// is normalised too. Primitives pass through unchanged.

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const looksLikeLink = (obj: Record<string, unknown>): boolean => {
  if (obj['type'] === 'internal' || obj['type'] === 'external') return true
  // Legacy shape: a string `href` plus a string `label`. The `_id`
  // exclusion guards against an unlikely list-item that happened to
  // carry an `href`/`label` pair — list items always carry `_id`.
  return (
    typeof obj['href'] === 'string' &&
    typeof obj['label'] === 'string' &&
    obj['_id'] === undefined
  )
}

/**
 * Recursively normalise link-shaped values within a section's `data`.
 *
 * Objects matching `looksLikeLink` are projected onto the canonical
 * `LinkValue`; arrays and other plain objects are walked so links
 * nested inside `ListField` cells are normalised too. The walk allocates
 * fresh containers only when something actually changes — the common
 * "no links" case returns the input by reference for a zero-cost
 * passthrough on the published hot path.
 */
const normalizeLinks = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((entry) => {
      const normalised = normalizeLinks(entry)
      if (normalised !== entry) changed = true
      return normalised
    })
    return changed ? next : value
  }
  if (isPlainObject(value)) {
    if (looksLikeLink(value)) {
      return normalizeLinkValue(value)
    }
    let changed = false
    const next: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      const normalised = normalizeLinks(value[key])
      if (normalised !== value[key]) changed = true
      next[key] = normalised
    }
    return changed ? next : value
  }
  return value
}

/**
 * Apply `normalizeLinks` across every section's data. Returns the same
 * `sections` reference when no link-shaped values were rewritten so the
 * published path keeps its zero-allocation guarantee for content that
 * has already been migrated.
 */
const normalizeLinksInSections = (
  sections: readonly Section[],
): readonly Section[] => {
  let changed = false
  const next = sections.map((section) => {
    const normalisedData = normalizeLinks(section.data) as Record<string, unknown>
    if (normalisedData === section.data) return section
    changed = true
    return {
      id: section.id,
      type: section.type,
      data: normalisedData,
      ...(section.globalRef !== undefined ? { globalRef: section.globalRef } : {}),
    }
  })
  return changed ? next : sections
}

/**
 * SHA-256 hex hash of the serialized page. Used as the `revision` in
 * `PreviewFieldOrigin` so the save round-trip can detect content drift
 * without adapter-level bookkeeping.
 */
const computeRevision = (page: Page): string => {
  const serialized = JSON.stringify(page)
  return createHash('sha256').update(serialized).digest('hex')
}

/**
 * Replace the `sections` array on a `Page` while preserving every other
 * key (slug, seo, tags, excerpt, coverImage, publishedAt, …) that the
 * source page carried. Used on the rebuild paths in `getContent` after
 * global-ref resolution / preview-field wrapping.
 *
 * Why a helper: under `exactOptionalPropertyTypes` we cannot blindly
 * write `undefined` into optional fields, and listing every metadata
 * field by name in two places (published-rebuild and preview-result)
 * would silently regress whenever a new optional field is added to
 * `Page` (the bug B1 found). Object spread over `page` does the right
 * thing because absent optional keys are simply not enumerable.
 */
const withSections = (page: Page, sections: readonly Section[]): Page => ({
  ...page,
  sections,
})

/**
 * Wrap every field value in a section's data with `PreviewField`.
 * `data` is `Record<string, unknown>` at runtime — the adapter
 * returns `Section<string, unknown>` and we cannot know the concrete
 * field types. The wrapping is purely structural: we iterate the keys
 * and wrap each value. The type-level machinery in
 * `getContent.types.ts` ensures callers see the correctly-typed
 * `PreviewField<T>` shapes.
 */
const wrapSectionData = (
  section: Section,
  pageSlug: string,
  source: 'draft' | 'published',
  revision: string,
): Record<string, PreviewField<unknown>> => {
  const data = section.data as Record<string, unknown>
  const wrapped: Record<string, PreviewField<unknown>> = {}
  for (const key of Object.keys(data)) {
    const origin: PreviewFieldOrigin = {
      pageSlug,
      sectionId: section.id,
      fieldPath: key,
      source,
      revision,
    }
    wrapped[key] = {
      __agntcmsPreview: true,
      value: data[key],
      origin,
    }
  }
  return wrapped
}

// ---------------------------------------------------------------------------
// Helpers — global reference resolution
// ---------------------------------------------------------------------------

/**
 * Resolve global references in a page's sections. For each section with a
 * `globalRef`, reads the named global from the adapter and replaces the
 * section's `type` and `data` with the global's values. The `id` and
 * `globalRef` are preserved so downstream code knows this section is backed
 * by a global.
 *
 * If the global doesn't exist (deleted or never created), the section
 * passes through unchanged and a warning is logged. The SectionRenderer
 * will show its "unknown type" error box, which is acceptable degradation.
 *
 * This step runs BEFORE preview-mode field wrapping so the wrapping sees
 * the actual global data, not a placeholder.
 *
 * `pageMode` controls which global bucket(s) we consult:
 *   - 'published': only the published global. Production must NEVER
 *     leak draft globals into the live site — mirror of the
 *     `readPage(_, 'published')` rule.
 *   - 'preview': compose draft → published, same discipline as
 *     `getGlobal` in preview. The editor sees "what they last saved",
 *     and a missing draft transparently falls back to the live global.
 */
const resolveGlobalRefs = async (
  sections: readonly Section[],
  contentAdapter: ContentStorageAdapter,
  pageMode: 'published' | 'preview',
): Promise<readonly Section[]> => {
  // Fast path: skip when no sections reference globals.
  if (!sections.some((s) => s.globalRef !== undefined)) return sections

  const readResolved = async (name: string): Promise<Global | null> => {
    if (pageMode === 'published') {
      return contentAdapter.readGlobal(name, 'published')
    }
    // Preview: draft first, fall back to published. Composition lives
    // in the runtime, not the adapter (storage/content.ts header).
    const draft = await contentAdapter.readGlobal(name, 'draft')
    if (draft !== null) return draft
    return contentAdapter.readGlobal(name, 'published')
  }

  const resolved = await Promise.all(
    sections.map(async (section): Promise<Section> => {
      if (section.globalRef === undefined) return section

      const global = await readResolved(section.globalRef)
      if (global === null) {
        // Graceful degradation: keep the section as-is. The missing global
        // will surface as an "unknown type" in the renderer.
        console.warn(
          `[agntcms] global "${section.globalRef}" referenced by section "${section.id}" not found — keeping section as-is`,
        )
        return section
      }

      return {
        id: section.id,
        type: global.type,
        data: global.data,
        globalRef: section.globalRef,
      }
    }),
  )

  return resolved
}

// ---------------------------------------------------------------------------
// Helpers — error classification
// ---------------------------------------------------------------------------

/**
 * Returns true when the error was thrown by the storage layer because the
 * slug itself is syntactically invalid (contains dots, special chars, etc.).
 *
 * Why catch instead of duplicating the regex from storage?  The slug format
 * is a storage-layer concern.  Duplicating it here would couple runtime to
 * storage internals and create a maintenance hazard (invariant 1).  The
 * try/catch lets runtime stay agnostic about what "valid" means while still
 * converting a known-benign error class into a `null` return.
 */
const isInvalidSlugError = (err: unknown): boolean =>
  err instanceof Error && err.message.startsWith('invalid slug:')

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the runtime that powers `getContent` and `publishDraft`.
 *
 * The adapter is injected — no global state, no singleton. This is the
 * shape `defineConfig` (T-019) will later construct under the hood.
 */
export function createRuntime(options: RuntimeOptions): Runtime {
  const { contentAdapter } = options

  const getContent = async (
    input: GetContentInput,
  ): Promise<Page | null> => {
    const { slug, mode } = input

    // -----------------------------------------------------------------------
    // PUBLISHED MODE — prod hot path
    // -----------------------------------------------------------------------
    //
    // Return the bare Page from the adapter with zero allocation. This is
    // the path that matters for performance: no wrapping, no hashing, no
    // per-field object construction.
    //
    // The catch converts syntactically-invalid slugs (dots, specials) into
    // null so the catch-all route can return 404 instead of 500. Real I/O
    // errors are rethrown.
    if (mode === 'published') {
      let page: Page | null
      try {
        page = await contentAdapter.readPage(slug, 'published')
      } catch (err) {
        if (isInvalidSlugError(err)) return null
        throw err
      }
      if (page === null) return null

      // Storage→runtime validation: the agent's native file-edit tools
      // can write JSON directly to disk, bypassing the HTTP write path's
      // schema check. Validate the basic-SEO contract here so a bad
      // `seo.title`/`seo.description` surfaces as a loud error instead
      // of a silent `<title>undefined</title>` in the layout.
      assertValidPage(page)

      // Resolve global references before returning so consumers see the
      // global's type + data without needing to know about globals.
      // Production: only the published global, never a draft.
      const resolved = await resolveGlobalRefs(page.sections, contentAdapter, 'published')
      // Normalise legacy `{ href, label }` link payloads to the new
      // discriminated `LinkValue`. Returns the input by reference when
      // nothing matched, preserving the zero-allocation hot path for
      // content that has already been migrated.
      const sections = normalizeLinksInSections(resolved)
      if (sections === page.sections) return page // no globals, no legacy links — zero alloc

      // Rebuild only when globals were resolved or links normalised. We
      // must preserve every metadata field on `page` (seo, tags,
      // excerpt, coverImage, publishedAt) — listing keys by name
      // silently dropped them when new optionals landed (regression B1).
      // `withSections` spreads.
      return withSections(page, sections)
    }

    // -----------------------------------------------------------------------
    // PREVIEW MODE — editor path
    // -----------------------------------------------------------------------
    //
    // 1. Try the draft bucket first.
    // 2. Fall back to the published bucket.
    // 3. If both are null, there is nothing to show.
    // 4. Wrap every field value with PreviewField carrying origin metadata.
    //
    // Same invalid-slug guard as published mode: dots and specials → null.

    let page: Page | null
    let source: 'draft' | 'published' = 'draft'

    try {
      page = await contentAdapter.readPage(slug, 'draft')
    } catch (err) {
      if (isInvalidSlugError(err)) return null
      throw err
    }

    if (page === null) {
      try {
        page = await contentAdapter.readPage(slug, 'published')
      } catch (err) {
        if (isInvalidSlugError(err)) return null
        throw err
      }
      source = 'published'
    }

    if (page === null) {
      return null
    }

    // Same storage→runtime validation as the published branch. The
    // preview path runs against draft OR published JSON, both of which
    // can be written by the agent's file tools; validate before any
    // rebuild so origin errors point at the bad page rather than
    // surfacing later as an undefined wrapped field.
    assertValidPage(page)

    // Resolve global references BEFORE wrapping so the PreviewField
    // wrapping sees the actual global data (type + data), not a placeholder.
    // Preview: compose draft → published per global, mirror of getGlobal.
    const resolvedSections = await resolveGlobalRefs(page.sections, contentAdapter, 'preview')
    // Normalise legacy `{ href, label }` link payloads BEFORE wrapping
    // so the editor's `EditableLink` always sees the new discriminated
    // shape and never has to branch on legacy data.
    const normalisedSections = normalizeLinksInSections(resolvedSections)

    // Hash the post-resolution shape so the revision matches what the
    // editor actually rendered. Hashing the pre-resolution `page`
    // produced a revision that would not match the resolved snapshot
    // an `EditableText` save round-tripped against (regression I12).
    const revision = computeRevision(withSections(page, normalisedSections))

    const wrappedSections: Section[] = normalisedSections.map((section) => ({
      id: section.id,
      type: section.type,
      data: wrapSectionData(section, slug, source, revision),
      // Preserve globalRef so the UI knows this section is backed by a global
      // and can redirect saves to the global endpoint.
      ...(section.globalRef !== undefined ? { globalRef: section.globalRef } : {}),
    }))

    // Build the result page, preserving every metadata field on the
    // source (seo, tags, excerpt, coverImage, publishedAt). See
    // `withSections` for why the spread is the right shape under
    // `exactOptionalPropertyTypes`.
    return withSections(page, wrappedSections)
  }

  const publishDraft = async (slug: string): Promise<Page> => {
    // Defense in depth at the publish boundary. The FS adapter's
    // `publishDraft` already calls `assertValidPage` before promoting
    // the file from `drafts/` to `pages/`, but a future adapter (remote
    // store, custom backend) might forget — and the agent's native
    // file-edit path can write malformed JSON straight to `drafts/`,
    // bypassing the HTTP `parseSaveBody` gate. Reading the draft and
    // validating here ensures every `runtime.publishDraft` caller hits
    // the same contract the storage→runtime read enforces. Mirrors the
    // pattern used in `getContent` (read) and `parseSaveBody` (write).
    const draft = await contentAdapter.readPage(slug, 'draft')
    if (draft === null) {
      throw new Error(`no draft to publish for slug: ${JSON.stringify(slug)}`)
    }
    assertValidPage(draft)

    // Git commits are T-009's scope.
    return contentAdapter.publishDraft(slug)
  }

  const getGlobal = createGetGlobal(contentAdapter)
  const listPages = createListPages({ contentAdapter })

  return { getContent, publishDraft, getGlobal, listPages }
}
