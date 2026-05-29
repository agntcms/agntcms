import type { ImageValue } from './fields'
import type { Section } from './section'

// A `Page` is a thin metadata wrapper around an ordered array of sections.
// ARCHITECTURE.md §4 is explicit: all typing and rendering logic lives at the
// section level, not the page level. Keep this shape minimal — if §4 does not
// name a metadata field, it does not belong here.
//
// `sections` is a plain `Section[]` (the open generic form). Concrete section
// types come from T-003's section registry; the domain layer does not know
// about them.
//
// Phase 5 metadata fields (`tags`, `excerpt`, `coverImage`, `publishedAt`)
// are flat top-level optionals — same shape as `seo` — because they are
// general-purpose, not blog-specific (ARCHITECTURE.md §4). They are read
// by `listPages` for blog-index-style queries and rendered by user-defined
// listing sections (e.g. PostList).

// SEO is required on every page. `title` and `description` are mandatory
// because basic SEO must be guaranteed across the framework — there are no
// fallbacks at the runtime layer (`generateMetadata` does not derive a
// title from headings or a description from body text). `ogImage` and
// `canonical` are optional escape hatches for per-page overrides; when
// `canonical` is absent the template's `generateMetadata` derives it from
// `metadataBase + slug`, which is a skills-layer concern.
export interface PageSeo {
  readonly title: string
  readonly description: string
  readonly ogImage?: ImageValue
  readonly canonical?: string
}

export interface Page {
  readonly slug: string
  readonly seo: PageSeo
  /**
   * Tags for `listPages` filtering. Matching is case-sensitive exact:
   * `tags: ['Post']` does NOT match a query for `tag=post`.
   * (See ARCHITECTURE.md §4.)
   */
  readonly tags?: readonly string[]
  /** Short summary used by listing sections (PostList etc.). */
  readonly excerpt?: string
  /** Cover image for listing sections / blog cards. */
  readonly coverImage?: ImageValue
  /**
   * ISO 8601 publication date used by `listPages` for sorting. When
   * absent, the runtime falls back to the storage adapter's "last
   * modified" timestamp (file mtime for the FS adapter).
   */
  readonly publishedAt?: string
  readonly sections: readonly Section[]
}

/**
 * `Page` without `sections` — the metadata-only projection returned by
 * `listPages`. Used for blog-index-style listing pages where loading
 * every page's full section tree would be wasteful.
 *
 * Defined as `Omit<Page, 'sections'>` so adding a new metadata field to
 * `Page` automatically widens `PageSummary` — no two-place edits.
 */
export type PageSummary = Omit<Page, 'sections'>

// ---------------------------------------------------------------------------
// Runtime validation
// ---------------------------------------------------------------------------

/**
 * Shared core for `assertValidPage` and `assertValidPageSummary`. Checks
 * the slug + seo fields that both shapes require — split out so the
 * summary projection (which lacks `sections`) can reuse the exact same
 * rules without copy-pasting them.
 */
function assertValidPageMeta(obj: Record<string, unknown>): asserts obj is {
  slug: string
  seo: { title: string; description: string }
} {
  // Slug is included in error messages below for debuggability. We do
  // NOT validate slug shape here — that is a storage-layer concern
  // (`assertValidSlug` in fs/content.ts) bound to the filesystem rules.
  // The domain only requires that slug is a non-empty string.
  if (typeof obj['slug'] !== 'string' || obj['slug'] === '') {
    throw new Error('invalid page: missing or empty slug')
  }
  const slug = obj['slug']

  const rawSeo = obj['seo']
  if (rawSeo === null || typeof rawSeo !== 'object') {
    throw new Error(`invalid page "${slug}": seo must be an object`)
  }
  const seo = rawSeo as Record<string, unknown>

  if (typeof seo['title'] !== 'string' || seo['title'].trim() === '') {
    throw new Error(
      `invalid page "${slug}": seo.title must be a non-empty string`,
    )
  }
  if (
    typeof seo['description'] !== 'string' ||
    seo['description'].trim() === ''
  ) {
    throw new Error(
      `invalid page "${slug}": seo.description must be a non-empty string`,
    )
  }

  // Optional `canonical` is conditionally validated: when absent the
  // template's `generateMetadata` derives canonical from `metadataBase +
  // slug`, but a present-but-empty value short-circuits that fallback in
  // the consumer (`page.seo.canonical ?? derived`) and emits
  // `<link rel="canonical" href="">`, which is worse than no tag.
  // Whitespace-only is treated the same as empty for the same reason as
  // title/description above.
  if (seo['canonical'] !== undefined) {
    if (
      typeof seo['canonical'] !== 'string' ||
      seo['canonical'].trim() === ''
    ) {
      throw new Error(
        `invalid page "${slug}": seo.canonical, when present, must be a non-empty string`,
      )
    }
  }
}

/**
 * Assert that `page` is a structurally valid `Page` with the basic-SEO
 * fields populated. Used as a defense-in-depth guard at every boundary
 * where untyped JSON becomes a `Page`:
 *
 *   - storage→runtime read: the agent's native file-edit path writes
 *     JSON directly to disk; without this check, a missing or empty
 *     `seo.title` propagates `undefined`/`''` into typed string fields
 *     that downstream `<title>` / `<meta>` tags assume are present.
 *   - HTTP write: `parseSaveBody` delegates here so the handler returns
 *     400 on the same conditions that the read path would crash on.
 *
 * Trimmed-empty strings (`'   '`) are rejected too — a whitespace-only
 * title would render as a visually-empty `<title>` tag, which is
 * indistinguishable from no title at all and breaks the basic-SEO
 * guarantee just as badly.
 *
 * The function is intentionally narrow: it validates the *minimum* the
 * runtime depends on (slug + seo.title + seo.description, plus the
 * presence-conditional shape of seo.canonical). Field-level validation
 * of section data is not in scope — sections are checked at their own
 * boundaries.
 */
export function assertValidPage(page: unknown): asserts page is Page {
  if (page === null || typeof page !== 'object') {
    throw new Error('invalid page: expected an object')
  }
  const obj = page as Record<string, unknown>

  // Field-order matters: callers (notably the HTTP write handler) have
  // historically reported errors in slug → sections → seo order. Keep
  // the same order so failure modes don't shift under the editor's UI.
  if (typeof obj['slug'] !== 'string' || obj['slug'] === '') {
    throw new Error('invalid page: missing or empty slug')
  }
  const slug = obj['slug']

  if (!Array.isArray(obj['sections'])) {
    throw new Error(`invalid page "${slug}": sections must be an array`)
  }

  // `assertValidPageMeta` re-checks slug; that is intentional — it is
  // the shared core for `assertValidPageSummary` too, which has no
  // sections to gate on.
  assertValidPageMeta(obj)
}

/**
 * `PageSummary` variant of `assertValidPage`. Same slug + seo guarantee
 * as the full page, minus the `sections` check. Used by `listPages` so
 * a malformed page on disk fails loudly through the listing endpoint
 * the same way it would through `getContent`.
 */
export function assertValidPageSummary(
  summary: unknown,
): asserts summary is PageSummary {
  if (summary === null || typeof summary !== 'object') {
    throw new Error('invalid page summary: expected an object')
  }
  assertValidPageMeta(summary as Record<string, unknown>)
}
