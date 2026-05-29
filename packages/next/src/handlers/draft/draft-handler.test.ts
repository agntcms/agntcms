import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDraftHandler } from './draft-handler'
import { createFsContentAdapter } from '../../storage/fs/content'
import { createRuntime } from '../../runtime/getContent'
import type { DraftHandler } from './draft-handler'
import type { Page } from '../../domain/index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string
let handler: DraftHandler

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agntcms-draft-handler-'))
  const contentAdapter = createFsContentAdapter({ contentRoot: tmpDir })
  const runtime = createRuntime({ contentAdapter })
  handler = createDraftHandler({ contentAdapter, runtime })
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createDraftHandler', () => {
  describe('save + list', () => {
    it('saves a draft and lists it', async () => {
      const saveRes = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', testPage),
      )
      expect(saveRes.status).toBe(200)
      const saveBody = await saveRes.json() as Record<string, unknown>
      expect(saveBody).toEqual({ ok: true })

      const listRes = await handler.list(
        getRequest('http://localhost/api/agntcms/draft/list'),
      )
      expect(listRes.status).toBe(200)
      const listBody = await listRes.json() as { drafts: Array<{ slug: string; updatedAt: string }> }
      expect(listBody.drafts).toHaveLength(1)
      expect(listBody.drafts[0]!.slug).toBe('hello')
      // updatedAt should be a valid ISO date string
      expect(new Date(listBody.drafts[0]!.updatedAt).toISOString()).toBe(listBody.drafts[0]!.updatedAt)
    })
  })

  describe('save + publish', () => {
    it('saves a draft and publishes it', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', testPage),
      )

      const publishRes = await handler.publish(
        postJson('http://localhost/api/agntcms/draft/publish', { slug: 'hello' }),
      )
      expect(publishRes.status).toBe(200)
      const publishBody = await publishRes.json() as { ok: boolean; page: Page }
      expect(publishBody.ok).toBe(true)
      expect(publishBody.page.slug).toBe('hello')
      expect(publishBody.page.sections).toHaveLength(1)
      expect(publishBody.page.seo).toEqual({ title: 'Hello World', description: 'Hello description' })

      // The published page should now be readable from the pages/ bucket
      const publishedPath = path.join(tmpDir, 'pages', 'hello.json')
      const raw = await fs.readFile(publishedPath, 'utf8')
      const onDisk = JSON.parse(raw) as Page
      expect(onDisk.slug).toBe('hello')
    })
  })

  describe('publish nonexistent draft', () => {
    it('returns 404', async () => {
      const res = await handler.publish(
        postJson('http://localhost/api/agntcms/draft/publish', { slug: 'nope' }),
      )
      expect(res.status).toBe(404)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('not_found')
    })
  })

  describe('save validation', () => {
    it('returns 400 when slug is missing', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', { sections: [] }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('missing_field')
      expect(body['message']).toContain('slug')
    })

    it('returns 400 when slug is empty', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', { slug: '', sections: [] }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('missing_field')
    })

    it('returns 400 when slug is a reserved system-page alias', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', {
          slug: 'error-404',
          seo: { title: 't', description: 'd' },
          sections: [],
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('reserved_slug_alias')
      expect(body['message']).toContain('"404"')
    })

    it('returns 400 when sections is missing', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', { slug: 'foo' }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('missing_field')
      expect(body['message']).toContain('sections')
    })

    it('returns 400 when sections is not an array', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', { slug: 'foo', sections: 'bad' }),
      )
      expect(res.status).toBe(400)
    })

    // SEO is required at the domain layer (basic-SEO guarantee). The save
    // handler must reject any payload that omits or malforms `seo` rather
    // than letting the adapter persist a page without SEO metadata.
    it('returns 400 when seo is missing', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', { slug: 'foo', sections: [] }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('missing_field')
      expect(body['message']).toContain('seo')
    })

    it('returns 400 when seo.title is missing', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', {
          slug: 'foo',
          seo: { description: 'd' },
          sections: [],
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('missing_field')
      expect(body['message']).toContain('seo.title')
    })

    it('returns 400 when seo.description is missing', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', {
          slug: 'foo',
          seo: { title: 't' },
          sections: [],
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('missing_field')
      expect(body['message']).toContain('seo.description')
    })

    // Empty-string and whitespace-only SEO values are rejected too.
    // Without these, `seo: { title: '', description: '' }` would round-trip
    // a 200 and the layout would render ` | agntcms` for the page title
    // (review item H2). The handler delegates the rule to
    // `assertValidPage`, which trims before checking.
    it('returns 400 when seo.title is an empty string', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', {
          slug: 'foo',
          seo: { title: '', description: 'd' },
          sections: [],
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('missing_field')
      expect(body['message']).toContain('seo.title')
    })

    it('returns 400 when seo.description is an empty string', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', {
          slug: 'foo',
          seo: { title: 't', description: '' },
          sections: [],
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('missing_field')
      expect(body['message']).toContain('seo.description')
    })

    it('returns 400 when seo.title is whitespace-only', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', {
          slug: 'foo',
          seo: { title: '   ', description: 'd' },
          sections: [],
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('missing_field')
      expect(body['message']).toContain('seo.title')
    })

    // The save handler must persist ONLY canonical Page fields. Without
    // an explicit reshape, an attacker (or a bug in a client) could
    // inject arbitrary top-level keys that the FS adapter would write
    // verbatim to disk, where they would round-trip back through reads
    // and pollute downstream consumers. Regression guard for review
    // item H1.
    it('drops unknown top-level keys from the persisted page', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', {
          ...testPage,
          // Realistic-looking junk that a future field might reuse.
          maliciousScript: '<script>alert(1)</script>',
          __proto__hack: { polluted: true },
          authorEmail: 'attacker@example.com',
        }),
      )
      expect(res.status).toBe(200)

      // Read what was actually persisted.
      const draftPath = path.join(tmpDir, 'drafts', 'hello.json')
      const raw = await fs.readFile(draftPath, 'utf8')
      const onDisk = JSON.parse(raw) as Record<string, unknown>

      // Canonical fields survive.
      expect(onDisk['slug']).toBe('hello')
      expect(onDisk['seo']).toEqual({
        title: 'Hello World',
        description: 'Hello description',
      })
      expect(onDisk['sections']).toHaveLength(1)

      // Unknown keys must NOT have been persisted.
      expect(onDisk).not.toHaveProperty('maliciousScript')
      expect(onDisk).not.toHaveProperty('__proto__hack')
      expect(onDisk).not.toHaveProperty('authorEmail')
    })

    // Forward-compatible: the four Phase 5 metadata fields must
    // round-trip when present on the body, since the reshape lists
    // them explicitly. Locks the contract so a future reshape rewrite
    // doesn't silently drop them.
    it('preserves optional Phase 5 metadata fields when present', async () => {
      const decorated = {
        slug: 'post-1',
        seo: { title: 'Post 1', description: 'first post' },
        tags: ['post', 'feature'],
        excerpt: 'short summary',
        coverImage: { filename: 'cover.jpg', alt: 'cover' },
        publishedAt: '2026-04-27T10:00:00.000Z',
        sections: [],
      }
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', decorated),
      )
      expect(res.status).toBe(200)

      const draftPath = path.join(tmpDir, 'drafts', 'post-1.json')
      const raw = await fs.readFile(draftPath, 'utf8')
      const onDisk = JSON.parse(raw) as Record<string, unknown>

      expect(onDisk['tags']).toEqual(['post', 'feature'])
      expect(onDisk['excerpt']).toBe('short summary')
      expect(onDisk['coverImage']).toEqual({ filename: 'cover.jpg', alt: 'cover' })
      expect(onDisk['publishedAt']).toBe('2026-04-27T10:00:00.000Z')
    })

    it('returns 400 when body is invalid JSON', async () => {
      const req = new Request('http://localhost/api/agntcms/draft/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json{',
      })
      const res = await handler.save(req)
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('invalid_body')
    })
  })

  describe('reorder', () => {
    const multiSectionPage: Page = {
      slug: 'multi',
      seo: { title: 'Multi', description: 'Multi-section page' },
      sections: [
        { id: 's1', type: 'Hero', data: { title: 'First' } },
        { id: 's2', type: 'Text', data: { body: 'Second' } },
        { id: 's3', type: 'Image', data: { src: 'Third' } },
      ],
    }

    it('reorders sections in a draft', async () => {
      // Save a page with three sections.
      await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', multiSectionPage),
      )

      const res = await handler.reorder(
        postJson('http://localhost/api/agntcms/draft/reorder', {
          slug: 'multi',
          order: ['s3', 's1', 's2'],
        }),
      )
      expect(res.status).toBe(200)
      const body = await res.json() as Record<string, unknown>
      expect(body['ok']).toBe(true)

      // Verify the draft is reordered.
      const draftPath = path.join(tmpDir, 'drafts', 'multi.json')
      const raw = await fs.readFile(draftPath, 'utf8')
      const saved = JSON.parse(raw) as Page
      expect(saved.sections.map((s) => s.id)).toEqual(['s3', 's1', 's2'])
    })

    it('falls back to published page when no draft exists', async () => {
      // Publish the page (no draft left).
      const contentAdapter = createFsContentAdapter({ contentRoot: tmpDir })
      await contentAdapter.saveDraft(multiSectionPage)
      await contentAdapter.publishDraft('multi')

      const res = await handler.reorder(
        postJson('http://localhost/api/agntcms/draft/reorder', {
          slug: 'multi',
          order: ['s2', 's1', 's3'],
        }),
      )
      expect(res.status).toBe(200)

      // The reorder should have created a draft.
      const draft = await contentAdapter.readPage('multi', 'draft')
      expect(draft).not.toBeNull()
      expect(draft!.sections.map((s) => s.id)).toEqual(['s2', 's1', 's3'])
    })

    it('returns 404 when page does not exist', async () => {
      const res = await handler.reorder(
        postJson('http://localhost/api/agntcms/draft/reorder', {
          slug: 'nope',
          order: ['s1'],
        }),
      )
      expect(res.status).toBe(404)
    })

    it('returns 400 when order has different IDs', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', multiSectionPage),
      )

      const res = await handler.reorder(
        postJson('http://localhost/api/agntcms/draft/reorder', {
          slug: 'multi',
          order: ['s1', 's2', 'wrong'],
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('invalid_order')
    })

    it('returns 400 when order has wrong count', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', multiSectionPage),
      )

      const res = await handler.reorder(
        postJson('http://localhost/api/agntcms/draft/reorder', {
          slug: 'multi',
          order: ['s1', 's2'],
        }),
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when order is missing', async () => {
      const res = await handler.reorder(
        postJson('http://localhost/api/agntcms/draft/reorder', {
          slug: 'multi',
        }),
      )
      expect(res.status).toBe(400)
    })
  })

  describe('globalRef passthrough', () => {
    it('saves a draft with globalRef sections and preserves the field', async () => {
      const pageWithGlobalRef: Page = {
        slug: 'with-refs',
        seo: { title: 'With refs', description: 'page with global refs' },
        sections: [
          { id: 'g1', type: '', data: {}, globalRef: 'header' },
          { id: 's1', type: 'Hero', data: { title: 'Hello' } },
        ],
      }

      const saveRes = await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', pageWithGlobalRef),
      )
      expect(saveRes.status).toBe(200)

      // Verify the draft on disk preserved globalRef.
      const draftPath = path.join(tmpDir, 'drafts', 'with-refs.json')
      const raw = await fs.readFile(draftPath, 'utf8')
      const saved = JSON.parse(raw) as Page
      expect(saved.sections[0]!.globalRef).toBe('header')
      expect(saved.sections[1]!.globalRef).toBeUndefined()
    })

    it('reorder preserves globalRef on sections', async () => {
      const page: Page = {
        slug: 'reorder-refs',
        seo: { title: 'Reorder refs', description: 'reorder global refs' },
        sections: [
          { id: 'g1', type: '', data: {}, globalRef: 'header' },
          { id: 's1', type: 'Hero', data: { title: 'Hello' } },
        ],
      }
      await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', page),
      )

      const res = await handler.reorder(
        postJson('http://localhost/api/agntcms/draft/reorder', {
          slug: 'reorder-refs',
          order: ['s1', 'g1'],
        }),
      )
      expect(res.status).toBe(200)

      const draftPath = path.join(tmpDir, 'drafts', 'reorder-refs.json')
      const raw = await fs.readFile(draftPath, 'utf8')
      const saved = JSON.parse(raw) as Page
      expect(saved.sections[0]!.id).toBe('s1')
      expect(saved.sections[0]!.globalRef).toBeUndefined()
      expect(saved.sections[1]!.id).toBe('g1')
      expect(saved.sections[1]!.globalRef).toBe('header')
    })
  })

  describe('publish validation', () => {
    it('returns 400 when slug is missing from publish body', async () => {
      const res = await handler.publish(
        postJson('http://localhost/api/agntcms/draft/publish', {}),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('missing_field')
    })
  })

  describe('discard', () => {
    it('removes the draft and leaves the published page intact', async () => {
      // Publish first so there's a baseline.
      await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', testPage),
      )
      await handler.publish(
        postJson('http://localhost/api/agntcms/draft/publish', { slug: 'hello' }),
      )
      // Add a new draft on top.
      await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', {
          ...testPage,
          sections: [{ id: 's1', type: 'Hero', data: { title: 'v2' } }],
        }),
      )

      const discardRes = await handler.discard(
        postJson('http://localhost/api/agntcms/draft/discard', { slug: 'hello' }),
      )
      expect(discardRes.status).toBe(200)
      const body = await discardRes.json() as Record<string, unknown>
      expect(body).toEqual({ ok: true })

      // Draft gone.
      await expect(
        fs.access(path.join(tmpDir, 'drafts', 'hello.json')),
      ).rejects.toBeTruthy()
      // Published intact.
      const pub = JSON.parse(
        await fs.readFile(path.join(tmpDir, 'pages', 'hello.json'), 'utf8'),
      ) as Page
      expect(pub.sections[0]!.data).toEqual({ title: 'Welcome' })
    })

    it('returns 400 when there is no published version', async () => {
      // Draft only — no publish.
      await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', testPage),
      )

      const res = await handler.discard(
        postJson('http://localhost/api/agntcms/draft/discard', { slug: 'hello' }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('no_published_version')

      // Draft must still be on disk — the guard stopped the operation.
      await expect(
        fs.access(path.join(tmpDir, 'drafts', 'hello.json')),
      ).resolves.toBeUndefined()
    })

    it('returns 404 when published exists but no draft', async () => {
      // Publish so a published version exists.
      await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', testPage),
      )
      await handler.publish(
        postJson('http://localhost/api/agntcms/draft/publish', { slug: 'hello' }),
      )
      // No new draft — discard should 404.
      const res = await handler.discard(
        postJson('http://localhost/api/agntcms/draft/discard', { slug: 'hello' }),
      )
      expect(res.status).toBe(404)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('not_found')
    })

    it('returns 400 when slug is missing', async () => {
      const res = await handler.discard(
        postJson('http://localhost/api/agntcms/draft/discard', {}),
      )
      expect(res.status).toBe(400)
    })
  })

  // -------------------------------------------------------------------------
  // replaceSection — swap a section's type, replacing its data with the
  // new type's default payload. Section id is preserved. New endpoint in
  // v0.5 (added when agent-driven section replacement was dropped).
  //
  // The handler under test in the outer `beforeEach` is built WITHOUT
  // `sectionDefaults`, so these tests build their own handler with the
  // map populated explicitly. The "no defaults" case reuses the shared
  // `handler` from the suite to assert the 400.
  // -------------------------------------------------------------------------
  describe('replaceSection', () => {
    const multiSectionPage: Page = {
      slug: 'multi',
      seo: { title: 'Multi', description: 'Multi-section page' },
      sections: [
        { id: 's1', type: 'Hero', data: { title: 'Hero title' } },
        { id: 's2', type: 'Text', data: { body: 'Text body' } },
        { id: 's3', type: 'Image', data: { src: 'img-src' } },
      ],
    }

    // Build a handler with the section-defaults map wired. Mirrors the
    // shape the template will produce via `deriveHandlerDeps(config)`.
    const makeHandlerWithDefaults = (): DraftHandler => {
      const contentAdapter = createFsContentAdapter({ contentRoot: tmpDir })
      const runtime = createRuntime({ contentAdapter })
      return createDraftHandler({
        contentAdapter,
        runtime,
        sectionDefaults: new Map<string, Readonly<Record<string, unknown>>>([
          ['Hero', { title: 'Default hero', subtitle: '' }],
          ['Text', { body: '' }],
          ['Image', { src: '' }],
          ['Gallery', { images: [] }],
        ]),
      })
    }

    it('replaces a section type and resets its data from defaults; id preserved', async () => {
      const h = makeHandlerWithDefaults()
      await h.save(postJson('http://localhost/api/agntcms/draft/save', multiSectionPage))

      const res = await h.replaceSection(
        postJson('http://localhost/api/agntcms/draft/replace-section', {
          pageSlug: 'multi',
          sectionId: 's2',
          newType: 'Gallery',
        }),
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })

      const draftPath = path.join(tmpDir, 'drafts', 'multi.json')
      const saved = JSON.parse(await fs.readFile(draftPath, 'utf8')) as Page
      expect(saved.sections).toHaveLength(3)
      // Position preserved (still at index 1).
      expect(saved.sections[1]!.id).toBe('s2')
      expect(saved.sections[1]!.type).toBe('Gallery')
      // Data is a fresh copy of Gallery defaults (NOT the previous Text body).
      expect(saved.sections[1]!.data).toEqual({ images: [] })
      // Other sections untouched.
      expect(saved.sections[0]!.type).toBe('Hero')
      expect(saved.sections[2]!.type).toBe('Image')
    })

    it('falls back to the published page when no draft exists', async () => {
      // Seed published-only via adapter (skipping the draft step).
      const contentAdapter = createFsContentAdapter({ contentRoot: tmpDir })
      await contentAdapter.saveDraft(multiSectionPage)
      await contentAdapter.publishDraft('multi')

      const h = makeHandlerWithDefaults()
      const res = await h.replaceSection(
        postJson('http://localhost/api/agntcms/draft/replace-section', {
          pageSlug: 'multi',
          sectionId: 's1',
          newType: 'Text',
        }),
      )
      expect(res.status).toBe(200)

      // A new draft should have been created with the swap applied.
      const draft = await contentAdapter.readPage('multi', 'draft')
      expect(draft).not.toBeNull()
      expect(draft!.sections[0]!.id).toBe('s1')
      expect(draft!.sections[0]!.type).toBe('Text')
      expect(draft!.sections[0]!.data).toEqual({ body: '' })
    })

    it('returns 404 when neither draft nor published exists for the slug', async () => {
      const h = makeHandlerWithDefaults()
      const res = await h.replaceSection(
        postJson('http://localhost/api/agntcms/draft/replace-section', {
          pageSlug: 'does-not-exist',
          sectionId: 's1',
          newType: 'Hero',
        }),
      )
      expect(res.status).toBe(404)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('not_found')
    })

    it('returns 404 when the sectionId is not in the page', async () => {
      const h = makeHandlerWithDefaults()
      await h.save(postJson('http://localhost/api/agntcms/draft/save', multiSectionPage))

      const res = await h.replaceSection(
        postJson('http://localhost/api/agntcms/draft/replace-section', {
          pageSlug: 'multi',
          sectionId: 'no-such-section',
          newType: 'Hero',
        }),
      )
      expect(res.status).toBe(404)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('not_found')
    })

    it('returns 400 when newType has no entry in sectionDefaults', async () => {
      const h = makeHandlerWithDefaults()
      await h.save(postJson('http://localhost/api/agntcms/draft/save', multiSectionPage))

      const res = await h.replaceSection(
        postJson('http://localhost/api/agntcms/draft/replace-section', {
          pageSlug: 'multi',
          sectionId: 's1',
          newType: 'NotRegistered',
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('unknown_section_type')
    })

    it('returns 400 when sectionDefaults is not wired at all', async () => {
      // The default `handler` from `beforeEach` is built WITHOUT
      // `sectionDefaults`. Replacement should still 400 with the same
      // error code as "unknown type" — a template that hasn't completed
      // the v0.5 migration cannot offer this endpoint.
      await handler.save(
        postJson('http://localhost/api/agntcms/draft/save', multiSectionPage),
      )

      const res = await handler.replaceSection(
        postJson('http://localhost/api/agntcms/draft/replace-section', {
          pageSlug: 'multi',
          sectionId: 's1',
          newType: 'Hero',
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('unknown_section_type')
    })

    it('returns 400 when pageSlug is missing', async () => {
      const h = makeHandlerWithDefaults()
      const res = await h.replaceSection(
        postJson('http://localhost/api/agntcms/draft/replace-section', {
          sectionId: 's1',
          newType: 'Hero',
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('missing_field')
      expect(body['message']).toContain('pageSlug')
    })

    it('returns 400 when sectionId is missing', async () => {
      const h = makeHandlerWithDefaults()
      const res = await h.replaceSection(
        postJson('http://localhost/api/agntcms/draft/replace-section', {
          pageSlug: 'multi',
          newType: 'Hero',
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('missing_field')
      expect(body['message']).toContain('sectionId')
    })

    it('returns 400 when newType is missing', async () => {
      const h = makeHandlerWithDefaults()
      const res = await h.replaceSection(
        postJson('http://localhost/api/agntcms/draft/replace-section', {
          pageSlug: 'multi',
          sectionId: 's1',
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('missing_field')
      expect(body['message']).toContain('newType')
    })

    it('returns 400 on invalid JSON body', async () => {
      const h = makeHandlerWithDefaults()
      const res = await h.replaceSection(
        new Request('http://localhost/api/agntcms/draft/replace-section', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{not json',
        }),
      )
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(body['error']).toBe('invalid_body')
    })
  })
})
