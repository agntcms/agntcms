// Integration tests for the FS `ContentStorageAdapter`.
//
// Each test creates a fresh tmpdir via `fs.mkdtemp` (so runs are isolated
// and parallel-safe) and removes it in `afterEach`. We never touch the real
// project content directory.
//
// A couple of the assertions reach past the adapter interface and read
// files directly — specifically to verify that history snapshots exist on
// disk. This is intentional: `ContentStorageAdapter` has no `readHistory`
// method (see `../content.ts` header), so the ONLY way to test the §4
// "full snapshot on every publish" guarantee is to inspect the filesystem.
// Do NOT re-add `readHistory` just to make testing easier.

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Page } from '../../domain/index'
import { createFsContentAdapter } from './content'

let contentRoot: string

beforeEach(async () => {
  contentRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agntcms-content-'))
})

afterEach(async () => {
  await fs.rm(contentRoot, { recursive: true, force: true })
})

const samplePage = (slug: string, title = 'Hello'): Page => ({
  slug,
  seo: { title, description: 'a description' },
  sections: [
    { id: 's1', type: 'Hero', data: { title } },
    { id: 's2', type: 'Text', data: { body: 'Lorem ipsum' } },
  ],
})

describe('createFsContentAdapter', () => {
  it('readPage returns null when no file exists', async () => {
    const adapter = createFsContentAdapter({ contentRoot })
    expect(await adapter.readPage('nonexistent', 'published')).toBeNull()
    expect(await adapter.readPage('nonexistent', 'draft')).toBeNull()
  })

  it('saveDraft → readPage("draft") round-trips', async () => {
    const adapter = createFsContentAdapter({ contentRoot })
    const page = samplePage('home')

    await adapter.saveDraft(page)

    const draft = await adapter.readPage('home', 'draft')
    expect(draft).toEqual(page)
    // saveDraft must NOT touch the published bucket.
    expect(await adapter.readPage('home', 'published')).toBeNull()
  })

  it('saveDraft creates the drafts/ directory on first call', async () => {
    const adapter = createFsContentAdapter({ contentRoot })
    // Sanity: the directory does not exist yet.
    await expect(fs.access(path.join(contentRoot, 'drafts'))).rejects.toThrow()
    await adapter.saveDraft(samplePage('home'))
    await expect(fs.access(path.join(contentRoot, 'drafts'))).resolves.toBeUndefined()
  })

  it('saveDraft overwrites an existing draft for the same slug', async () => {
    const adapter = createFsContentAdapter({ contentRoot })
    await adapter.saveDraft(samplePage('home', 'First'))
    await adapter.saveDraft(samplePage('home', 'Second'))

    const draft = await adapter.readPage('home', 'draft')
    expect(draft?.seo?.title).toBe('Second')
  })

  it('listDrafts returns one summary per draft on disk', async () => {
    const adapter = createFsContentAdapter({ contentRoot })
    await adapter.saveDraft(samplePage('home'))
    await adapter.saveDraft(samplePage('about'))

    const drafts = await adapter.listDrafts()
    const slugs = drafts.map((d) => d.slug).sort()
    expect(slugs).toEqual(['about', 'home'])
    for (const d of drafts) {
      expect(d.updatedAt).toBeInstanceOf(Date)
    }
  })

  it('listDrafts returns [] when drafts/ does not exist', async () => {
    const adapter = createFsContentAdapter({ contentRoot })
    expect(await adapter.listDrafts()).toEqual([])
  })

  it('publishDraft moves draft → published, writes history, returns Page', async () => {
    const adapter = createFsContentAdapter({ contentRoot })
    const page = samplePage('home')
    await adapter.saveDraft(page)

    const published = await adapter.publishDraft('home')
    expect(published).toEqual(page)

    // After publish: draft file is gone.
    expect(await adapter.readPage('home', 'draft')).toBeNull()
    // Published copy exists and matches.
    expect(await adapter.readPage('home', 'published')).toEqual(page)
  })

  it('publishDraft writes exactly one history snapshot per call', async () => {
    const adapter = createFsContentAdapter({ contentRoot })
    await adapter.saveDraft(samplePage('home', 'v1'))
    await adapter.publishDraft('home')

    const historyDir = path.join(contentRoot, 'history', 'home')
    const entriesAfterFirst = await fs.readdir(historyDir)
    expect(entriesAfterFirst).toHaveLength(1)

    // Second publish: new history snapshot, not an overwrite.
    await adapter.saveDraft(samplePage('home', 'v2'))
    await adapter.publishDraft('home')
    const entriesAfterSecond = await fs.readdir(historyDir)
    expect(entriesAfterSecond).toHaveLength(2)

    // History filenames are filesystem-safe: no `:` characters.
    for (const name of entriesAfterSecond) {
      expect(name).not.toContain(':')
      expect(name.endsWith('.json')).toBe(true)
    }
  })

  describe('publishDraft history de-duplication (ARCHITECTURE.md §4)', () => {
    // Semantic de-dup: a publish that produces the exact same Page as the
    // most recent history snapshot must NOT create a new history entry.
    // Rollback goes through publishDraft, so these cases also exercise the
    // "rollback to latest is a no-op" scenario.

    it('publishing identical content twice produces exactly one history entry', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('home', 'same'))
      await adapter.publishDraft('home')
      await adapter.saveDraft(samplePage('home', 'same'))
      await adapter.publishDraft('home')

      const historyDir = path.join(contentRoot, 'history', 'home')
      const entries = await fs.readdir(historyDir)
      expect(entries).toHaveLength(1)

      // Published file still matches.
      expect(await adapter.readPage('home', 'published')).toEqual(
        samplePage('home', 'same'),
      )
    })

    it('publishing different content produces two history entries', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('home', 'A'))
      await adapter.publishDraft('home')
      await adapter.saveDraft(samplePage('home', 'B'))
      await adapter.publishDraft('home')

      const entries = await fs.readdir(path.join(contentRoot, 'history', 'home'))
      expect(entries).toHaveLength(2)
    })

    it('rolling back to an older snapshot (relative to current) creates a new entry', async () => {
      // A, B published — history has A and B, published = B.
      // Then rollback to A: current B ≠ A, so a 3rd history entry is written.
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('home', 'A'))
      await adapter.publishDraft('home')
      await adapter.saveDraft(samplePage('home', 'B'))
      await adapter.publishDraft('home')

      // Simulate the rollback path: save the old snapshot as a draft and
      // publish it. This is exactly what the rollback handler does.
      await adapter.saveDraft(samplePage('home', 'A'))
      await adapter.publishDraft('home')

      const entries = await fs.readdir(path.join(contentRoot, 'history', 'home'))
      expect(entries).toHaveLength(3)
    })

    it('rolling back to the latest snapshot (no-op rollback) does not create a new entry', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('home', 'A'))
      await adapter.publishDraft('home')

      // Rollback to A while A is already the current published content.
      await adapter.saveDraft(samplePage('home', 'A'))
      await adapter.publishDraft('home')

      const entries = await fs.readdir(path.join(contentRoot, 'history', 'home'))
      expect(entries).toHaveLength(1)
    })

    it('treats whitespace / key-ordering differences as equal (JSON-structural compare)', async () => {
      // Publish once via the adapter so history has a canonical snapshot.
      const adapter = createFsContentAdapter({ contentRoot })
      const page: Page = {
        slug: 'home',
        seo: { title: 'Hi', description: 'd' },
        sections: [{ id: 's1', type: 'Hero', data: { title: 'Hi' } }],
      }
      await adapter.saveDraft(page)
      await adapter.publishDraft('home')

      // Re-publish an object with reordered keys and an object reference
      // that differs from the first page (still deep-equal JSON).
      const reordered: Page = {
        sections: [{ data: { title: 'Hi' }, type: 'Hero', id: 's1' }],
        seo: { description: 'd', title: 'Hi' },
        slug: 'home',
      }
      await adapter.saveDraft(reordered)
      await adapter.publishDraft('home')

      const entries = await fs.readdir(path.join(contentRoot, 'history', 'home'))
      expect(entries).toHaveLength(1)
    })

    // Seed preservation (the entry-point fix). A page committed
    // straight to `pages/<slug>.json` (e.g. by a template) has no
    // history yet. The first publish that follows must NOT lose that
    // initial state — it should be captured in history first, then the
    // edit snapshot written on top with a strictly later timestamp.
    describe('seed preservation (pages/<slug>.json exists with no prior history)', () => {
      it('first publish on a seeded page captures the seed before the edit', async () => {
        const adapter = createFsContentAdapter({ contentRoot })
        // Simulate a template seed: write `pages/about.json` directly
        // and ensure no `history/about/` exists yet.
        const pagesDir = path.join(contentRoot, 'pages')
        await fs.mkdir(pagesDir, { recursive: true })
        const seed = samplePage('about', 'Seed title')
        await fs.writeFile(
          path.join(pagesDir, 'about.json'),
          JSON.stringify(seed, null, 2),
        )

        // Now: edit and publish.
        const edited = samplePage('about', 'Edited title')
        await adapter.saveDraft(edited)
        await adapter.publishDraft('about')

        // listHistory must return 2 entries: oldest = seed, newest = edit.
        const entries = await adapter.listHistory('about')
        expect(entries).toHaveLength(2)
        const newestSnap = await adapter.readHistorySnapshot(
          'about',
          entries[0]!.timestamp,
        )
        const oldestSnap = await adapter.readHistorySnapshot(
          'about',
          entries[1]!.timestamp,
        )
        expect(oldestSnap).toEqual(seed)
        expect(newestSnap).toEqual(edited)

        // Published page is the edit.
        expect(await adapter.readPage('about', 'published')).toEqual(edited)
      })

      it('seeded page → publish with identical content → exactly 1 history entry', async () => {
        // When the incoming draft matches the seed, the pre-snapshot is
        // skipped (no need to preserve a copy of content we're about to
        // re-publish verbatim). The regular history write still fires
        // and produces exactly one entry whose content equals the
        // seed/draft (they're identical here).
        const adapter = createFsContentAdapter({ contentRoot })
        const pagesDir = path.join(contentRoot, 'pages')
        await fs.mkdir(pagesDir, { recursive: true })
        const seed = samplePage('about', 'Same')
        await fs.writeFile(
          path.join(pagesDir, 'about.json'),
          JSON.stringify(seed, null, 2),
        )

        await adapter.saveDraft(samplePage('about', 'Same'))
        await adapter.publishDraft('about')

        const entries = await adapter.listHistory('about')
        expect(entries).toHaveLength(1)
        // The single entry holds the (unchanged) content.
        const snap = await adapter.readHistorySnapshot('about', entries[0]!.timestamp)
        expect(snap).toEqual(seed)
      })

      it('fresh page (no pre-existing pages/<slug>.json) → first publish writes exactly 1 history entry', async () => {
        // Regression: the seed-preservation branch must not fire when
        // there is no existing published file. Otherwise we would
        // either crash on reading a non-existent seed or write a
        // spurious extra entry.
        const adapter = createFsContentAdapter({ contentRoot })
        await adapter.saveDraft(samplePage('fresh', 'first publish'))
        await adapter.publishDraft('fresh')

        const entries = await adapter.listHistory('fresh')
        expect(entries).toHaveLength(1)
      })

      it('seeded page → publish edit → publish identical content again → exactly 2 entries (no growth)', async () => {
        // Confirms the standard dedup invariant still applies after
        // the seed-preservation branch has run. Two consecutive
        // publishes of the same content on a seeded page produce
        // exactly 2 entries total (seed + first publish), then
        // dedupe forever.
        const adapter = createFsContentAdapter({ contentRoot })
        const pagesDir = path.join(contentRoot, 'pages')
        await fs.mkdir(pagesDir, { recursive: true })
        await fs.writeFile(
          path.join(pagesDir, 'about.json'),
          JSON.stringify(samplePage('about', 'Seed'), null, 2),
        )

        await adapter.saveDraft(samplePage('about', 'Edit'))
        await adapter.publishDraft('about')
        await adapter.saveDraft(samplePage('about', 'Edit'))
        await adapter.publishDraft('about')

        const entries = await adapter.listHistory('about')
        expect(entries).toHaveLength(2)
      })
    })

    it('still writes the published page file on a de-duped publish', async () => {
      // The page file write is cheap and we do it unconditionally — this
      // keeps the draft-removal behavior identical to a regular publish.
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('home', 'same'))
      await adapter.publishDraft('home')

      // Manually clobber the published file to prove publishDraft rewrites
      // it even when the history write is skipped.
      await fs.rm(path.join(contentRoot, 'pages', 'home.json'))

      await adapter.saveDraft(samplePage('home', 'same'))
      await adapter.publishDraft('home')

      expect(await adapter.readPage('home', 'published')).toEqual(
        samplePage('home', 'same'),
      )
      // History still only one entry.
      const entries = await fs.readdir(path.join(contentRoot, 'history', 'home'))
      expect(entries).toHaveLength(1)
      // Draft was cleaned up.
      expect(await adapter.readPage('home', 'draft')).toBeNull()
    })
  })

  it('publishDraft history snapshot contains the exact published Page', async () => {
    const adapter = createFsContentAdapter({ contentRoot })
    const page = samplePage('home', 'Snapshot me')
    await adapter.saveDraft(page)
    await adapter.publishDraft('home')

    // Reach past the interface on purpose: history is only observable
    // through the filesystem.
    const historyDir = path.join(contentRoot, 'history', 'home')
    const [filename] = await fs.readdir(historyDir)
    if (filename === undefined) throw new Error('expected a history file')
    const raw = await fs.readFile(path.join(historyDir, filename), 'utf8')
    expect(JSON.parse(raw)).toEqual(page)
  })

  it('publishDraft throws when no draft exists', async () => {
    const adapter = createFsContentAdapter({ contentRoot })
    await expect(adapter.publishDraft('ghost')).rejects.toThrow(/no draft/)
  })

  // Validation defense at the publish boundary. The agent's native
  // file-edit path can write JSON straight to `drafts/`, bypassing the
  // HTTP `parseSaveBody` gate — so a draft missing `seo.title` could
  // otherwise be promoted to `pages/`. The next `getContent` read would
  // then throw on the malformed published page, far from the cause.
  // Failing fast here turns "publish a broken draft" into a clean adapter
  // error and leaves `pages/` untouched.
  it('publishDraft rejects a malformed draft and leaves pages/ untouched', async () => {
    const adapter = createFsContentAdapter({ contentRoot })

    // Write a malformed draft directly to disk: structurally a Page
    // (slug + sections + seo object) but with an empty `seo.title`,
    // which `assertValidPage` rejects. Writing through `saveDraft`
    // would short-circuit on the FS adapter's `assertValidSlug` check
    // before exercising the validator — we want to test the publish
    // side specifically, so we drop the file in via `node:fs`.
    const draftsDir = path.join(contentRoot, 'drafts')
    await fs.mkdir(draftsDir, { recursive: true })
    const malformed = {
      slug: 'broken',
      seo: { title: '', description: 'has a description' },
      sections: [{ id: 's1', type: 'Hero', data: { title: 'X' } }],
    }
    await fs.writeFile(
      path.join(draftsDir, 'broken.json'),
      JSON.stringify(malformed, null, 2),
    )

    await expect(adapter.publishDraft('broken')).rejects.toThrow(/seo\.title/)

    // Critical guarantee: `pages/` was never written. If the validator
    // runs AFTER the published-write, this would be a green test that
    // still corrupts disk. Read the directory directly to be sure.
    const pagesDir = path.join(contentRoot, 'pages')
    let pagesContents: string[] = []
    try {
      pagesContents = await fs.readdir(pagesDir)
    } catch (err) {
      // pages/ may not exist at all — that is the strongest possible
      // proof that no published file was created. Treat ENOENT as an
      // empty directory; rethrow anything else.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    expect(pagesContents).not.toContain('broken.json')
  })

  it('supports nested slugs (e.g. "blog/post-1")', async () => {
    const adapter = createFsContentAdapter({ contentRoot })
    const page = samplePage('blog/post-1')
    await adapter.saveDraft(page)
    expect(await adapter.readPage('blog/post-1', 'draft')).toEqual(page)

    await adapter.publishDraft('blog/post-1')
    expect(await adapter.readPage('blog/post-1', 'published')).toEqual(page)

    const historyEntries = await fs.readdir(
      path.join(contentRoot, 'history', 'blog', 'post-1'),
    )
    expect(historyEntries).toHaveLength(1)
  })

  it.each([
    '../escape',
    '..',
    '/absolute',
    'with spaces',
    'with.dot',
    'trailing/',
    'double//slash',
    '',
  ])('rejects unsafe slug: %s', async (slug) => {
    const adapter = createFsContentAdapter({ contentRoot })
    await expect(
      adapter.readPage(slug, 'published'),
    ).rejects.toThrow(/invalid slug/)
  })

  it('saveDraft rejects a Page with an unsafe slug', async () => {
    const adapter = createFsContentAdapter({ contentRoot })
    const page: Page = {
      slug: '../escape',
      seo: { title: 'escape', description: 'escape' },
      sections: [],
    }
    await expect(adapter.saveDraft(page)).rejects.toThrow(/invalid slug/)
    // Nothing leaked to the filesystem outside contentRoot.
    const parent = path.dirname(contentRoot)
    const leak = path.join(parent, 'escape.json')
    await expect(fs.access(leak)).rejects.toThrow()
  })

  it('rejects a non-absolute contentRoot', () => {
    expect(() =>
      createFsContentAdapter({ contentRoot: 'relative/path' }),
    ).toThrow(/absolute/)
  })

  describe('listHistory', () => {
    it('returns entries for a page with history, newest first', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('home', 'v1'))
      await adapter.publishDraft('home')
      // Small delay to ensure distinct timestamps.
      await adapter.saveDraft(samplePage('home', 'v2'))
      await adapter.publishDraft('home')

      const entries = await adapter.listHistory('home')
      expect(entries).toHaveLength(2)
      // Newest first.
      expect(entries[0]!.timestamp >= entries[1]!.timestamp).toBe(true)
      for (const entry of entries) {
        expect(entry.slug).toBe('home')
        expect(entry.size).toBeGreaterThan(0)
        expect(entry.timestamp).not.toContain(':')
      }
    })

    it('returns empty array for page without history', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      const entries = await adapter.listHistory('nonexistent')
      expect(entries).toEqual([])
    })
  })

  describe('readHistorySnapshot', () => {
    it('returns page for valid timestamp', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      const page = samplePage('home', 'Snapshot')
      await adapter.saveDraft(page)
      await adapter.publishDraft('home')

      const entries = await adapter.listHistory('home')
      expect(entries).toHaveLength(1)
      const snapshot = await adapter.readHistorySnapshot('home', entries[0]!.timestamp)
      expect(snapshot).toEqual(page)
    })

    it('returns null for non-existent timestamp', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      const snapshot = await adapter.readHistorySnapshot('home', '2099-01-01T00-00-00.000Z')
      expect(snapshot).toBeNull()
    })

    it('rejects traversal in timestamp parameter', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await expect(
        adapter.readHistorySnapshot('home', '../../etc/passwd'),
      ).rejects.toThrow(/escapes/)
    })
  })

  describe('renamePage', () => {
    it('renames a published page', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('old-slug'))
      await adapter.publishDraft('old-slug')

      await adapter.renamePage('old-slug', 'new-slug')

      expect(await adapter.readPage('old-slug', 'published')).toBeNull()
      expect(await adapter.readPage('new-slug', 'published')).not.toBeNull()
    })

    it('also renames draft if one exists', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('old-slug', 'v1'))
      await adapter.publishDraft('old-slug')
      await adapter.saveDraft(samplePage('old-slug', 'v2'))

      await adapter.renamePage('old-slug', 'new-slug')

      expect(await adapter.readPage('old-slug', 'draft')).toBeNull()
      const draft = await adapter.readPage('new-slug', 'draft')
      expect(draft).not.toBeNull()
      expect(draft!.seo?.title).toBe('v2')
    })

    it('also renames history directory if one exists', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('old-slug'))
      await adapter.publishDraft('old-slug')

      await adapter.renamePage('old-slug', 'new-slug')

      const oldHistory = await adapter.listHistory('old-slug')
      expect(oldHistory).toEqual([])
      const newHistory = await adapter.listHistory('new-slug')
      expect(newHistory).toHaveLength(1)
    })

    it('throws if source does not exist', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await expect(
        adapter.renamePage('ghost', 'new-slug'),
      ).rejects.toThrow(/page not found/)
    })

    it('throws if target already exists', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('slug-a'))
      await adapter.publishDraft('slug-a')
      await adapter.saveDraft(samplePage('slug-b'))
      await adapter.publishDraft('slug-b')

      await expect(
        adapter.renamePage('slug-a', 'slug-b'),
      ).rejects.toThrow(/target slug already exists/)
    })
  })

  describe('listPages recursive', () => {
    it('returns nested slug pages', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('blog/post-1'))
      await adapter.publishDraft('blog/post-1')
      await adapter.saveDraft(samplePage('home'))
      await adapter.publishDraft('home')

      const pages = await adapter.listPages()
      const slugs = pages.map((p) => p.slug).sort()
      expect(slugs).toEqual(['blog/post-1', 'home'])
    })

    it('returns deeply nested slug pages', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('a/b/c'))
      await adapter.publishDraft('a/b/c')

      const pages = await adapter.listPages()
      expect(pages).toHaveLength(1)
      expect(pages[0]!.slug).toBe('a/b/c')
    })

    it('returns [] when pages/ does not exist', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      expect(await adapter.listPages()).toEqual([])
    })
  })

  describe('listPageSummaries', () => {
    it('returns metadata projections without sections', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      const richPage: Page = {
        slug: 'post-1',
        seo: { title: 'Post 1', description: 'first post' },
        tags: ['post'],
        excerpt: 'short',
        coverImage: { filename: 'c.jpg', alt: 'cover' },
        publishedAt: '2026-04-27T10:00:00.000Z',
        sections: [
          { id: 's1', type: 'Hero', data: { title: 'h' } },
          { id: 's2', type: 'Text', data: { body: 'b' } },
        ],
      }
      await adapter.saveDraft(richPage)
      await adapter.publishDraft('post-1')

      const summaries = await adapter.listPageSummaries()
      expect(summaries).toHaveLength(1)
      const [summary] = summaries
      expect(summary).toBeDefined()
      // sections must NOT leak through.
      expect(summary as unknown as Record<string, unknown>).not.toHaveProperty('sections')
      expect(summary!.slug).toBe('post-1')
      expect(summary!.tags).toEqual(['post'])
      expect(summary!.excerpt).toBe('short')
      expect(summary!.coverImage).toEqual({ filename: 'c.jpg', alt: 'cover' })
      expect(summary!.publishedAt).toBe('2026-04-27T10:00:00.000Z')
      expect(summary!.seo).toEqual({ title: 'Post 1', description: 'first post' })
      // updatedAt is the file mtime — present so the runtime can fall
      // back to it when publishedAt is absent.
      expect(summary!.updatedAt).toBeInstanceOf(Date)
    })

    it('omits optional metadata fields when not present on the page', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      // A page with only the required fields — seo is mandatory at the
      // domain layer (basic-SEO guarantee), but tags/excerpt/coverImage/
      // publishedAt remain optional and must NOT leak through as `undefined`.
      await adapter.saveDraft({
        slug: 'bare',
        seo: { title: 'Bare', description: 'bare page' },
        sections: [],
      })
      await adapter.publishDraft('bare')

      const [summary] = await adapter.listPageSummaries()
      expect(summary).toBeDefined()
      expect(summary!.slug).toBe('bare')
      expect(summary!.seo).toEqual({ title: 'Bare', description: 'bare page' })
      expect(summary!.tags).toBeUndefined()
      expect(summary!.excerpt).toBeUndefined()
      expect(summary!.coverImage).toBeUndefined()
      expect(summary!.publishedAt).toBeUndefined()
      expect(summary!.updatedAt).toBeInstanceOf(Date)
    })

    it('returns [] when pages/ does not exist', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      expect(await adapter.listPageSummaries()).toEqual([])
    })

    it('handles nested slugs', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      const minSeo = { title: 'x', description: 'x' }
      await adapter.saveDraft({ slug: 'blog/post-1', seo: minSeo, sections: [] })
      await adapter.publishDraft('blog/post-1')
      await adapter.saveDraft({ slug: 'home', seo: minSeo, sections: [] })
      await adapter.publishDraft('home')

      const summaries = await adapter.listPageSummaries()
      const slugs = summaries.map((s) => s.slug).sort()
      expect(slugs).toEqual(['blog/post-1', 'home'])
    })
  })

  describe('listDrafts recursive', () => {
    it('returns nested slug drafts', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('blog/post-1'))
      await adapter.saveDraft(samplePage('about'))

      const drafts = await adapter.listDrafts()
      const slugs = drafts.map((d) => d.slug).sort()
      expect(slugs).toEqual(['about', 'blog/post-1'])
    })
  })

  describe('globals', () => {
    it('readGlobal returns null when no global exists', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      expect(await adapter.readGlobal('nonexistent', 'published')).toBeNull()
    })

    it('saveGlobal → readGlobal round-trips', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      const global = { name: 'header', type: 'Hero', data: { title: 'Hello' } }
      await adapter.saveGlobal(global)

      const result = await adapter.readGlobal('header', 'published')
      expect(result).toEqual(global)
    })

    it('saveGlobal overwrites existing global', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { title: 'V1' } })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { title: 'V2' } })

      const result = await adapter.readGlobal('header', 'published')
      expect(result!.data).toEqual({ title: 'V2' })
    })

    it('listGlobals returns all globals', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: {} })
      await adapter.saveGlobal({ name: 'footer', type: 'Footer', data: {} })

      const globals = await adapter.listGlobals()
      expect(globals).toHaveLength(2)
      const names = globals.map((g) => g.name).sort()
      expect(names).toEqual(['footer', 'header'])
      for (const g of globals) {
        expect(g.updatedAt).toBeInstanceOf(Date)
        expect(typeof g.type).toBe('string')
      }
    })

    it('listGlobals returns [] when globals/ does not exist', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      expect(await adapter.listGlobals()).toEqual([])
    })

    it('deleteGlobal removes the global', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: {} })
      await adapter.deleteGlobal('header')
      expect(await adapter.readGlobal('header', 'published')).toBeNull()
    })

    it('deleteGlobal throws when global does not exist', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await expect(adapter.deleteGlobal('ghost')).rejects.toThrow(/global not found/)
    })
  })

  describe('global history', () => {
    // Mirrors the page history de-dup suite above (ARCHITECTURE.md §4):
    // saveGlobal must write a snapshot on every save EXCEPT when the
    // incoming content deep-equals the most recent snapshot.

    it('saveGlobal writes a history snapshot on first save', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'v1' } })

      // Reach past the interface on purpose — same discipline as the page
      // history test above: history is only observable via the filesystem.
      const entries = await fs.readdir(path.join(contentRoot, 'history-globals', 'header'))
      expect(entries).toHaveLength(1)
    })

    it('saving identical content twice produces exactly one history entry', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      const g = { name: 'header', type: 'Hero', data: { t: 'same' } }
      await adapter.saveGlobal(g)
      await adapter.saveGlobal(g)

      const entries = await fs.readdir(path.join(contentRoot, 'history-globals', 'header'))
      expect(entries).toHaveLength(1)
    })

    it('saving distinct content produces two history entries', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'A' } })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'B' } })

      const entries = await fs.readdir(path.join(contentRoot, 'history-globals', 'header'))
      expect(entries).toHaveLength(2)
    })

    it('rolling back to an older snapshot creates a new history entry', async () => {
      // A, B saved — history has A and B, live = B.
      // Rollback to A: live becomes A, dedupe compares A vs latest (B) ≠ → new entry.
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'A' } })
      // Small delay to force distinct millisecond timestamps. Without this,
      // two same-ms writes go through the `-N` suffix path, and because
      // `-` sorts before `.` in ASCII, the filename order inverts relative
      // to chronological order — not wrong per se, just surprising for a
      // test that picks "oldest by list order" as "the A snapshot".
      await new Promise((resolve) => setTimeout(resolve, 5))
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'B' } })

      // Find the snapshot whose content is A rather than trusting order.
      const history = await adapter.listGlobalHistory('header')
      let tsForA: string | null = null
      for (const entry of history) {
        const snap = await adapter.readGlobalHistorySnapshot('header', entry.timestamp)
        if (snap && (snap.data as { t: string }).t === 'A') {
          tsForA = entry.timestamp
          break
        }
      }
      if (tsForA === null) throw new Error('expected a snapshot for A')

      await adapter.rollbackGlobal('header', tsForA)

      const entries = await fs.readdir(path.join(contentRoot, 'history-globals', 'header'))
      expect(entries).toHaveLength(3)
      expect((await adapter.readGlobal('header', 'published'))!.data).toEqual({ t: 'A' })
    })

    it('rolling back to the latest snapshot is a no-op through dedupe', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'A' } })

      const history = await adapter.listGlobalHistory('header')
      await adapter.rollbackGlobal('header', history[0]!.timestamp)

      const entries = await fs.readdir(path.join(contentRoot, 'history-globals', 'header'))
      expect(entries).toHaveLength(1)
    })

    it('listGlobalHistory orders newest-first', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'A' } })
      await new Promise((resolve) => setTimeout(resolve, 5))
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'B' } })
      await new Promise((resolve) => setTimeout(resolve, 5))
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'C' } })

      const entries = await adapter.listGlobalHistory('header')
      expect(entries).toHaveLength(3)
      // Lexicographic descending on ISO-timestamp strings = chronological
      // descending — the same contract as pages.
      for (let i = 0; i < entries.length - 1; i += 1) {
        expect(entries[i]!.timestamp >= entries[i + 1]!.timestamp).toBe(true)
      }
      for (const entry of entries) {
        expect(entry.name).toBe('header')
        expect(entry.size).toBeGreaterThan(0)
        expect(entry.timestamp).not.toContain(':')
      }
    })

    it('listGlobalHistory returns [] for unknown name', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      expect(await adapter.listGlobalHistory('nonexistent')).toEqual([])
    })

    it('readGlobalHistorySnapshot returns the exact saved content', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      const g = { name: 'header', type: 'Hero', data: { t: 'snap' } }
      await adapter.saveGlobal(g)

      const entries = await adapter.listGlobalHistory('header')
      const snapshot = await adapter.readGlobalHistorySnapshot('header', entries[0]!.timestamp)
      expect(snapshot).toEqual(g)
    })

    it('readGlobalHistorySnapshot returns null for unknown timestamp', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      const snapshot = await adapter.readGlobalHistorySnapshot(
        'header',
        '2099-01-01T00-00-00.000Z',
      )
      expect(snapshot).toBeNull()
    })

    it('rollbackGlobal throws when snapshot does not exist', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await expect(
        adapter.rollbackGlobal('header', '2099-01-01T00-00-00.000Z'),
      ).rejects.toThrow(/global history snapshot not found/)
    })

    it('page history and global history with colliding names stay isolated', async () => {
      // A page slug "home" and a global name "home" must not write into
      // the same history directory. The distinct directory roots guard
      // against this: history/home/... vs history-globals/home/....
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('home'))
      await adapter.publishDraft('home')
      await adapter.saveGlobal({ name: 'home', type: 'Hero', data: { t: 'x' } })

      const pageHistory = await fs.readdir(path.join(contentRoot, 'history', 'home'))
      const globalHistory = await fs.readdir(
        path.join(contentRoot, 'history-globals', 'home'),
      )
      expect(pageHistory).toHaveLength(1)
      expect(globalHistory).toHaveLength(1)

      // The two snapshot payloads are completely unrelated.
      const pageSnap = JSON.parse(
        await fs.readFile(path.join(contentRoot, 'history', 'home', pageHistory[0]!), 'utf8'),
      )
      const globalSnap = JSON.parse(
        await fs.readFile(
          path.join(contentRoot, 'history-globals', 'home', globalHistory[0]!),
          'utf8',
        ),
      )
      expect(pageSnap).toHaveProperty('sections')
      expect(globalSnap).toEqual({ name: 'home', type: 'Hero', data: { t: 'x' } })
    })
  })

  describe('deleteDraft', () => {
    it('removes only the draft file, leaving the published page intact', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('home', 'v1'))
      await adapter.publishDraft('home')
      await adapter.saveDraft(samplePage('home', 'v2'))

      expect(await adapter.readPage('home', 'draft')).not.toBeNull()
      expect(await adapter.readPage('home', 'published')).not.toBeNull()

      await adapter.deleteDraft('home')

      expect(await adapter.readPage('home', 'draft')).toBeNull()
      const published = await adapter.readPage('home', 'published')
      expect(published).not.toBeNull()
      // Discarding the draft must not touch the published content.
      expect(published?.seo?.title).toBe('v1')
    })

    it('throws when no draft exists for the slug', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      // No draft, no published — throw is expected either way.
      await expect(adapter.deleteDraft('ghost')).rejects.toThrow(
        /no draft to discard/,
      )
    })

    it('preserves history directory', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('home'))
      await adapter.publishDraft('home')
      await adapter.saveDraft(samplePage('home', 'v2'))

      const histDir = path.join(contentRoot, 'history', 'home')
      const before = await fs.readdir(histDir)
      await adapter.deleteDraft('home')
      const after = await fs.readdir(histDir)
      expect(after).toEqual(before)
    })

    it('rejects unsafe slugs', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await expect(adapter.deleteDraft('../evil')).rejects.toThrow(/invalid slug/)
    })
  })

  describe('deletePage', () => {
    it('deletes the published page file', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('home'))
      await adapter.publishDraft('home')

      // Confirm published page exists before delete.
      expect(await adapter.readPage('home', 'published')).not.toBeNull()

      await adapter.deletePage('home')

      expect(await adapter.readPage('home', 'published')).toBeNull()
    })

    it('also deletes draft if one exists', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      // Publish first so the page exists.
      await adapter.saveDraft(samplePage('home', 'v1'))
      await adapter.publishDraft('home')
      // Create a new draft on top.
      await adapter.saveDraft(samplePage('home', 'v2'))
      expect(await adapter.readPage('home', 'draft')).not.toBeNull()

      await adapter.deletePage('home')

      expect(await adapter.readPage('home', 'published')).toBeNull()
      expect(await adapter.readPage('home', 'draft')).toBeNull()
    })

    it('throws when the published page does not exist', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await expect(adapter.deletePage('ghost')).rejects.toThrow(
        /page not found/,
      )
    })

    it('preserves the history directory', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('home'))
      await adapter.publishDraft('home')

      const histDir = path.join(contentRoot, 'history', 'home')
      const entriesBefore = await fs.readdir(histDir)
      expect(entriesBefore).toHaveLength(1)

      await adapter.deletePage('home')

      // History is still intact.
      const entriesAfter = await fs.readdir(histDir)
      expect(entriesAfter).toEqual(entriesBefore)
    })
  })

  describe('unpublishPage', () => {
    it('converts published → draft when no draft exists', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      const page = samplePage('home', 'Published content')
      await adapter.saveDraft(page)
      await adapter.publishDraft('home')

      // Precondition: published only, no draft.
      expect(await adapter.readPage('home', 'published')).not.toBeNull()
      expect(await adapter.readPage('home', 'draft')).toBeNull()

      await adapter.unpublishPage('home')

      // Published is gone, draft now holds the prior published content
      // byte-for-byte (equivalent JSON content).
      expect(await adapter.readPage('home', 'published')).toBeNull()
      const draft = await adapter.readPage('home', 'draft')
      expect(draft).toEqual(page)
    })

    it('leaves the draft untouched when both published and draft exist', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      // Publish v1.
      await adapter.saveDraft(samplePage('home', 'v1-published'))
      await adapter.publishDraft('home')
      // Save a newer draft on top.
      const draftPage = samplePage('home', 'v2-draft')
      await adapter.saveDraft(draftPage)

      // Precondition: both exist.
      expect(await adapter.readPage('home', 'published')).not.toBeNull()
      expect(await adapter.readPage('home', 'draft')).toEqual(draftPage)

      await adapter.unpublishPage('home')

      // Published removed, draft unchanged (still v2, not reverted to v1).
      expect(await adapter.readPage('home', 'published')).toBeNull()
      expect(await adapter.readPage('home', 'draft')).toEqual(draftPage)
    })

    it('throws when no published page exists (draft-only)', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('home'))

      await expect(adapter.unpublishPage('home')).rejects.toThrow(
        /page not found/,
      )
      // Draft was not disturbed by the failed unpublish.
      expect(await adapter.readPage('home', 'draft')).not.toBeNull()
    })

    it('throws when neither published nor draft exist', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await expect(adapter.unpublishPage('ghost')).rejects.toThrow(
        /page not found/,
      )
    })

    it('preserves the history directory across all scenarios', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveDraft(samplePage('home'))
      await adapter.publishDraft('home')

      const histDir = path.join(contentRoot, 'history', 'home')
      const entriesBefore = await fs.readdir(histDir)
      expect(entriesBefore).toHaveLength(1)

      // Scenario A: published-only → unpublish → history intact.
      await adapter.unpublishPage('home')
      expect(await fs.readdir(histDir)).toEqual(entriesBefore)

      // Set up scenario B: publish a CHANGED draft (so a new history
      // entry is actually written — identical content would be de-duped),
      // then add a newer draft on top.
      await adapter.saveDraft(samplePage('home', 'v2-published'))
      await adapter.publishDraft('home')
      await adapter.saveDraft(samplePage('home', 'newer-draft'))
      const entriesAfterSecondPublish = await fs.readdir(histDir)
      expect(entriesAfterSecondPublish.length).toBeGreaterThan(
        entriesBefore.length,
      )

      // Scenario B: published + draft → unpublish → history still intact.
      await adapter.unpublishPage('home')
      expect(await fs.readdir(histDir)).toEqual(entriesAfterSecondPublish)
    })
  })

  describe('global drafts', () => {
    // The full draft → publish → discard lifecycle for globals. Mirrors
    // the page-draft tests above one-to-one: same shape, same edge
    // cases, same crash-safety guarantees. If a future maintainer adds a
    // new property to the page-draft suite, they should add it here too.

    it('saveGlobalDraft writes only to the draft bucket', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobalDraft({ name: 'header', type: 'Hero', data: { t: 'd1' } })

      // Read confirms the draft is there.
      const draft = await adapter.readGlobal('header', 'draft')
      expect(draft).toEqual({ name: 'header', type: 'Hero', data: { t: 'd1' } })

      // The published bucket is untouched.
      expect(await adapter.readGlobal('header', 'published')).toBeNull()

      // History MUST NOT be written on a draft save (saves can be very
      // chatty; history is reserved for actual publishes).
      await expect(
        fs.readdir(path.join(contentRoot, 'history-globals', 'header')),
      ).rejects.toBeTruthy()
    })

    it('saveGlobalDraft overwrites an existing draft', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobalDraft({ name: 'header', type: 'Hero', data: { t: 'v1' } })
      await adapter.saveGlobalDraft({ name: 'header', type: 'Hero', data: { t: 'v2' } })

      const draft = await adapter.readGlobal('header', 'draft')
      expect((draft!.data as { t: string }).t).toBe('v2')
    })

    it('readGlobal returns null when the requested mode has no file', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'live' } })

      // Draft bucket is empty — must NOT fall back to published.
      expect(await adapter.readGlobal('header', 'draft')).toBeNull()
      // Published bucket has the value.
      expect(await adapter.readGlobal('header', 'published')).not.toBeNull()
    })

    it('listGlobalDrafts returns pending drafts only', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      // One global with a draft, one published-only.
      await adapter.saveGlobalDraft({ name: 'header', type: 'Hero', data: {} })
      await adapter.saveGlobal({ name: 'footer', type: 'Footer', data: {} })

      const drafts = await adapter.listGlobalDrafts()
      expect(drafts).toHaveLength(1)
      expect(drafts[0]!.name).toBe('header')
      expect(drafts[0]!.updatedAt).toBeInstanceOf(Date)
    })

    it('listGlobalDrafts returns [] when no draft directory exists', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      expect(await adapter.listGlobalDrafts()).toEqual([])
    })

    it('publishGlobalDraft promotes draft to live, writes history, deletes draft', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobalDraft({
        name: 'header',
        type: 'Hero',
        data: { t: 'about to publish' },
      })

      const published = await adapter.publishGlobalDraft('header')

      // Returned global matches what was published.
      expect(published).toEqual({
        name: 'header',
        type: 'Hero',
        data: { t: 'about to publish' },
      })

      // Live file now exists, draft file is gone.
      expect(await adapter.readGlobal('header', 'published')).toEqual(published)
      expect(await adapter.readGlobal('header', 'draft')).toBeNull()

      // History snapshot was written.
      const histEntries = await fs.readdir(
        path.join(contentRoot, 'history-globals', 'header'),
      )
      expect(histEntries).toHaveLength(1)
    })

    it('publishGlobalDraft throws when no draft exists', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await expect(adapter.publishGlobalDraft('ghost')).rejects.toThrow(
        /no global draft to publish/,
      )
    })

    it('publishGlobalDraft de-dups history when content is unchanged', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      // First publish via saveGlobal so a baseline snapshot exists.
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'same' } })
      // Then write a draft with identical content and publish it.
      await adapter.saveGlobalDraft({ name: 'header', type: 'Hero', data: { t: 'same' } })
      await adapter.publishGlobalDraft('header')

      const entries = await fs.readdir(
        path.join(contentRoot, 'history-globals', 'header'),
      )
      // Still only one history entry — the second publish was de-duped.
      expect(entries).toHaveLength(1)
    })

    it('deleteGlobalDraft removes the draft, leaving the live global intact', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      // Publish v1 directly so the live file exists.
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'live' } })
      // Add a draft on top.
      await adapter.saveGlobalDraft({ name: 'header', type: 'Hero', data: { t: 'draft' } })

      await adapter.deleteGlobalDraft('header')

      // Draft is gone, live untouched.
      expect(await adapter.readGlobal('header', 'draft')).toBeNull()
      const live = await adapter.readGlobal('header', 'published')
      expect((live!.data as { t: string }).t).toBe('live')
    })

    it('deleteGlobalDraft throws when no draft exists', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await expect(adapter.deleteGlobalDraft('ghost')).rejects.toThrow(
        /no global draft to discard/,
      )
    })

    it('deleteGlobal also removes the sibling draft if one exists', async () => {
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'live' } })
      await adapter.saveGlobalDraft({ name: 'header', type: 'Hero', data: { t: 'draft' } })

      await adapter.deleteGlobal('header')

      expect(await adapter.readGlobal('header', 'published')).toBeNull()
      expect(await adapter.readGlobal('header', 'draft')).toBeNull()
    })

    it('saveGlobal clears any sibling draft', async () => {
      // A direct save (MCP / programmatic caller) makes a pending draft
      // stale. The next preview load would otherwise see the obsolete
      // draft on top of the freshly published edit.
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobalDraft({
        name: 'header',
        type: 'Hero',
        data: { t: 'user-was-typing' },
      })
      await adapter.saveGlobal({
        name: 'header',
        type: 'Hero',
        data: { t: 'agent-overwrites' },
      })

      // Draft is gone; live carries the new content.
      expect(await adapter.readGlobal('header', 'draft')).toBeNull()
      const drafts = await adapter.listGlobalDrafts()
      expect(drafts.find((d) => d.name === 'header')).toBeUndefined()
      const live = await adapter.readGlobal('header', 'published')
      expect((live!.data as { t: string }).t).toBe('agent-overwrites')
    })

    it('saveGlobal is a no-op for sibling-draft cleanup when no draft exists', async () => {
      // ENOENT on the draft unlink must not bubble up.
      const adapter = createFsContentAdapter({ contentRoot })
      await expect(
        adapter.saveGlobal({ name: 'header', type: 'Hero', data: { t: 'v1' } }),
      ).resolves.not.toThrow()
    })

    // Seed preservation for globals — symmetric to the page-side
    // suite above. A global committed straight to
    // `globals/<name>.json` (template seed) has no history yet; the
    // first publish that follows must NOT lose that initial state.
    describe('seed preservation (globals/<name>.json exists with no prior history)', () => {
      it('first publish on a seeded global captures the seed before the edit', async () => {
        const adapter = createFsContentAdapter({ contentRoot })
        // Simulate a template seed: write the live file directly,
        // bypassing `saveGlobal` (which would write a history entry).
        const globalsDir = path.join(contentRoot, 'globals')
        await fs.mkdir(globalsDir, { recursive: true })
        const seed = { name: 'header', type: 'Hero', data: { t: 'Seed' } }
        await fs.writeFile(
          path.join(globalsDir, 'header.json'),
          JSON.stringify(seed, null, 2),
        )

        const edited = { name: 'header', type: 'Hero', data: { t: 'Edited' } }
        await adapter.saveGlobalDraft(edited)
        await adapter.publishGlobalDraft('header')

        const entries = await adapter.listGlobalHistory('header')
        expect(entries).toHaveLength(2)
        const newestSnap = await adapter.readGlobalHistorySnapshot(
          'header',
          entries[0]!.timestamp,
        )
        const oldestSnap = await adapter.readGlobalHistorySnapshot(
          'header',
          entries[1]!.timestamp,
        )
        expect(oldestSnap).toEqual(seed)
        expect(newestSnap).toEqual(edited)
        expect(await adapter.readGlobal('header', 'published')).toEqual(edited)
      })

      it('seeded global → publish with identical content → exactly 1 history entry', async () => {
        const adapter = createFsContentAdapter({ contentRoot })
        const globalsDir = path.join(contentRoot, 'globals')
        await fs.mkdir(globalsDir, { recursive: true })
        const seed = { name: 'header', type: 'Hero', data: { t: 'Same' } }
        await fs.writeFile(
          path.join(globalsDir, 'header.json'),
          JSON.stringify(seed, null, 2),
        )

        await adapter.saveGlobalDraft({ name: 'header', type: 'Hero', data: { t: 'Same' } })
        await adapter.publishGlobalDraft('header')

        const entries = await adapter.listGlobalHistory('header')
        expect(entries).toHaveLength(1)
        const snap = await adapter.readGlobalHistorySnapshot(
          'header',
          entries[0]!.timestamp,
        )
        expect(snap).toEqual(seed)
      })

      it('fresh global (no pre-existing globals/<name>.json) → first publish writes exactly 1 history entry', async () => {
        const adapter = createFsContentAdapter({ contentRoot })
        await adapter.saveGlobalDraft({ name: 'fresh', type: 'Hero', data: { t: 'v1' } })
        await adapter.publishGlobalDraft('fresh')

        const entries = await adapter.listGlobalHistory('fresh')
        expect(entries).toHaveLength(1)
      })
    })

    it('publish then a second draft cycle works end-to-end', async () => {
      // Round-trip: save → publish → save again → publish again. The
      // second publish must write a NEW history entry (content differs),
      // and the draft must be removed each time.
      const adapter = createFsContentAdapter({ contentRoot })
      await adapter.saveGlobalDraft({ name: 'header', type: 'Hero', data: { t: 'v1' } })
      await adapter.publishGlobalDraft('header')
      await new Promise((resolve) => setTimeout(resolve, 5))
      await adapter.saveGlobalDraft({ name: 'header', type: 'Hero', data: { t: 'v2' } })
      await adapter.publishGlobalDraft('header')

      // Live now has v2.
      const live = await adapter.readGlobal('header', 'published')
      expect((live!.data as { t: string }).t).toBe('v2')
      // Draft removed.
      expect(await adapter.readGlobal('header', 'draft')).toBeNull()
      // Two history entries — first publish (v1) and second publish (v2).
      const histEntries = await fs.readdir(
        path.join(contentRoot, 'history-globals', 'header'),
      )
      expect(histEntries).toHaveLength(2)
    })
  })
})
