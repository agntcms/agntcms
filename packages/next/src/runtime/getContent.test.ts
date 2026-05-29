// Integration tests for `createRuntime` (T-008).
//
// These tests use a real temp directory and the real FS content adapter
// from `../storage/fs/content.ts`, exercising both code paths of
// `getContent` (published and preview) and `publishDraft`. No mocks,
// no fakes — the only seam is the OS filesystem.

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Page } from '../domain/index'
import { createFsContentAdapter } from '../storage/fs/content'
import type { PreviewField } from './getContent.types'
import { createRuntime, type Runtime } from './getContent'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const makePage = (slug: string, overrides?: Partial<Page>): Page => ({
  slug,
  // Required at the domain layer (basic-SEO guarantee). Tests that need
  // a specific SEO shape pass it via `overrides`.
  seo: { title: 'Test', description: 'Test page' },
  sections: [
    {
      id: 'hero-1',
      type: 'Hero',
      data: { title: 'Hello', image: '/hero.png' },
    },
  ],
  ...overrides,
})

// Type guard for preview-wrapped fields. Uses the runtime brand property
// introduced in T-008 as the detection mechanism.
const isPreviewField = (value: unknown): value is PreviewField<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  '__agntcmsPreview' in value &&
  (value as Record<string, unknown>).__agntcmsPreview === true

// ---------------------------------------------------------------------------
// Test setup: temp dir + real FS adapter + runtime
// ---------------------------------------------------------------------------

let tmpDir: string
let runtime: Runtime
let contentAdapter: ReturnType<typeof createFsContentAdapter>

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agntcms-runtime-test-'))
  contentAdapter = createFsContentAdapter({ contentRoot: tmpDir })
  runtime = createRuntime({ contentAdapter })
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// 1. Published mode — prod hot path
// ---------------------------------------------------------------------------

describe('getContent — published mode', () => {
  it('returns a published page with bare data (no wrapping)', async () => {
    const page = makePage('home')
    await contentAdapter.saveDraft(page)
    await contentAdapter.publishDraft('home')

    const result = await runtime.getContent({ slug: 'home', mode: 'published' })

    expect(result).not.toBeNull()
    expect(result!.slug).toBe('home')
    expect(result!.sections).toHaveLength(1)

    const sectionData = result!.sections[0]!.data as Record<string, unknown>
    // Published mode returns bare values — no PreviewField wrapping AND
    // no `EditableSlot` wrapping. Slot wrapping is a
    // SectionRenderer-internal concern (EDITABILITY_DESIGN.md, decision
    // #5); the `getContent` public contract returns the bare payload
    // exactly as storage carries it. Pinned by the slot-non-wrapping
    // comment at the top of `runtime/getContent.ts`.
    expect(sectionData.title).toBe('Hello')
    expect(sectionData.image).toBe('/hero.png')
    expect(isPreviewField(sectionData.title)).toBe(false)
    // A slot would be an object with a `value` property and no other
    // primitive shape; the published payload must remain a string here.
    expect(typeof sectionData.title).toBe('string')
    expect(typeof sectionData.image).toBe('string')
  })

  it('returns null when no published page exists', async () => {
    const result = await runtime.getContent({
      slug: 'nonexistent',
      mode: 'published',
    })
    expect(result).toBeNull()
  })

  it('returns null for a slug with dots (e.g. favicon.ico)', async () => {
    const result = await runtime.getContent({
      slug: 'favicon.ico',
      mode: 'published',
    })
    expect(result).toBeNull()
  })

  // Storage→runtime validation: the agent's native file-edit path can
  // write JSON directly to disk, producing a `Page` shape that violates
  // the basic-SEO contract. `getContent` must throw rather than silently
  // surface a malformed page (review item H1).
  it('throws when the published page on disk has missing seo', async () => {
    // Bypass the adapter to write a malformed page directly — this
    // simulates the agent's file-edit path (the JSON.parse cast in the
    // FS adapter is a pure pass-through).
    await fs.mkdir(path.join(tmpDir, 'pages'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDir, 'pages', 'broken.json'),
      JSON.stringify({ slug: 'broken', sections: [] }),
    )
    await expect(
      runtime.getContent({ slug: 'broken', mode: 'published' }),
    ).rejects.toThrow(/seo must be an object/)
  })

  it('throws when the published page on disk has empty seo.title', async () => {
    await fs.mkdir(path.join(tmpDir, 'pages'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDir, 'pages', 'broken.json'),
      JSON.stringify({
        slug: 'broken',
        seo: { title: '', description: 'd' },
        sections: [],
      }),
    )
    await expect(
      runtime.getContent({ slug: 'broken', mode: 'published' }),
    ).rejects.toThrow(/seo\.title must be a non-empty string/)
  })
})

