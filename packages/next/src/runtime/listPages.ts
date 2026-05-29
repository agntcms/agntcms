// `listPages` runtime helper (Phase 5, ARCHITECTURE.md §4 — Selections).
//
// Returns the metadata projection of every published page, optionally
// filtered by a single tag and capped by `limit`, sorted by `publishedAt`
// (ISO 8601). Used by user code to power blog-index-style listings (e.g.
// PostList) without forcing them to read every page's full section tree.
//
// V1 LIMITATION — `listPages` is published-only.
//
// Unlike `getContent`, `listPages` does NOT have a preview/published
// mode parameter. It always reads from `contentAdapter.listPageSummaries`,
// which surfaces published pages only. A draft-only page (never
// published) will NOT appear in the result, even when called from a
// preview context (e.g. an editor session viewing a `PostList` section).
// To see a draft in a list, the page must first be published.
//
// `getContent` continues to surface drafts when navigated to directly
// (preview mode draft-first), so editors can still preview an unpublished
// post by URL — they just won't see it in an aggregated list yet.
//
// This is an accepted v1 trade-off (KISS / YAGNI). Adding a `mode`
// parameter would be a public-API surface change and is deferred to
// v1.x. Tracked in ARCHITECTURE.md §12.
//
// Sort key:
//
//   1. `publishedAt` (ISO 8601 string, lexicographic order matches
//      chronological order for valid ISO timestamps).
//   2. When `publishedAt` is absent on either side, fall back to
//      `updatedAt` (file mtime for the FS adapter; adapter contract).
//   3. When still tied, slug ascending — gives a stable order so the
//      same query produces the same response across calls.
//
// Tag filtering is case-sensitive exact match (ARCHITECTURE.md §4 design
// decision). A page with `tags: ['Post']` does NOT match `tag: 'post'`.
// Filter language is intentionally minimal in v1 (one tag, limit, sort);
// it can be widened later without breaking changes.
//
// Import policy: runtime → domain, storage. Same as `getContent.ts`.

import type { Page, PageSummary } from '../domain/index'
import { assertValidPageSummary } from '../domain/index'
import type { ContentStorageAdapter, PageSummaryEntry } from '../storage/content'

/** Sort direction for `listPages`. Defaults to `'newest'`. */
export type ListPagesSort = 'newest' | 'oldest'

export interface ListPagesInput {
  /** Case-sensitive exact-match filter on `Page.tags`. */
  readonly tag?: string
  /** Maximum number of results. No upper bound; passing `0` returns []. */
  readonly limit?: number
  /** Sort direction. Defaults to `'newest'`. */
  readonly sort?: ListPagesSort
}

/**
 * Read metadata-only summaries of every PUBLISHED page, optionally
 * filtered by tag and capped by limit.
 *
 * V1 limitation: returns published pages only regardless of preview /
 * published context. Drafts are not surfaced in lists. To see a draft
 * in a `PostList`, the page must first be published. See file header
 * and ARCHITECTURE.md §12 for the rationale and roadmap.
 */
export type ListPages = (input?: ListPagesInput) => Promise<ReadonlyArray<PageSummary>>

/**
 * Strip `updatedAt` so we return pure `PageSummary` to callers — the
 * mtime is a sort-only concern that doesn't belong in the public shape.
 *
 * `seo` is required on every page (basic-SEO guarantee) so it always
 * rides through; the remaining metadata fields stay conditional under
 * `exactOptionalPropertyTypes`.
 */
const toPublicSummary = (entry: PageSummaryEntry): PageSummary => {
  // We intentionally enumerate fields rather than spread + delete because
  // delete on a readonly property is awkward under strict TS. This keeps
  // the public projection explicit and easy to audit.
  const result: Mutable<PageSummary> = { slug: entry.slug, seo: entry.seo }
  if (entry.tags !== undefined) result.tags = entry.tags
  if (entry.excerpt !== undefined) result.excerpt = entry.excerpt
  if (entry.coverImage !== undefined) result.coverImage = entry.coverImage
  if (entry.publishedAt !== undefined) result.publishedAt = entry.publishedAt
  return result
}

