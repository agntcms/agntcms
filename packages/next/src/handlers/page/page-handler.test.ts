// Integration tests for the page handler: delete, unpublish, listHistory, rollback, rename.
//
// Uses the real FS adapter against a tmpdir for true integration coverage.

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPageHandler } from './page-handler'
import { createFsContentAdapter } from '../../storage/fs/content'
import { createRuntime } from '../../runtime/getContent'
import type { PageHandler } from './page-handler'
import type { Page } from '../../domain/index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string
let handler: PageHandler

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agntcms-page-handler-'))
  const contentAdapter = createFsContentAdapter({ contentRoot: tmpDir })
  const runtime = createRuntime({ contentAdapter })
  handler = createPageHandler({ contentAdapter, runtime })
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const postJson = (url: string, body: unknown): Request =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const getRequest = (url: string): Request =>
  new Request(url, { method: 'GET' })

const testPage: Page = {
  slug: 'hello',
  seo: { title: 'Hello World', description: 'Hello description' },
  sections: [
    { id: 's1', type: 'Hero', data: { title: 'Welcome' } },
  ],
}

/**
 * Helper: save and publish a page so it exists on disk with history.
 *
 * Tests in this file frequently construct the minimum-viable Page
 * (slug + sections only). Since SEO is now required at the domain layer,
 * accept the SEO-less projection here and inject a deterministic default
 * derived from the slug. Callers that care about specific SEO content
 * still pass a full `Page` and the spread preserves it.
 */
type TestPageInput = Omit<Page, 'seo'> & { seo?: Page['seo'] }
async function publishPage(page: TestPageInput): Promise<void> {
  const adapter = createFsContentAdapter({ contentRoot: tmpDir })
  const seo = page.seo ?? { title: page.slug, description: page.slug }
  const full: Page = { ...page, seo }
  await adapter.saveDraft(full)
  await adapter.publishDraft(page.slug)
}

// ---------------------------------------------------------------------------
// Tests: listHistory
// ---------------------------------------------------------------------------