// ---------------------------------------------------------------------------
// 2. Preview mode — editor path
// ---------------------------------------------------------------------------

describe('getContent — preview mode', () => {
  it('reads from draft when a draft exists', async () => {
    const page = makePage('about')
    await contentAdapter.saveDraft(page)

    const result = await runtime.getContent({ slug: 'about', mode: 'preview' })

    expect(result).not.toBeNull()
    expect(result!.slug).toBe('about')
    expect(result!.sections).toHaveLength(1)

    const sectionData = result!.sections[0]!.data as Record<string, unknown>
    const titleField = sectionData.title
    expect(isPreviewField(titleField)).toBe(true)

    const pf = titleField as PreviewField<unknown>
    expect(pf.value).toBe('Hello')
    expect(pf.origin.pageSlug).toBe('about')
    expect(pf.origin.sectionId).toBe('hero-1')
    expect(pf.origin.fieldPath).toBe('title')
    expect(pf.origin.source).toBe('draft')
    expect(typeof pf.origin.revision).toBe('string')
    expect(pf.origin.revision.length).toBe(64) // SHA-256 hex
  })

  it('falls back to published when no draft exists', async () => {
    const page = makePage('about')
    // Publish directly: save draft then publish, so only published exists.
    await contentAdapter.saveDraft(page)
    await contentAdapter.publishDraft('about')

    const result = await runtime.getContent({ slug: 'about', mode: 'preview' })

    expect(result).not.toBeNull()
    const sectionData = result!.sections[0]!.data as Record<string, unknown>
    const titleField = sectionData.title as PreviewField<unknown>
    expect(isPreviewField(titleField)).toBe(true)
    expect(titleField.origin.source).toBe('published')
    expect(titleField.value).toBe('Hello')
  })

  it('returns null when neither draft nor published exists', async () => {
    const result = await runtime.getContent({
      slug: 'nonexistent',
      mode: 'preview',
    })
    expect(result).toBeNull()
  })

  it('returns null for a slug with dots (e.g. assets/placeholder.jpg)', async () => {
    const result = await runtime.getContent({
      slug: 'assets/placeholder.jpg',
      mode: 'preview',
    })
    expect(result).toBeNull()
  })

  it('wraps every field in every section', async () => {
    const page: Page = {
      slug: 'multi',
      seo: { title: 'Multi', description: 'Multi-section page' },
      sections: [
        {
          id: 's1',
          type: 'Hero',
          data: { title: 'T1', image: '/img1.png' },
        },
        {
          id: 's2',
          type: 'TextBlock',
          data: { body: 'some text' },
        },
      ],
    }
    await contentAdapter.saveDraft(page)

    const result = await runtime.getContent({ slug: 'multi', mode: 'preview' })
    expect(result).not.toBeNull()
    expect(result!.sections).toHaveLength(2)

    // Section 1: both fields wrapped
    const s1Data = result!.sections[0]!.data as Record<string, unknown>
    expect(isPreviewField(s1Data.title)).toBe(true)
    expect(isPreviewField(s1Data.image)).toBe(true)
    expect((s1Data.title as PreviewField<unknown>).origin.sectionId).toBe('s1')
    expect((s1Data.image as PreviewField<unknown>).origin.fieldPath).toBe(
      'image',
    )

    // Section 2: single field wrapped
    const s2Data = result!.sections[1]!.data as Record<string, unknown>
    expect(isPreviewField(s2Data.body)).toBe(true)
    expect((s2Data.body as PreviewField<unknown>).value).toBe('some text')
    expect((s2Data.body as PreviewField<unknown>).origin.sectionId).toBe('s2')
  })

  it('preserves page metadata (slug, seo) through wrapping', async () => {
    const page = makePage('seo-page', {
      seo: { title: 'SEO Title', description: 'desc' },
    })
    await contentAdapter.saveDraft(page)

    const result = await runtime.getContent({
      slug: 'seo-page',
      mode: 'preview',
    })
    expect(result).not.toBeNull()
    expect(result!.slug).toBe('seo-page')
    expect(result!.seo).toEqual({ title: 'SEO Title', description: 'desc' })
  })

  // Regression for B1: the rebuild paths used to enumerate `slug`/`seo`
  // by name and silently drop tags/excerpt/coverImage/publishedAt. The
  // helper `withSections` spreads the source page so every metadata
  // field rides through; this test pins that contract for both the
  // draft-source and published-fallback preview paths.
  it('preserves all metadata (tags, excerpt, coverImage, publishedAt) in preview from draft', async () => {
    const page: Page = {
      slug: 'meta-draft',
      seo: { title: 'T', description: 'D' },
      tags: ['post', 'feature'],
      excerpt: 'short summary',
      coverImage: { filename: 'cover.png', alt: 'cover' },
      publishedAt: '2026-04-29T10:00:00.000Z',
      sections: [{ id: 'h-1', type: 'Hero', data: { title: 'Hi' } }],
    }
    await contentAdapter.saveDraft(page)

    const result = await runtime.getContent({ slug: 'meta-draft', mode: 'preview' })
    expect(result).not.toBeNull()
    expect(result!.slug).toBe('meta-draft')
    expect(result!.seo).toEqual({ title: 'T', description: 'D' })
    expect(result!.tags).toEqual(['post', 'feature'])
    expect(result!.excerpt).toBe('short summary')
    expect(result!.coverImage).toEqual({ filename: 'cover.png', alt: 'cover' })
    expect(result!.publishedAt).toBe('2026-04-29T10:00:00.000Z')
  })

  it('preserves all metadata in preview when falling back to published', async () => {
    const page: Page = {
      slug: 'meta-pub',
      seo: { title: 'Meta pub', description: 'pub' },
      tags: ['archived'],
      excerpt: 'pub summary',
      coverImage: { filename: 'pc.png', alt: 'pc' },
      publishedAt: '2026-04-28T08:00:00.000Z',
      sections: [{ id: 't-1', type: 'TextBlock', data: { body: 'b' } }],
    }
    await contentAdapter.saveDraft(page)
    await contentAdapter.publishDraft('meta-pub')

    const result = await runtime.getContent({ slug: 'meta-pub', mode: 'preview' })
    expect(result).not.toBeNull()
    expect(result!.tags).toEqual(['archived'])
    expect(result!.excerpt).toBe('pub summary')
    expect(result!.coverImage).toEqual({ filename: 'pc.png', alt: 'pc' })
    expect(result!.publishedAt).toBe('2026-04-28T08:00:00.000Z')
  })

  it('preserves all metadata in published mode when a global ref triggers rebuild', async () => {
    await contentAdapter.saveGlobal({
      name: 'header',
      type: 'Hero',
      data: { title: 'Global' },
    })
    const page: Page = {
      slug: 'meta-glob',
      seo: { title: 'S', description: 'D' },
      tags: ['x'],
      excerpt: 'e',
      coverImage: { filename: 'g.png', alt: 'g' },
      publishedAt: '2026-04-27T00:00:00.000Z',
      sections: [
        // globalRef section forces the rebuild branch in published mode.
        { id: 'r-1', type: '', data: {}, globalRef: 'header' },
      ],
    }
    await contentAdapter.saveDraft(page)
    await contentAdapter.publishDraft('meta-glob')

    const result = await runtime.getContent({ slug: 'meta-glob', mode: 'published' })
    expect(result).not.toBeNull()
    expect(result!.seo).toEqual({ title: 'S', description: 'D' })
    expect(result!.tags).toEqual(['x'])
    expect(result!.excerpt).toBe('e')
    expect(result!.coverImage).toEqual({ filename: 'g.png', alt: 'g' })
    expect(result!.publishedAt).toBe('2026-04-27T00:00:00.000Z')
    // And the rebuild actually happened (global was resolved).
    expect(result!.sections[0]!.type).toBe('Hero')
  })
})

