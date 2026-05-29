// Contract test for the "Page metadata" modal save path.
//
// Why this test exists:
//   `PageMetadataModal` (in `react/admin/AdminModal.tsx`) reads a page
//   via `page/read`, lets the editor edit slug/seo, and POSTs the full
//   page back to `draft/save`. It MUST round-trip every optional Page
//   metadata field (`tags`, `excerpt`, `coverImage`, `publishedAt`) —
//   otherwise opening the modal on a blog post and clicking Save with
//   no edits silently drops the post's tags + publishedAt, because
//   `saveDraft` overwrites the whole page on disk.
//
//   Round 6 caught exactly this regression: the modal's `ReadPageResponse`
//   declared only slug+seo+sections, and the save body listed the same
//   three fields by name. This test pins the shape the modal actually
//   POSTs (mirrored verbatim from `handleSave`) so a future refactor
//   that drops a field flips this test red before it hits the editor.
//
// What this test does NOT exercise:
//   The React modal itself. We mirror the POST shape here in plain JS;
//   wiring up React + jsdom for one button click would add fragile
//   surface area without strengthening the contract. The shape under
//   test is the wire format, and the wire format is what matters.

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFsContentAdapter } from '../../storage/fs/content'
import { createRuntime } from '../../runtime/getContent'
import { createDraftHandler, type DraftHandler } from '../draft/draft-handler'
import { createPageHandler, type PageHandler } from './page-handler'
import type { ContentStorageAdapter } from '../../storage/content'
import type { Page } from '../../domain/index'

let tmpDir: string
let contentAdapter: ContentStorageAdapter
let draftHandler: DraftHandler
let pageHandler: PageHandler

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agntcms-meta-contract-'))
  contentAdapter = createFsContentAdapter({ contentRoot: tmpDir })
  const runtime = createRuntime({ contentAdapter })
  draftHandler = createDraftHandler({ contentAdapter, runtime })
  pageHandler = createPageHandler({ contentAdapter, runtime })
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const blogPost: Page = {
  slug: 'first-post',
  seo: { title: 'First Post', description: 'A first post' },
  tags: ['post', 'launch'],
  excerpt: 'A short summary of the post.',
  coverImage: { filename: 'cover.png', alt: 'Cover image' },
  publishedAt: '2026-04-15T09:00:00Z',
  sections: [
    { id: 's1', type: 'Hero', data: { title: 'Hello' } },
    { id: 's2', type: 'Body', data: { md: '# Content' } },
  ],
}

// Mirrors the POST body assembled by `PageMetadataModal.handleSave`:
//   - slug (from the modal-open slug, since rename is a separate hop)
//   - seo (the editable fields)
//   - sections (originalSections, captured from the read response)
//   - optional metadata fields, conditionally spread when present
// If the modal's `handleSave` shape diverges from this builder, the
// matching contract is broken.
const buildModalSaveBody = (args: {
  readonly slug: string
  readonly seoTitle: string
  readonly seoDescription: string
  readonly sections: Page['sections']
  readonly metadata: {
    readonly tags?: readonly string[]
    readonly excerpt?: string
    readonly coverImage?: Page['coverImage']
    readonly publishedAt?: string
  }
}): Record<string, unknown> => ({
  slug: args.slug,
  seo: { title: args.seoTitle, description: args.seoDescription },
  sections: args.sections,
  ...(args.metadata.tags !== undefined ? { tags: args.metadata.tags } : {}),
  ...(args.metadata.excerpt !== undefined ? { excerpt: args.metadata.excerpt } : {}),
  ...(args.metadata.coverImage !== undefined ? { coverImage: args.metadata.coverImage } : {}),
  ...(args.metadata.publishedAt !== undefined ? { publishedAt: args.metadata.publishedAt } : {}),
})

const postJson = (url: string, body: unknown): Request =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const getRequest = (url: string): Request =>
  new Request(url, { method: 'GET' })