describe('createPageHandler', () => {
  describe('listHistory', () => {
    it('returns history entries for a page with history', async () => {
      await publishPage(testPage)

      const res = await handler.listHistory(
        getRequest(`http://localhost/api/agntcms/page/history?slug=hello`),
      )
      expect(res.status).toBe(200)
      const body = await res.json() as { entries: Array<{ slug: string; timestamp: string; size: number }> }
      expect(body.entries).toHaveLength(1)
      expect(body.entries[0]!.slug).toBe('hello')
      expect(body.entries[0]!.size).toBeGreaterThan(0)
    })

    it('returns empty array for page without history', async () => {
      const res = await handler.listHistory(
        getRequest(`http://localhost/api/agntcms/page/history?slug=nonexistent`),
      )
      expect(res.status).toBe(200)
      const body = await res.json() as { entries: unknown[] }
      expect(body.entries).toEqual([])
    })

    it('returns 400 when slug is missing', async () => {
      const res = await handler.listHistory(
        getRequest(`http://localhost/api/agntcms/page/history`),
      )
      expect(res.status).toBe(400)
    })

    // `?ts=<timestamp>` variant — returns the full body of a single snapshot
    // instead of the entries list. Used by the history UI for diff + preview.
    describe('with ?ts=<timestamp>', () => {
      it('returns the snapshot body for a valid timestamp', async () => {
        await publishPage(testPage)
        // Grab the timestamp from the list.
        const listRes = await handler.listHistory(
          getRequest(`http://localhost/api/agntcms/page/history?slug=hello`),
        )
        const listBody = (await listRes.json()) as {
          entries: Array<{ timestamp: string }>
        }
        const ts = listBody.entries[0]!.timestamp

        const res = await handler.listHistory(
          getRequest(
            `http://localhost/api/agntcms/page/history?slug=hello&ts=${encodeURIComponent(ts)}`,
          ),
        )
        expect(res.status).toBe(200)
        const body = (await res.json()) as { page: Page }
        expect(body.page.slug).toBe('hello')
        expect(body.page.seo?.title).toBe('Hello World')
        expect(body.page.sections).toHaveLength(1)
        expect(body.page.sections[0]).toEqual({
          id: 's1',
          type: 'Hero',
          data: { title: 'Welcome' },
        })
      })

      it('returns 404 for a non-existent timestamp', async () => {
        await publishPage(testPage)
        const res = await handler.listHistory(
          getRequest(
            `http://localhost/api/agntcms/page/history?slug=hello&ts=2099-01-01T00-00-00.000Z`,
          ),
        )
        expect(res.status).toBe(404)
      })

      it('returns 400 when ts is present but empty', async () => {
        const res = await handler.listHistory(
          getRequest(
            `http://localhost/api/agntcms/page/history?slug=hello&ts=`,
          ),
        )
        expect(res.status).toBe(400)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Tests: read
  // ---------------------------------------------------------------------------

  describe('read', () => {
    it('returns the published page when no draft exists', async () => {
      await publishPage(testPage)

      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/page/read?slug=hello'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { page: Page }
      expect(body.page.slug).toBe('hello')
      expect(body.page.seo?.title).toBe('Hello World')
      expect(body.page.sections).toHaveLength(1)
    })

    it('returns the draft when both draft and published exist', async () => {
      await publishPage(testPage)
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      await adapter.saveDraft({
        slug: 'hello',
        seo: { title: 'Draft Title', description: 'draft' },
        sections: [{ id: 's1', type: 'Hero', data: { title: 'Draft' } }],
      })

      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/page/read?slug=hello'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { page: Page }
      expect(body.page.seo?.title).toBe('Draft Title')
    })

    it('returns the draft-only page', async () => {
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      await adapter.saveDraft({
        slug: 'draft-only',
        seo: { title: 'Only Draft', description: 'only draft' },
        sections: [],
      })

      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/page/read?slug=draft-only'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { page: Page }
      expect(body.page.slug).toBe('draft-only')
      expect(body.page.seo?.title).toBe('Only Draft')
    })

    it('returns 404 when page does not exist', async () => {
      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/page/read?slug=nonexistent'),
      )
      expect(res.status).toBe(404)
    })

    it('returns 400 when slug is missing', async () => {
      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/page/read'),
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when slug is empty', async () => {
      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/page/read?slug='),
      )
      expect(res.status).toBe(400)
    })

    it('returns full section data including the data field', async () => {
      await publishPage(testPage)

      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/page/read?slug=hello'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { page: Page }
      expect(body.page.sections[0]).toEqual({
        id: 's1',
        type: 'Hero',
        data: { title: 'Welcome' },
      })
    })

  })

  // ---------------------------------------------------------------------------
  // Tests: rollback
  // ---------------------------------------------------------------------------

  describe('rollback', () => {
    it('rolls back to a history snapshot', async () => {
      // Publish two versions.
      await publishPage(testPage)
      const v2Page: Page = {
        slug: 'hello',
        seo: { title: 'Version 2', description: 'v2' },
        sections: [{ id: 's1', type: 'Hero', data: { title: 'V2' } }],
      }
      await publishPage(v2Page)

      // Get history — should have 2 entries.
      const histRes = await handler.listHistory(
        getRequest('http://localhost/api/agntcms/page/history?slug=hello'),
      )
      const histBody = await histRes.json() as { entries: Array<{ timestamp: string }> }
      expect(histBody.entries).toHaveLength(2)

      // Rollback to the oldest (last in the list since newest-first).
      const oldestTimestamp = histBody.entries[histBody.entries.length - 1]!.timestamp

      const rollbackRes = await handler.rollback(
        postJson('http://localhost/api/agntcms/page/rollback', {
          slug: 'hello',
          timestamp: oldestTimestamp,
        }),
      )
      expect(rollbackRes.status).toBe(200)
      const rollbackBody = await rollbackRes.json() as Record<string, unknown>
      expect(rollbackBody['ok']).toBe(true)

      // The published page should now match the original.
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const published = await adapter.readPage('hello', 'published')
      expect(published?.seo?.title).toBe('Hello World')

      // Rollback itself should have created a new history entry (3 total).
      const postRollbackHist = await handler.listHistory(
        getRequest('http://localhost/api/agntcms/page/history?slug=hello'),
      )
      const postBody = await postRollbackHist.json() as { entries: unknown[] }
      expect(postBody.entries).toHaveLength(3)
    })

    it('returns 404 for non-existent snapshot', async () => {
      const res = await handler.rollback(
        postJson('http://localhost/api/agntcms/page/rollback', {
          slug: 'hello',
          timestamp: '2099-01-01T00-00-00.000Z',
        }),
      )
      expect(res.status).toBe(404)
    })

    it('returns 400 when slug is missing', async () => {
      const res = await handler.rollback(
        postJson('http://localhost/api/agntcms/page/rollback', {
          timestamp: 'some-ts',
        }),
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when timestamp is missing', async () => {
      const res = await handler.rollback(
        postJson('http://localhost/api/agntcms/page/rollback', {
          slug: 'hello',
        }),
      )
      expect(res.status).toBe(400)
    })

    // Snapshot-read errors must surface as a structured 500, not as an
    // unhandled rejection. We swap `readHistorySnapshot` with a function
    // that throws, then verify the response is shaped consistently with
    // the rest of the handlers in this file.
    it('returns a structured 500 when readHistorySnapshot throws', async () => {
      // The test uses the FS-backed handler created in beforeEach but
      // monkey-patches the adapter on the shared instance to avoid the
      // ceremony of constructing a parallel handler. The replaced method
      // is restored at the end so subsequent tests in the same describe
      // are unaffected.
      const fsAdapter = createFsContentAdapter({ contentRoot: tmpDir })
      const original = fsAdapter.readHistorySnapshot
      // Build a fresh handler that wraps the patched adapter so this
      // test does not race with the shared `handler` instance.
      const patched = {
        ...fsAdapter,
        readHistorySnapshot: async (): Promise<Page | null> => {
          throw new Error('disk on fire')
        },
      }
      const runtime = createRuntime({ contentAdapter: patched })
      const localHandler = createPageHandler({
        contentAdapter: patched,
        runtime,
      })

      const res = await localHandler.rollback(
        postJson('http://localhost/api/agntcms/page/rollback', {
          slug: 'hello',
          timestamp: '2026-01-01T00-00-00.000Z',
        }),
      )
      expect(res.status).toBe(500)
      const body = (await res.json()) as { error: string; message: string }
      expect(body.error).toBe('read_history_snapshot_failed')
      expect(body.message).toContain('disk on fire')

      // Type-checker pacification — `original` is captured but not used
      // at runtime; restoration is unnecessary because `patched` is a
      // local copy.
      void original
    })
  })

  // ---------------------------------------------------------------------------
  // Tests: rename
  // ---------------------------------------------------------------------------

  describe('rename', () => {
    it('renames a page', async () => {
      await publishPage(testPage)

      const res = await handler.rename(
        postJson('http://localhost/api/agntcms/page/rename', {
          fromSlug: 'hello',
          toSlug: 'goodbye',
        }),
      )
      expect(res.status).toBe(200)
      const body = await res.json() as Record<string, unknown>
      expect(body['ok']).toBe(true)

      // Old slug should be gone, new slug should exist.
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      expect(await adapter.readPage('hello', 'published')).toBeNull()
      expect(await adapter.readPage('goodbye', 'published')).not.toBeNull()
    })

    it('returns 404 when source does not exist', async () => {
      const res = await handler.rename(
        postJson('http://localhost/api/agntcms/page/rename', {
          fromSlug: 'ghost',
          toSlug: 'new-name',
        }),
      )
      expect(res.status).toBe(404)
    })

    it('returns 409 when target already exists', async () => {
      await publishPage(testPage)
      await publishPage({ slug: 'other', sections: [] })

      const res = await handler.rename(
        postJson('http://localhost/api/agntcms/page/rename', {
          fromSlug: 'hello',
          toSlug: 'other',
        }),
      )
      expect(res.status).toBe(409)
    })

    it('returns 400 when fromSlug is missing', async () => {
      const res = await handler.rename(
        postJson('http://localhost/api/agntcms/page/rename', {
          toSlug: 'new-name',
        }),
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when toSlug is missing', async () => {
      const res = await handler.rename(
        postJson('http://localhost/api/agntcms/page/rename', {
          fromSlug: 'hello',
        }),
      )
      expect(res.status).toBe(400)
    })
  })

  // ---------------------------------------------------------------------------
  // Tests: list
  // ---------------------------------------------------------------------------

  describe('list', () => {
    it('returns empty pages array when nothing exists', async () => {
      const res = await handler.list(
        getRequest('http://localhost/api/agntcms/page/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { pages: unknown[] }
      expect(body.pages).toEqual([])
    })

    it('returns published-only pages', async () => {
      await publishPage(testPage)

      const res = await handler.list(
        getRequest('http://localhost/api/agntcms/page/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        pages: Array<{
          slug: string
          hasPublished: boolean
          hasDraft: boolean
          updatedAt: string
        }>
      }
      expect(body.pages).toHaveLength(1)
      expect(body.pages[0]!.slug).toBe('hello')
      expect(body.pages[0]!.hasPublished).toBe(true)
      expect(body.pages[0]!.hasDraft).toBe(false)
    })

    it('returns draft-only pages', async () => {
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      await adapter.saveDraft({
        slug: 'draft-only',
        seo: { title: 'd', description: 'd' },
        sections: [],
      })

      const res = await handler.list(
        getRequest('http://localhost/api/agntcms/page/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        pages: Array<{
          slug: string
          hasPublished: boolean
          hasDraft: boolean
        }>
      }
      expect(body.pages).toHaveLength(1)
      expect(body.pages[0]!.slug).toBe('draft-only')
      expect(body.pages[0]!.hasPublished).toBe(false)
      expect(body.pages[0]!.hasDraft).toBe(true)
    })

    it('merges published and draft for the same slug', async () => {
      await publishPage(testPage)
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      await adapter.saveDraft({
        slug: 'hello',
        seo: { title: 'Hello Draft', description: 'hello draft' },
        sections: [],
      })

      const res = await handler.list(
        getRequest('http://localhost/api/agntcms/page/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        pages: Array<{
          slug: string
          hasPublished: boolean
          hasDraft: boolean
        }>
      }
      expect(body.pages).toHaveLength(1)
      expect(body.pages[0]!.slug).toBe('hello')
      expect(body.pages[0]!.hasPublished).toBe(true)
      expect(body.pages[0]!.hasDraft).toBe(true)
    })

    it('picks the more recent updatedAt when both published and draft exist', async () => {
      await publishPage(testPage)

      // Wait briefly so the draft gets a strictly later mtime.
      await new Promise((resolve) => setTimeout(resolve, 50))

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      await adapter.saveDraft({
        slug: 'hello',
        seo: { title: 'Hello Draft', description: 'hello draft' },
        sections: [],
      })

      const res = await handler.list(
        getRequest('http://localhost/api/agntcms/page/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        pages: Array<{ slug: string; updatedAt: string }>
      }
      expect(body.pages).toHaveLength(1)

      // The draft was saved after the publish, so its date should win.
      const drafts = await adapter.listDrafts()
      const draftDate = drafts.find((d) => d.slug === 'hello')!.updatedAt
      expect(body.pages[0]!.updatedAt).toBe(draftDate.toISOString())
    })

    it('sorts results alphabetically by slug', async () => {
      await publishPage({ slug: 'zebra', sections: [] })
      await publishPage({ slug: 'alpha', sections: [] })
      await publishPage({ slug: 'middle', sections: [] })

      const res = await handler.list(
        getRequest('http://localhost/api/agntcms/page/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        pages: Array<{ slug: string }>
      }
      expect(body.pages.map((p) => p.slug)).toEqual([
        'alpha',
        'middle',
        'zebra',
      ])
    })

    // ARCHITECTURE.md §4 (Selections): the same `page/list` route serves
    // a second mode keyed on `tag` / `limit` / `sort` query params. This
    // mode returns PageSummary[] (metadata-only) routed through
    // runtime.listPages — not the admin-list shape above.
    describe('with tag/limit/sort params (listPages mode)', () => {
      it('filters by tag (case-sensitive exact match)', async () => {
        await publishPage({
          slug: 'p1',
          tags: ['post'],
          publishedAt: '2026-04-01T00:00:00.000Z',
          sections: [],
        })
        await publishPage({
          slug: 'p2',
          tags: ['post', 'feature'],
          publishedAt: '2026-03-01T00:00:00.000Z',
          sections: [],
        })
        // Capitalised — must NOT match `tag=post`.
        await publishPage({
          slug: 'p3',
          tags: ['Post'],
          publishedAt: '2026-02-01T00:00:00.000Z',
          sections: [],
        })
        await publishPage({ slug: 'home', sections: [] })

        const res = await handler.list(
          getRequest('http://localhost/api/agntcms/page/list?tag=post'),
        )
        expect(res.status).toBe(200)
        const body = (await res.json()) as {
          pages: Array<{ slug: string; tags: string[]; sections?: unknown }>
        }
        expect(body.pages.map((p) => p.slug)).toEqual(['p1', 'p2'])
        // No sections should leak through.
        expect(body.pages[0]).not.toHaveProperty('sections')
      })

      it('sorts newest-first by default', async () => {
        await publishPage({
          slug: 'p1',
          publishedAt: '2026-01-01T00:00:00.000Z',
          sections: [],
        })
        await publishPage({
          slug: 'p2',
          publishedAt: '2026-04-01T00:00:00.000Z',
          sections: [],
        })

        const res = await handler.list(
          getRequest('http://localhost/api/agntcms/page/list?sort=newest'),
        )
        expect(res.status).toBe(200)
        const body = (await res.json()) as { pages: Array<{ slug: string }> }
        expect(body.pages.map((p) => p.slug)).toEqual(['p2', 'p1'])
      })

      it('respects limit', async () => {
        await publishPage({
          slug: 'p1',
          publishedAt: '2026-04-01T00:00:00.000Z',
          sections: [],
        })
        await publishPage({
          slug: 'p2',
          publishedAt: '2026-03-01T00:00:00.000Z',
          sections: [],
        })
        await publishPage({
          slug: 'p3',
          publishedAt: '2026-02-01T00:00:00.000Z',
          sections: [],
        })

        const res = await handler.list(
          getRequest('http://localhost/api/agntcms/page/list?limit=2&sort=newest'),
        )
        expect(res.status).toBe(200)
        const body = (await res.json()) as { pages: Array<{ slug: string }> }
        expect(body.pages.map((p) => p.slug)).toEqual(['p1', 'p2'])
      })

      it('rejects negative limit', async () => {
        const res = await handler.list(
          getRequest('http://localhost/api/agntcms/page/list?limit=-1'),
        )
        expect(res.status).toBe(400)
        const body = (await res.json()) as { error: string }
        expect(body.error).toBe('invalid_limit')
      })

      it('rejects non-integer limit', async () => {
        const res = await handler.list(
          getRequest('http://localhost/api/agntcms/page/list?limit=abc'),
        )
        expect(res.status).toBe(400)
        const body = (await res.json()) as { error: string }
        expect(body.error).toBe('invalid_limit')
      })

      it('rejects fractional limit', async () => {
        const res = await handler.list(
          getRequest('http://localhost/api/agntcms/page/list?limit=2.5'),
        )
        expect(res.status).toBe(400)
        const body = (await res.json()) as { error: string }
        expect(body.error).toBe('invalid_limit')
      })

      it('accepts integer-coerced string limit', async () => {
        await publishPage({ slug: 'p1', sections: [] })
        await publishPage({ slug: 'p2', sections: [] })

        const res = await handler.list(
          getRequest('http://localhost/api/agntcms/page/list?limit=1'),
        )
        expect(res.status).toBe(200)
        const body = (await res.json()) as { pages: unknown[] }
        expect(body.pages).toHaveLength(1)
      })

      it("rejects sort other than 'newest'/'oldest'", async () => {
        const res = await handler.list(
          getRequest('http://localhost/api/agntcms/page/list?sort=banana'),
        )
        expect(res.status).toBe(400)
        const body = (await res.json()) as { error: string }
        expect(body.error).toBe('invalid_sort')
      })

      it('falls back to mtime when publishedAt is missing', async () => {
        await publishPage({ slug: 'older', sections: [] })
        await new Promise((resolve) => setTimeout(resolve, 20))
        await publishPage({ slug: 'newer', sections: [] })

        const res = await handler.list(
          getRequest('http://localhost/api/agntcms/page/list?sort=newest'),
        )
        expect(res.status).toBe(200)
        const body = (await res.json()) as { pages: Array<{ slug: string }> }
        expect(body.pages.map((p) => p.slug)).toEqual(['newer', 'older'])
      })

      it('returns admin-list shape when no params are present (backward compat)', async () => {
        await publishPage({ slug: 'p1', sections: [] })

        const res = await handler.list(
          getRequest('http://localhost/api/agntcms/page/list'),
        )
        expect(res.status).toBe(200)
        const body = (await res.json()) as {
          pages: Array<Record<string, unknown>>
        }
        // Admin-list shape carries hasPublished/hasDraft.
        expect(body.pages[0]).toHaveProperty('hasPublished')
        expect(body.pages[0]).toHaveProperty('hasDraft')
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Tests: deletePage (preserved from original)
  // ---------------------------------------------------------------------------

  describe('deletePage', () => {
    it('deletes a published page', async () => {
      await publishPage(testPage)

      const res = await handler.deletePage(
        postJson('http://localhost/api/agntcms/page/delete', { slug: 'hello' }),
      )
      expect(res.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      expect(await adapter.readPage('hello', 'published')).toBeNull()
    })

    it('returns 404 when page does not exist', async () => {
      const res = await handler.deletePage(
        postJson('http://localhost/api/agntcms/page/delete', { slug: 'ghost' }),
      )
      expect(res.status).toBe(404)
    })

    it('returns 400 when slug is missing', async () => {
      const res = await handler.deletePage(
        postJson('http://localhost/api/agntcms/page/delete', {}),
      )
      expect(res.status).toBe(400)
    })
  })

  // ---------------------------------------------------------------------------
  // Tests: unpublish
  // ---------------------------------------------------------------------------

  describe('unpublish', () => {
    it('converts published → draft when no draft exists, returns 200', async () => {
      await publishPage(testPage)

      const res = await handler.unpublish(
        postJson('http://localhost/api/agntcms/page/unpublish', { slug: 'hello' }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body['ok']).toBe(true)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      expect(await adapter.readPage('hello', 'published')).toBeNull()
      // The prior published content is now the draft.
      const draft = await adapter.readPage('hello', 'draft')
      expect(draft?.slug).toBe('hello')
      expect(draft?.seo?.title).toBe('Hello World')
    })

    it('leaves the draft untouched when both published and draft exist', async () => {
      await publishPage(testPage)
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const newerDraft: Page = {
        slug: 'hello',
        seo: { title: 'Draft on top', description: 'draft' },
        sections: [{ id: 's1', type: 'Hero', data: { title: 'Draft v' } }],
      }
      await adapter.saveDraft(newerDraft)

      const res = await handler.unpublish(
        postJson('http://localhost/api/agntcms/page/unpublish', { slug: 'hello' }),
      )
      expect(res.status).toBe(200)

      expect(await adapter.readPage('hello', 'published')).toBeNull()
      expect(await adapter.readPage('hello', 'draft')).toEqual(newerDraft)
    })

    it('returns 404 when the page is not published', async () => {
      const res = await handler.unpublish(
        postJson('http://localhost/api/agntcms/page/unpublish', { slug: 'ghost' }),
      )
      expect(res.status).toBe(404)
    })

    it('returns 404 when only a draft exists (no published)', async () => {
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      await adapter.saveDraft({
        slug: 'draft-only',
        seo: { title: 'd', description: 'd' },
        sections: [],
      })

      const res = await handler.unpublish(
        postJson('http://localhost/api/agntcms/page/unpublish', { slug: 'draft-only' }),
      )
      expect(res.status).toBe(404)
      // Draft survives the failed unpublish.
      expect(await adapter.readPage('draft-only', 'draft')).not.toBeNull()
    })

    it('returns 400 when slug is missing', async () => {
      const res = await handler.unpublish(
        postJson('http://localhost/api/agntcms/page/unpublish', {}),
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when body is invalid JSON', async () => {
      const res = await handler.unpublish(
        new Request('http://localhost/api/agntcms/page/unpublish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'not-json',
        }),
      )
      expect(res.status).toBe(400)
    })
  })

  describe('duplicate', () => {
    it('clones a published page as a draft under the new slug', async () => {
      await publishPage(testPage)

      const res = await handler.duplicate(
        postJson('http://localhost/api/agntcms/page/duplicate', {
          slug: 'hello',
          newSlug: 'hello-copy',
        }),
      )
      expect(res.status).toBe(200)
      const body = await res.json() as { ok: boolean; slug: string }
      expect(body).toEqual({ ok: true, slug: 'hello-copy' })

      // The clone exists as a DRAFT only — duplication must not auto-publish.
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const cloneDraft = await adapter.readPage('hello-copy', 'draft')
      expect(cloneDraft).not.toBeNull()
      expect(await adapter.readPage('hello-copy', 'published')).toBeNull()

      // Source untouched.
      const source = await adapter.readPage('hello', 'published')
      expect(source).not.toBeNull()
      // Clone carries the same field data.
      expect(cloneDraft!.sections[0]!.data).toEqual({ title: 'Welcome' })
      expect(cloneDraft!.seo).toEqual({ title: 'Hello World', description: 'Hello description' })
      // Fresh section id (must NOT equal the source's id).
      expect(cloneDraft!.sections[0]!.id).not.toBe(source!.sections[0]!.id)
    })

    it('falls back to the draft when no published version exists', async () => {
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      await adapter.saveDraft({
        slug: 'draft-only',
        seo: { title: 'd', description: 'd' },
        sections: [{ id: 's1', type: 'Hero', data: { title: 'From draft' } }],
      })

      const res = await handler.duplicate(
        postJson('http://localhost/api/agntcms/page/duplicate', {
          slug: 'draft-only',
          newSlug: 'draft-only-copy',
        }),
      )
      expect(res.status).toBe(200)

      const clone = await adapter.readPage('draft-only-copy', 'draft')
      expect(clone).not.toBeNull()
      expect(clone!.sections[0]!.data).toEqual({ title: 'From draft' })
    })

    it('returns 409 when newSlug already exists as a published page', async () => {
      await publishPage(testPage)
      await publishPage({ ...testPage, slug: 'other' })

      const res = await handler.duplicate(
        postJson('http://localhost/api/agntcms/page/duplicate', {
          slug: 'hello',
          newSlug: 'other',
        }),
      )
      expect(res.status).toBe(409)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('slug_exists')
    })

    it('returns 409 when newSlug already exists as a draft', async () => {
      await publishPage(testPage)
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      await adapter.saveDraft({
        slug: 'taken',
        seo: { title: 'taken', description: 'taken' },
        sections: [],
      })

      const res = await handler.duplicate(
        postJson('http://localhost/api/agntcms/page/duplicate', {
          slug: 'hello',
          newSlug: 'taken',
        }),
      )
      expect(res.status).toBe(409)
    })

    it('returns 404 when source does not exist', async () => {
      const res = await handler.duplicate(
        postJson('http://localhost/api/agntcms/page/duplicate', {
          slug: 'ghost',
          newSlug: 'ghost-copy',
        }),
      )
      expect(res.status).toBe(404)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('source_not_found')
    })

    it('rejects when slug equals newSlug', async () => {
      await publishPage(testPage)
      const res = await handler.duplicate(
        postJson('http://localhost/api/agntcms/page/duplicate', {
          slug: 'hello',
          newSlug: 'hello',
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('same_slug')
    })

    it('rejects an invalid newSlug shape', async () => {
      await publishPage(testPage)
      const res = await handler.duplicate(
        postJson('http://localhost/api/agntcms/page/duplicate', {
          slug: 'hello',
          newSlug: '../evil',
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('invalid_new_slug')
    })

    it('rejects a reserved system-page alias as newSlug', async () => {
      await publishPage(testPage)
      const res = await handler.duplicate(
        postJson('http://localhost/api/agntcms/page/duplicate', {
          slug: 'hello',
          newSlug: 'error-404',
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('reserved_new_slug')
      expect(body['message']).toContain('"404"')
    })

    it('returns 400 when slug or newSlug is missing', async () => {
      const r1 = await handler.duplicate(
        postJson('http://localhost/api/agntcms/page/duplicate', {
          newSlug: 'x',
        }),
      )
      expect(r1.status).toBe(400)
      const r2 = await handler.duplicate(
        postJson('http://localhost/api/agntcms/page/duplicate', {
          slug: 'x',
        }),
      )
      expect(r2.status).toBe(400)
    })

    it('gives each cloned section a unique id and preserves globalRef', async () => {
      const pageWithRef: Page = {
        slug: 'mixed',
        seo: { title: 'Mixed', description: 'mixed sections' },
        sections: [
          { id: 's1', type: 'Hero', data: { title: 'a' } },
          { id: 's2', type: 'Text', data: { body: 'b' } },
          { id: 'g1', type: '', data: {}, globalRef: 'header' },
        ],
      }
      await publishPage(pageWithRef)

      const res = await handler.duplicate(
        postJson('http://localhost/api/agntcms/page/duplicate', {
          slug: 'mixed',
          newSlug: 'mixed-copy',
        }),
      )
      expect(res.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const clone = await adapter.readPage('mixed-copy', 'draft')
      expect(clone).not.toBeNull()
      const ids = clone!.sections.map((s) => s.id)
      expect(new Set(ids).size).toBe(3) // all unique
      for (const s of clone!.sections) {
        expect(s.id).not.toBe('s1')
        expect(s.id).not.toBe('s2')
        expect(s.id).not.toBe('g1')
      }
      // globalRef preserved verbatim.
      expect(clone!.sections[2]!.globalRef).toBe('header')
    })

    // Regression: every Page-level metadata field must ride through to the
    // clone. A previous shape rebuilt the Page object explicitly and silently
    // dropped any field not in its allow-list (tags / excerpt / publishedAt /
    // coverImage were all lost on duplicate). This test pins the spread-and-
    // override shape that catches future field additions.
    it('preserves all page metadata fields on the clone', async () => {
      const richPage: Page = {
        slug: 'post-1',
        seo: { title: 'Post 1', description: 'desc' },
        tags: ['post', 'news'],
        excerpt: 'a short excerpt',
        publishedAt: '2026-01-01T00:00:00.000Z',
        coverImage: { filename: 'cover.jpg', alt: 'cover image' },
        sections: [
          { id: 's1', type: 'Hero', data: { title: 'a' } },
          { id: 's2', type: 'Text', data: { body: 'b' } },
        ],
      }
      await publishPage(richPage)

      const res = await handler.duplicate(
        postJson('http://localhost/api/agntcms/page/duplicate', {
          slug: 'post-1',
          newSlug: 'post-1-copy',
        }),
      )
      expect(res.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const clone = await adapter.readPage('post-1-copy', 'draft')
      expect(clone).not.toBeNull()

      // New slug, fresh section ids.
      expect(clone!.slug).toBe('post-1-copy')
      const ids = clone!.sections.map((s) => s.id)
      expect(ids).not.toContain('s1')
      expect(ids).not.toContain('s2')
      expect(new Set(ids).size).toBe(2)

      // Every metadata field preserved verbatim.
      expect(clone!.seo).toEqual({ title: 'Post 1', description: 'desc' })
      expect(clone!.tags).toEqual(['post', 'news'])
      expect(clone!.excerpt).toBe('a short excerpt')
      expect(clone!.publishedAt).toBe('2026-01-01T00:00:00.000Z')
      expect(clone!.coverImage).toEqual({ filename: 'cover.jpg', alt: 'cover image' })
    })
  })

  describe('rename', () => {
    it('rejects a reserved system-page alias as toSlug', async () => {
      await publishPage(testPage)

      const res = await handler.rename(
        postJson('http://localhost/api/agntcms/page/rename', {
          fromSlug: 'hello',
          toSlug: 'error-404',
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('reserved_to_slug')
      expect(body['message']).toContain('"404"')
    })
  })
})
