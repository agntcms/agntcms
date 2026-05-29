// Unit tests for the `listPages` runtime helper.
//
// Exercises the four behaviours documented in `listPages.ts`:
//   1. Tag filtering (case-sensitive exact match).
//   2. Sorting by `publishedAt` (newest-first by default).
//   3. mtime fallback when `publishedAt` is missing.
//   4. `limit` truncation.
//
// We use a hand-rolled fake adapter rather than the FS adapter because
// these are unit tests for the runtime sort/filter logic — the FS layer
// has its own integration tests in `storage/fs/content.test.ts`.

import { describe, it, expect } from 'vitest'

import type { Global, Page } from '../domain/index'
import type {
  ContentStorageAdapter,
  PageSummaryEntry,
  PublishedPageEntry,
} from '../storage/content'
import { createListPages } from './listPages'

// ---------------------------------------------------------------------------
// Fake adapter
// ---------------------------------------------------------------------------

const makeAdapter = (entries: ReadonlyArray<PageSummaryEntry>): ContentStorageAdapter => ({
  // Only `listPageSummaries` is exercised; the rest throw to surface
  // any unexpected coupling.
  readPage: async () => null,
  saveDraft: async () => {},
  listDrafts: async () => [],
  listPages: async (): Promise<ReadonlyArray<PublishedPageEntry>> => [],
  listPageSummaries: async () => entries,
  publishDraft: async (slug): Promise<Page> => ({
    slug,
    seo: { title: slug, description: slug },
    sections: [],
  }),
  deleteDraft: async () => {},
  deletePage: async () => {},
  unpublishPage: async () => {},
  listHistory: async () => [],
  readHistorySnapshot: async () => null,
  renamePage: async () => {},
  readGlobal: async (): Promise<Global | null> => null,
  saveGlobalDraft: async () => {},
  listGlobalDrafts: async () => [],
  publishGlobalDraft: async () => ({ name: '', type: '', data: {} }),
  deleteGlobalDraft: async () => {},
  saveGlobal: async () => {},
  listGlobals: async () => [],
  deleteGlobal: async () => {},
  listGlobalHistory: async () => [],
  readGlobalHistorySnapshot: async () => null,
  rollbackGlobal: async () => {},
})