// ---------------------------------------------------------------------------
// 3. Revision stability
// ---------------------------------------------------------------------------

describe('getContent — revision', () => {
  it('returns the same revision for the same content read twice', async () => {
    const page = makePage('stable')
    await contentAdapter.saveDraft(page)

    const r1 = await runtime.getContent({ slug: 'stable', mode: 'preview' })
    const r2 = await runtime.getContent({ slug: 'stable', mode: 'preview' })

    const rev1 = (
      (r1!.sections[0]!.data as Record<string, unknown>).title as PreviewField<unknown>
    ).origin.revision
    const rev2 = (
      (r2!.sections[0]!.data as Record<string, unknown>).title as PreviewField<unknown>
    ).origin.revision

    expect(rev1).toBe(rev2)
  })

  it('returns a different revision when content changes', async () => {
    const page1 = makePage('changing')
    await contentAdapter.saveDraft(page1)
    const r1 = await runtime.getContent({ slug: 'changing', mode: 'preview' })

    const page2 = makePage('changing', {
      sections: [
        { id: 'hero-1', type: 'Hero', data: { title: 'Updated', image: '/hero.png' } },
      ],
    })
    await contentAdapter.saveDraft(page2)
    const r2 = await runtime.getContent({ slug: 'changing', mode: 'preview' })

    const rev1 = (
      (r1!.sections[0]!.data as Record<string, unknown>).title as PreviewField<unknown>
    ).origin.revision
    const rev2 = (
      (r2!.sections[0]!.data as Record<string, unknown>).title as PreviewField<unknown>
    ).origin.revision

    expect(rev1).not.toBe(rev2)
  })
})