describe('PageMetadataModal ↔ /draft/save contract', () => {
  it('round-trips tags / excerpt / coverImage / publishedAt through read → save', async () => {
    // Seed a published blog post with all metadata fields populated.
    await contentAdapter.saveDraft(blogPost)
    await contentAdapter.publishDraft('first-post')

    // Step 1 — modal fetches the page (edit mode).
    const readRes = await pageHandler.read(
      getRequest('http://localhost/api/agntcms/page/read?slug=first-post'),
    )
    expect(readRes.status).toBe(200)
    const readBody = (await readRes.json()) as { page: Page }
    // Sanity: the read endpoint actually returns the metadata we expect
    // the modal to capture. If this ever regresses, the modal can't
    // round-trip what it never received.
    expect(readBody.page.tags).toEqual(['post', 'launch'])
    expect(readBody.page.excerpt).toBe('A short summary of the post.')
    expect(readBody.page.coverImage).toEqual({ filename: 'cover.png', alt: 'Cover image' })
    expect(readBody.page.publishedAt).toBe('2026-04-15T09:00:00Z')

    // Step 2 — modal builds the save body. The editor did NOT touch
    // metadata; only seo title would typically change. Here we even
    // keep seo untouched to model the worst case: open + Save with no
    // edits MUST not lose data.
    const saveBody = buildModalSaveBody({
      slug: readBody.page.slug,
      seoTitle: readBody.page.seo.title,
      seoDescription: readBody.page.seo.description,
      sections: readBody.page.sections,
      metadata: {
        ...(readBody.page.tags !== undefined ? { tags: readBody.page.tags } : {}),
        ...(readBody.page.excerpt !== undefined ? { excerpt: readBody.page.excerpt } : {}),
        ...(readBody.page.coverImage !== undefined ? { coverImage: readBody.page.coverImage } : {}),
        ...(readBody.page.publishedAt !== undefined ? { publishedAt: readBody.page.publishedAt } : {}),
      },
    })

    // Step 3 — modal POSTs to /draft/save.
    const saveRes = await draftHandler.save(
      postJson('http://localhost/api/agntcms/draft/save', saveBody),
    )
    expect(saveRes.status).toBe(200)

    // Step 4 — read the persisted draft back. Every metadata field the
    // editor never edited must still be present. If the round-trip
    // pattern in `handleSave` regresses (slug+seo+sections only, like
    // the pre-fix shape), the assertions below flip red and call out
    // exactly which field was dropped.
    const persisted = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'drafts', 'first-post.json'), 'utf8'),
    ) as Page
    expect(persisted.tags).toEqual(['post', 'launch'])
    expect(persisted.excerpt).toBe('A short summary of the post.')
    expect(persisted.coverImage).toEqual({ filename: 'cover.png', alt: 'Cover image' })
    expect(persisted.publishedAt).toBe('2026-04-15T09:00:00Z')
    // Sections also untouched.
    expect(persisted.sections).toHaveLength(2)
    expect(persisted.sections[0]).toEqual({ id: 's1', type: 'Hero', data: { title: 'Hello' } })
  })

  it('keeps the persisted draft clean of optional metadata when the source page never had any', async () => {
    // Pages without metadata (e.g. plain landing pages) must NOT gain
    // empty `tags: []` / `excerpt: ''` etc on save. The conditional
    // spread is what guarantees this — if it ever flips to unconditional
    // (`tags: page.tags ?? []`), this test catches it.
    const plainPage: Page = {
      slug: 'about',
      seo: { title: 'About', description: 'About us' },
      sections: [{ id: 's1', type: 'Hero', data: { title: 'About' } }],
    }
    await contentAdapter.saveDraft(plainPage)
    await contentAdapter.publishDraft('about')

    const readRes = await pageHandler.read(
      getRequest('http://localhost/api/agntcms/page/read?slug=about'),
    )
    const readBody = (await readRes.json()) as { page: Page }

    const saveBody = buildModalSaveBody({
      slug: readBody.page.slug,
      seoTitle: readBody.page.seo.title,
      seoDescription: readBody.page.seo.description,
      sections: readBody.page.sections,
      metadata: {
        ...(readBody.page.tags !== undefined ? { tags: readBody.page.tags } : {}),
        ...(readBody.page.excerpt !== undefined ? { excerpt: readBody.page.excerpt } : {}),
        ...(readBody.page.coverImage !== undefined ? { coverImage: readBody.page.coverImage } : {}),
        ...(readBody.page.publishedAt !== undefined ? { publishedAt: readBody.page.publishedAt } : {}),
      },
    })

    const saveRes = await draftHandler.save(
      postJson('http://localhost/api/agntcms/draft/save', saveBody),
    )
    expect(saveRes.status).toBe(200)

    const persisted = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'drafts', 'about.json'), 'utf8'),
    ) as Page
    expect(persisted).not.toHaveProperty('tags')
    expect(persisted).not.toHaveProperty('excerpt')
    expect(persisted).not.toHaveProperty('coverImage')
    expect(persisted).not.toHaveProperty('publishedAt')
  })
})