// `Mutable<T>` is a private helper — the storage adapter returns readonly
// shapes, but we need to build the result incrementally. Local-only.
type Mutable<T> = { -readonly [K in keyof T]: T[K] }

/**
 * Compare two entries for sorting. `direction` flips the sign on the
 * primary key. Tie-breaker is always slug ascending (stable order).
 */
const compareEntries = (
  a: PageSummaryEntry,
  b: PageSummaryEntry,
  direction: ListPagesSort,
): number => {
  // Prefer publishedAt when both have it. A missing publishedAt is treated
  // as "older than any explicit date" — falls back to mtime instead.
  const aHasPublished = a.publishedAt !== undefined
  const bHasPublished = b.publishedAt !== undefined

  let primary: number
  if (aHasPublished && bHasPublished) {
    // ISO 8601 strings sort lexicographically === chronologically.
    primary = a.publishedAt!.localeCompare(b.publishedAt!)
  } else if (aHasPublished && !bHasPublished) {
    // Page with explicit publishedAt is "newer" than one without (which
    // only has mtime). This rule is documented in ARCHITECTURE.md §4 as
    // the mtime fallback; we never compare publishedAt against mtime
    // directly because their domains and clocks differ.
    primary = 1
  } else if (!aHasPublished && bHasPublished) {
    primary = -1
  } else {
    // Both lack publishedAt — sort by mtime. Date.getTime() returns ms
    // since epoch; subtract for comparison.
    primary = a.updatedAt.getTime() - b.updatedAt.getTime()
  }

  if (primary !== 0) {
    return direction === 'newest' ? -primary : primary
  }

  // Stable tie-breaker: slug ascending in BOTH sort directions, so the
  // order of equal-timestamp pages is predictable and doesn't depend on
  // adapter iteration order.
  return a.slug.localeCompare(b.slug)
}

export interface CreateListPagesDeps {
  readonly contentAdapter: ContentStorageAdapter
}

/**
 * Build the `listPages` runtime function.
 *
 * V1 limitation: the returned function reads PUBLISHED pages only. A
 * draft-only page (never published) will not appear in the result, even
 * when the surrounding request is in preview mode. See file header and
 * ARCHITECTURE.md §12.
 */
export const createListPages = ({
  contentAdapter,
}: CreateListPagesDeps): ListPages => {
  return async (input?: ListPagesInput): Promise<ReadonlyArray<PageSummary>> => {
    const tag = input?.tag
    const limit = input?.limit
    const sort: ListPagesSort = input?.sort ?? 'newest'

    // limit === 0 explicitly means "no results" — short-circuit to avoid
    // the adapter call entirely. Negative limits are not validated here;
    // the handler boundary rejects them. Internally we treat any non-
    // positive limit as 0.
    if (limit !== undefined && limit <= 0) return []

    const all = await contentAdapter.listPageSummaries()

    // Storage→runtime validation: the summary entries are built by the
    // adapter from raw JSON on disk, which the agent's file tools may
    // have written. Validate every entry's basic-SEO contract before
    // it can flow into a `PostList`-style listing — a missing title
    // would render as `<a></a>` and silently break the index.
    //
    // Fail-fast policy (intentional): a single malformed page aborts
    // the whole listing with a 500 rather than being silently skipped.
    // Skip+warn was considered and rejected — silent skips hide
    // corruption (a vanished post looks identical to a deleted one)
    // and let bad data accumulate. Failing loud forces the operator to
    // fix the offending file before any listing renders. The thrown
    // error includes the offending slug (see `assertValidPageMeta`),
    // which is enough for the operator to find the file on disk.
    for (const entry of all) {
      assertValidPageSummary(entry)
    }

    const filtered = tag === undefined
      ? all
      : all.filter((entry) =>
          // Tag matching is case-sensitive exact (ARCHITECTURE.md §4).
          entry.tags !== undefined && entry.tags.includes(tag),
        )

    const sorted = [...filtered].sort((a, b) => compareEntries(a, b, sort))

    const capped = limit === undefined ? sorted : sorted.slice(0, limit)

    return capped.map(toPublicSummary)
  }
}

// Re-export Page type so adjacent runtime files can import without crossing
// a layer boundary. (Pure type re-export, no runtime cost.)
export type { Page }