// ---------------------------------------------------------------------------
// 4. publishDraft
// ---------------------------------------------------------------------------

describe('publishDraft', () => {
  it('promotes a draft to published', async () => {
    const page = makePage('pub-test')
    await contentAdapter.saveDraft(page)

    const published = await runtime.publishDraft('pub-test')
    expect(published.slug).toBe('pub-test')

    // The page is now readable in published mode.
    const result = await runtime.getContent({
      slug: 'pub-test',
      mode: 'published',
    })
    expect(result).not.toBeNull()
    expect(result!.slug).toBe('pub-test')
  })

  it('throws when no draft exists', async () => {
    await expect(runtime.publishDraft('no-draft')).rejects.toThrow(
      /no draft/i,
    )
  })

  // Defense in depth: the runtime layer validates the draft before
  // delegating to the adapter. The agent's native file-edit path can
  // write malformed JSON straight to `drafts/`, bypassing the HTTP
  // `parseSaveBody` gate; without this check, `runtime.publishDraft`
  // would happily promote a page with empty `seo.title` to `pages/`,
  // and the next `getContent` read would throw far from the cause.
  it('rejects a malformed draft and leaves pages/ untouched', async () => {
    const draftsDir = path.join(tmpDir, 'drafts')
    await fs.mkdir(draftsDir, { recursive: true })
    const malformed = {
      slug: 'broken',
      seo: { title: '', description: 'desc' },
      sections: [{ id: 's1', type: 'Hero', data: { title: 'X' } }],
    }
    await fs.writeFile(
      path.join(draftsDir, 'broken.json'),
      JSON.stringify(malformed, null, 2),
    )

    await expect(runtime.publishDraft('broken')).rejects.toThrow(/seo\.title/)

    // pages/ may not exist at all; treat ENOENT as proof of zero writes.
    let pagesContents: string[] = []
    try {
      pagesContents = await fs.readdir(path.join(tmpDir, 'pages'))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    expect(pagesContents).not.toContain('broken.json')
  })
})

// ---------------------------------------------------------------------------
// 5. Global reference resolution
// ---------------------------------------------------------------------------

describe('getContent — global references', () => {
  it('resolves globalRef in published mode', async () => {
    // Create a global
    await contentAdapter.saveGlobal({
      name: 'header',
      type: 'Hero',
      data: { title: 'Global Title', image: '/global.png' },
    })

    // Create a page with a section referencing that global
    const page: Page = {
      slug: 'with-global',
      seo: { title: 'With global', description: 'page with a global ref' },
      sections: [
        { id: 'ref-1', type: '', data: {}, globalRef: 'header' },
        { id: 'plain-1', type: 'TextBlock', data: { body: 'Normal' } },
      ],
    }
    await contentAdapter.saveDraft(page)
    await contentAdapter.publishDraft('with-global')

    const result = await runtime.getContent({
      slug: 'with-global',
      mode: 'published',
    })

    expect(result).not.toBeNull()
    expect(result!.sections).toHaveLength(2)

    // The global-ref section should have the global's type and data.
    const refSection = result!.sections[0]!
    expect(refSection.id).toBe('ref-1')
    expect(refSection.type).toBe('Hero')
    expect(refSection.globalRef).toBe('header')
    const refData = refSection.data as Record<string, unknown>
    expect(refData.title).toBe('Global Title')
    expect(refData.image).toBe('/global.png')

    // The plain section should be untouched.
    const plainSection = result!.sections[1]!
    expect(plainSection.id).toBe('plain-1')
    expect(plainSection.type).toBe('TextBlock')
    expect(plainSection.globalRef).toBeUndefined()
  })

  it('resolves globalRef in preview mode with wrapping', async () => {
    await contentAdapter.saveGlobal({
      name: 'footer',
      type: 'Footer',
      data: { copyright: '2026 agntcms' },
    })

    const page: Page = {
      slug: 'preview-global',
      seo: { title: 'Preview global', description: 'preview a global ref' },
      sections: [
        { id: 'g-1', type: '', data: {}, globalRef: 'footer' },
      ],
    }
    await contentAdapter.saveDraft(page)

    const result = await runtime.getContent({
      slug: 'preview-global',
      mode: 'preview',
    })

    expect(result).not.toBeNull()
    const section = result!.sections[0]!
    expect(section.type).toBe('Footer')
    expect(section.globalRef).toBe('footer')

    // The data should be wrapped in PreviewField.
    const data = section.data as Record<string, unknown>
    expect(isPreviewField(data.copyright)).toBe(true)
    const pf = data.copyright as PreviewField<unknown>
    expect(pf.value).toBe('2026 agntcms')
    expect(pf.origin.sectionId).toBe('g-1')
  })

  it('gracefully handles a missing global (section preserved as-is)', async () => {
    const page: Page = {
      slug: 'missing-global',
      seo: { title: 'Missing global', description: 'global ref to a removed global' },
      sections: [
        { id: 'ref-1', type: 'Fallback', data: { x: 1 }, globalRef: 'nonexistent' },
      ],
    }
    await contentAdapter.saveDraft(page)
    await contentAdapter.publishDraft('missing-global')

    const result = await runtime.getContent({
      slug: 'missing-global',
      mode: 'published',
    })

    expect(result).not.toBeNull()
    const section = result!.sections[0]!
    // Section is preserved unchanged when the global is missing.
    expect(section.id).toBe('ref-1')
    expect(section.type).toBe('Fallback')
    expect(section.globalRef).toBe('nonexistent')
    expect((section.data as Record<string, unknown>).x).toBe(1)
  })

  it('skips resolution when no sections have globalRef (zero extra IO)', async () => {
    const page: Page = {
      slug: 'no-globals',
      seo: { title: 'No globals', description: 'page without global refs' },
      sections: [
        { id: 's1', type: 'Hero', data: { title: 'Hello' } },
      ],
    }
    await contentAdapter.saveDraft(page)
    await contentAdapter.publishDraft('no-globals')

    const result = await runtime.getContent({
      slug: 'no-globals',
      mode: 'published',
    })

    expect(result).not.toBeNull()
    expect(result!.sections[0]!.type).toBe('Hero')
    expect(result!.sections[0]!.globalRef).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 6. Invalid slugs — browser noise should produce null, not 500
// ---------------------------------------------------------------------------

describe('getContent — invalid slugs', () => {
  // The catch-all Next.js route passes every URL through `getContent`.
  // Browser requests for favicon.ico, assets, .well-known, etc. reach here
  // with slugs containing dots or other chars the FS adapter rejects.
  // The runtime must return null (→ 404) instead of propagating the throw.

  const invalidSlugs = [
    'favicon.ico',
    'assets/placeholder.jpg',
    '.well-known/acme-challenge/token',
    'path/../escape',
    '',
  ]

  for (const slug of invalidSlugs) {
    it(`published mode: returns null for ${JSON.stringify(slug)}`, async () => {
      const result = await runtime.getContent({ slug, mode: 'published' })
      expect(result).toBeNull()
    })

    it(`preview mode: returns null for ${JSON.stringify(slug)}`, async () => {
      const result = await runtime.getContent({ slug, mode: 'preview' })
      expect(result).toBeNull()
    })
  }
})