const entry = (
  slug: string,
  opts: Partial<Omit<PageSummaryEntry, 'slug' | 'updatedAt'>> & { updatedAt?: Date } = {},
): PageSummaryEntry => {
  // Default updatedAt: epoch, so tests that don't rely on mtime get a
  // stable baseline. Tests that DO rely on mtime supply explicit dates.
  // SEO is required at the domain layer; default to a deterministic shape
  // derived from the slug so tests that don't care about SEO stay terse.
  const { updatedAt, seo, ...rest } = opts
  return {
    slug,
    seo: seo ?? { title: slug, description: slug },
    updatedAt: updatedAt ?? new Date(0),
    ...rest,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createListPages', () => {
  it('returns [] when no pages exist', async () => {
    const listPages = createListPages({ contentAdapter: makeAdapter([]) })
    expect(await listPages()).toEqual([])
  })

  it('returns all pages when no filters are passed', async () => {
    const listPages = createListPages({
      contentAdapter: makeAdapter([
        entry('home'),
        entry('about'),
        entry('blog/1'),
      ]),
    })
    const out = await listPages()
    expect(out).toHaveLength(3)
    expect(out.map((p) => p.slug).sort()).toEqual(['about', 'blog/1', 'home'])
  })

  it('strips updatedAt from the public output', async () => {
    const listPages = createListPages({
      contentAdapter: makeAdapter([entry('home', { updatedAt: new Date('2026-04-01') })]),
    })
    const [page] = await listPages()
    // updatedAt is an internal sort key — it must NOT appear in the
    // public PageSummary projection.
    expect(page).toBeDefined()
    expect(Object.keys(page!)).not.toContain('updatedAt')
    expect(page!.slug).toBe('home')
  })

  it('preserves all metadata fields in the public output', async () => {
    const listPages = createListPages({
      contentAdapter: makeAdapter([
        entry('post/1', {
          seo: { title: 'Post 1', description: 'first post' },
          tags: ['post'],
          excerpt: 'short',
          coverImage: { filename: 'c.jpg', alt: 'cover' },
          publishedAt: '2026-04-27T10:00:00.000Z',
        }),
      ]),
    })
    const [page] = await listPages()
    expect(page).toEqual({
      slug: 'post/1',
      seo: { title: 'Post 1', description: 'first post' },
      tags: ['post'],
      excerpt: 'short',
      coverImage: { filename: 'c.jpg', alt: 'cover' },
      publishedAt: '2026-04-27T10:00:00.000Z',
    })
  })

  // Storage→runtime validation pin: `listPages` runs `assertValidPageSummary`
  // on every adapter entry inside its loop and aborts the whole listing on
  // the first malformed entry (fail-fast, see `listPages.ts` rationale).
  // Without these tests the loop could silently regress to skip-on-error
  // and a missing `<title>` would render in a `PostList` index unnoticed.
  // We bypass the `entry()` helper's seo default by constructing the
  // malformed entry inline and casting through `as` — the cast is the
  // explicit signal that we are intentionally building an invalid input
  // to exercise the boundary check.
  describe('basic-SEO assertion at the boundary', () => {
    it('throws when an entry is missing seo entirely', async () => {
      // No `seo` property at all — simulates a published-page JSON file
      // that the agent's file-edit tools wrote without the required
      // SEO block.
      const malformed = {
        slug: 'broken-no-seo',
        updatedAt: new Date(0),
      } as unknown as PageSummaryEntry
      const listPages = createListPages({
        contentAdapter: makeAdapter([malformed]),
      })
      // Error message must include the offending slug so the operator
      // can locate the file on disk (assertValidPageMeta contract).
      await expect(listPages()).rejects.toThrow(/broken-no-seo/)
      await expect(listPages()).rejects.toThrow(/seo must be an object/)
    })

    it('throws when an entry has empty seo.title', async () => {
      // `seo` is present but `title` is empty — the trimmed-empty case
      // that the domain validator rejects (whitespace-only title would
      // render as a visually-empty `<title>` tag).
      const malformed = {
        slug: 'broken-empty-title',
        seo: { title: '', description: 'ok' },
        updatedAt: new Date(0),
      } as unknown as PageSummaryEntry
      const listPages = createListPages({
        contentAdapter: makeAdapter([malformed]),
      })
      await expect(listPages()).rejects.toThrow(/broken-empty-title/)
      await expect(listPages()).rejects.toThrow(
        /seo\.title must be a non-empty string/,
      )
    })
  })

  describe('tag filtering', () => {
    it('filters by case-sensitive exact match', async () => {
      const listPages = createListPages({
        contentAdapter: makeAdapter([
          entry('home', { tags: ['static'] }),
          entry('a', { tags: ['post', 'feature'] }),
          entry('b', { tags: ['post'] }),
          // Capitalized 'Post' must NOT match query 'post'.
          entry('c', { tags: ['Post'] }),
          // No tags at all — never matches.
          entry('d'),
        ]),
      })
      const matches = await listPages({ tag: 'post' })
      expect(matches.map((p) => p.slug).sort()).toEqual(['a', 'b'])
    })

    it('returns [] when no page carries the tag', async () => {
      const listPages = createListPages({
        contentAdapter: makeAdapter([
          entry('home', { tags: ['static'] }),
          entry('a'),
        ]),
      })
      expect(await listPages({ tag: 'nope' })).toEqual([])
    })
  })

  describe('sort', () => {
    it('sorts by publishedAt newest-first by default', async () => {
      const listPages = createListPages({
        contentAdapter: makeAdapter([
          entry('a', { publishedAt: '2026-01-01T00:00:00.000Z' }),
          entry('b', { publishedAt: '2026-04-01T00:00:00.000Z' }),
          entry('c', { publishedAt: '2026-02-15T00:00:00.000Z' }),
        ]),
      })
      const out = await listPages()
      expect(out.map((p) => p.slug)).toEqual(['b', 'c', 'a'])
    })

    it('sorts by publishedAt oldest-first when sort=oldest', async () => {
      const listPages = createListPages({
        contentAdapter: makeAdapter([
          entry('a', { publishedAt: '2026-01-01T00:00:00.000Z' }),
          entry('b', { publishedAt: '2026-04-01T00:00:00.000Z' }),
          entry('c', { publishedAt: '2026-02-15T00:00:00.000Z' }),
        ]),
      })
      const out = await listPages({ sort: 'oldest' })
      expect(out.map((p) => p.slug)).toEqual(['a', 'c', 'b'])
    })

    it('falls back to mtime when publishedAt is missing on both sides', async () => {
      const listPages = createListPages({
        contentAdapter: makeAdapter([
          entry('a', { updatedAt: new Date('2026-01-01T00:00:00.000Z') }),
          entry('b', { updatedAt: new Date('2026-04-01T00:00:00.000Z') }),
          entry('c', { updatedAt: new Date('2026-02-15T00:00:00.000Z') }),
        ]),
      })
      const out = await listPages()
      // newest-first by mtime
      expect(out.map((p) => p.slug)).toEqual(['b', 'c', 'a'])
    })

    it('treats pages with publishedAt as newer than pages without', async () => {
      // Documented rule: an explicit publishedAt always outranks a bare
      // mtime — we never compare publishedAt vs mtime directly because
      // their domains differ.
      const listPages = createListPages({
        contentAdapter: makeAdapter([
          // 'b' has only mtime, very recent
          entry('b', { updatedAt: new Date('2099-12-31T00:00:00.000Z') }),
          // 'a' has explicit (older) publishedAt
          entry('a', { publishedAt: '2026-01-01T00:00:00.000Z' }),
        ]),
      })
      const out = await listPages()
      // 'a' (with publishedAt) ranks above 'b' (mtime-only) under 'newest'.
      expect(out.map((p) => p.slug)).toEqual(['a', 'b'])
    })

    it('breaks ties by slug ascending in both directions', async () => {
      const listPages = createListPages({
        contentAdapter: makeAdapter([
          entry('zeta', { publishedAt: '2026-04-01T00:00:00.000Z' }),
          entry('alpha', { publishedAt: '2026-04-01T00:00:00.000Z' }),
          entry('mu', { publishedAt: '2026-04-01T00:00:00.000Z' }),
        ]),
      })
      const newest = await listPages({ sort: 'newest' })
      const oldest = await listPages({ sort: 'oldest' })
      // Identical publishedAt → tie-breaker is slug ascending in BOTH
      // directions (stable, predictable order).
      expect(newest.map((p) => p.slug)).toEqual(['alpha', 'mu', 'zeta'])
      expect(oldest.map((p) => p.slug)).toEqual(['alpha', 'mu', 'zeta'])
    })
  })

  describe('limit', () => {
    it('caps results at limit', async () => {
      const listPages = createListPages({
        contentAdapter: makeAdapter([
          entry('a', { publishedAt: '2026-04-01T00:00:00.000Z' }),
          entry('b', { publishedAt: '2026-03-01T00:00:00.000Z' }),
          entry('c', { publishedAt: '2026-02-01T00:00:00.000Z' }),
        ]),
      })
      const out = await listPages({ limit: 2 })
      expect(out.map((p) => p.slug)).toEqual(['a', 'b'])
    })

    it('returns [] when limit is 0', async () => {
      const listPages = createListPages({
        contentAdapter: makeAdapter([entry('a'), entry('b')]),
      })
      expect(await listPages({ limit: 0 })).toEqual([])
    })

    it('does not error when limit exceeds the result count', async () => {
      const listPages = createListPages({
        contentAdapter: makeAdapter([entry('a'), entry('b')]),
      })
      const out = await listPages({ limit: 100 })
      expect(out).toHaveLength(2)
    })
  })

  it('combines tag + sort + limit', async () => {
    const listPages = createListPages({
      contentAdapter: makeAdapter([
        entry('p1', { tags: ['post'], publishedAt: '2026-04-01T00:00:00.000Z' }),
        entry('p2', { tags: ['post'], publishedAt: '2026-03-01T00:00:00.000Z' }),
        entry('p3', { tags: ['post'], publishedAt: '2026-02-01T00:00:00.000Z' }),
        entry('home', { tags: ['static'], publishedAt: '2026-04-15T00:00:00.000Z' }),
      ]),
    })
    const out = await listPages({ tag: 'post', sort: 'newest', limit: 2 })
    expect(out.map((p) => p.slug)).toEqual(['p1', 'p2'])
  })

  // V1 limitation pin (ARCHITECTURE.md §12 — listPages does not support
  // drafts). The adapter's `listPageSummaries` returns published pages
  // only; `listPages` reads exclusively from that path. This test pins
  // the documented behaviour: a draft-only page is NOT surfaced, and
  // `listPages` does not call any draft-aware adapter method.
  //
  // If a future change adds a `mode` parameter or routes through
  // `listDrafts`, this test will need to evolve in lockstep with
  // ARCHITECTURE.md §4 / §12.
  it('does not surface draft-only pages (v1: published-only, see ARCHITECTURE.md §12)', async () => {
    let listDraftsWasCalled = false
    // Adapter that flags any call to `listDrafts`. We deliberately
    // construct it inline (rather than via `makeAdapter`) so the
    // assertion is local to this test.
    const adapter: ContentStorageAdapter = {
      readPage: async () => null,
      saveDraft: async () => {},
      listDrafts: async () => {
        listDraftsWasCalled = true
        return []
      },
      listPages: async () => [],
      // Only the published projection is surfaced — `draft-only` is
      // present as a draft elsewhere in this scenario but the published
      // bucket has only `published-1`.
      listPageSummaries: async () => [
        entry('published-1', { publishedAt: '2026-04-01T00:00:00.000Z' }),
      ],
      publishDraft: async (slug): Promise<Page> => ({
        slug,
        seo: { title: slug, description: slug },
        sections: [],
      }),
      deleteDraft: async () => {},
      deletePage: async () => {},
      unpublishPage: async () => {},
      listHistory: async () => [],
      readHistorySnapshot: async () => null,
      renamePage: async () => {},
      readGlobal: async (): Promise<Global | null> => null,
      saveGlobalDraft: async () => {},
      listGlobalDrafts: async () => [],
      publishGlobalDraft: async () => ({ name: '', type: '', data: {} }),
      deleteGlobalDraft: async () => {},
      saveGlobal: async () => {},
      listGlobals: async () => [],
      deleteGlobal: async () => {},
      listGlobalHistory: async () => [],
      readGlobalHistorySnapshot: async () => null,
      rollbackGlobal: async () => {},
    }
    const listPages = createListPages({ contentAdapter: adapter })

    const out = await listPages()
    expect(out.map((p) => p.slug)).toEqual(['published-1'])
    expect(listDraftsWasCalled).toBe(false)
  })
})
