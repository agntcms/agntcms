// Type-level fixture test for the storage interfaces.
//
// There is nothing to execute at runtime yet — T-005 (FS content) and
// T-006 (FS assets) are the first real implementations. This test's job
// is to LOCK the shape of `ContentStorageAdapter` and `AssetStorageAdapter`
// so that accidental changes (adding a method, widening a parameter,
// dropping a return shape) break compilation loudly.
//
// We do that by:
//   1. Building a stub class that implements each interface, using
//      values wired up only to satisfy the types.
//   2. Asserting the exact method signatures with `expectTypeOf`.
//
// The `describe` / `it` shell is there so vitest picks the file up and
// reports it as a green suite; the real assertions are static.

import { describe, expectTypeOf, it } from 'vitest'
import type { Global } from '../domain/index'
import type { Page } from '../domain/index'
import type {
  AssetListEntry,
  AssetStorageAdapter,
  AssetUploadInput,
  AssetUploadResult,
  ContentStorageAdapter,
  DraftSummary,
  GlobalDraftSummary,
  GlobalHistoryEntry,
  GlobalSummary,
  HistoryEntry,
  PageMode,
  PageSummaryEntry,
  PublishedPageEntry,
} from './index'
import type { PageSummary } from '../domain/index'

// --- Content adapter stub --------------------------------------------------

class StubContentAdapter implements ContentStorageAdapter {
  async readPage(_slug: string, _mode: PageMode): Promise<Page | null> {
    return null
  }

  async saveDraft(_page: Page): Promise<void> {
    // no-op
  }

  async listDrafts(): Promise<ReadonlyArray<DraftSummary>> {
    return []
  }

  async listPages(): Promise<ReadonlyArray<PublishedPageEntry>> {
    return []
  }

  async listPageSummaries(): Promise<ReadonlyArray<PageSummaryEntry>> {
    return []
  }

  async publishDraft(slug: string): Promise<Page> {
    // The shape we return is irrelevant; the test only checks the type.
    return { slug, seo: { title: slug, description: slug }, sections: [] }
  }

  async deleteDraft(_slug: string): Promise<void> {
    // no-op
  }

  deletePage = async (_slug: string): Promise<void> => {
    // no-op
  }

  async unpublishPage(_slug: string): Promise<void> {
    // no-op
  }

  async listHistory(_slug: string): Promise<ReadonlyArray<HistoryEntry>> {
    return []
  }

  async readHistorySnapshot(_slug: string, _timestamp: string): Promise<Page | null> {
    return null
  }

  async renamePage(_fromSlug: string, _toSlug: string): Promise<void> {
    // no-op
  }

  async readGlobal(_name: string, _mode: PageMode): Promise<Global | null> {
    return null
  }

  async saveGlobal(_global: Global): Promise<void> {
    // no-op
  }

  async saveGlobalDraft(_global: Global): Promise<void> {
    // no-op
  }

  async listGlobalDrafts(): Promise<ReadonlyArray<GlobalDraftSummary>> {
    return []
  }

  async publishGlobalDraft(name: string): Promise<Global> {
    // The shape we return is irrelevant; the test only checks the type.
    return { name, type: 'Stub', data: {} }
  }

  async deleteGlobalDraft(_name: string): Promise<void> {
    // no-op
  }

  async listGlobals(): Promise<ReadonlyArray<GlobalSummary>> {
    return []
  }

  async deleteGlobal(_name: string): Promise<void> {
    // no-op
  }

  async listGlobalHistory(
    _name: string,
  ): Promise<ReadonlyArray<GlobalHistoryEntry>> {
    return []
  }

  async readGlobalHistorySnapshot(
    _name: string,
    _timestamp: string,
  ): Promise<Global | null> {
    return null
  }

  async rollbackGlobal(_name: string, _timestamp: string): Promise<void> {
    // no-op
  }
}

// --- Asset adapter stub ----------------------------------------------------

class StubAssetAdapter implements AssetStorageAdapter {
  async upload(_input: AssetUploadInput): Promise<AssetUploadResult> {
    return { url: '/assets/stub.bin', filename: 'stub.bin' }
  }

  async list(): Promise<ReadonlyArray<AssetListEntry>> {
    return []
  }
}

describe('storage interface shapes', () => {
  it('ContentStorageAdapter has exactly the v1 method set', () => {
    const adapter: ContentStorageAdapter = new StubContentAdapter()

    expectTypeOf(adapter.readPage).toEqualTypeOf<
      (slug: string, mode: PageMode) => Promise<Page | null>
    >()
    expectTypeOf(adapter.saveDraft).toEqualTypeOf<
      (page: Page) => Promise<void>
    >()
    expectTypeOf(adapter.listDrafts).toEqualTypeOf<
      () => Promise<ReadonlyArray<DraftSummary>>
    >()
    expectTypeOf(adapter.listPages).toEqualTypeOf<
      () => Promise<ReadonlyArray<PublishedPageEntry>>
    >()
    expectTypeOf(adapter.listPageSummaries).toEqualTypeOf<
      () => Promise<ReadonlyArray<PageSummaryEntry>>
    >()
    expectTypeOf(adapter.publishDraft).toEqualTypeOf<
      (slug: string) => Promise<Page>
    >()

    expectTypeOf(adapter.deleteDraft).toEqualTypeOf<
      (slug: string) => Promise<void>
    >()
    expectTypeOf(adapter.deletePage).toEqualTypeOf<
      (slug: string) => Promise<void>
    >()
    expectTypeOf(adapter.unpublishPage).toEqualTypeOf<
      (slug: string) => Promise<void>
    >()

    expectTypeOf(adapter.listHistory).toEqualTypeOf<
      (slug: string) => Promise<ReadonlyArray<HistoryEntry>>
    >()
    expectTypeOf(adapter.readHistorySnapshot).toEqualTypeOf<
      (slug: string, timestamp: string) => Promise<Page | null>
    >()
    expectTypeOf(adapter.renamePage).toEqualTypeOf<
      (fromSlug: string, toSlug: string) => Promise<void>
    >()

    expectTypeOf(adapter.readGlobal).toEqualTypeOf<
      (name: string, mode: PageMode) => Promise<Global | null>
    >()
    expectTypeOf(adapter.saveGlobal).toEqualTypeOf<
      (global: Global) => Promise<void>
    >()
    expectTypeOf(adapter.saveGlobalDraft).toEqualTypeOf<
      (global: Global) => Promise<void>
    >()
    expectTypeOf(adapter.listGlobalDrafts).toEqualTypeOf<
      () => Promise<ReadonlyArray<GlobalDraftSummary>>
    >()
    expectTypeOf(adapter.publishGlobalDraft).toEqualTypeOf<
      (name: string) => Promise<Global>
    >()
    expectTypeOf(adapter.deleteGlobalDraft).toEqualTypeOf<
      (name: string) => Promise<void>
    >()
    expectTypeOf(adapter.listGlobals).toEqualTypeOf<
      () => Promise<ReadonlyArray<GlobalSummary>>
    >()
    expectTypeOf(adapter.deleteGlobal).toEqualTypeOf<
      (name: string) => Promise<void>
    >()

    expectTypeOf(adapter.listGlobalHistory).toEqualTypeOf<
      (name: string) => Promise<ReadonlyArray<GlobalHistoryEntry>>
    >()
    expectTypeOf(adapter.readGlobalHistorySnapshot).toEqualTypeOf<
      (name: string, timestamp: string) => Promise<Global | null>
    >()
    expectTypeOf(adapter.rollbackGlobal).toEqualTypeOf<
      (name: string, timestamp: string) => Promise<void>
    >()

    // Lock the method set. Adding a method requires updating this assertion.
    type MethodNames = keyof ContentStorageAdapter
    expectTypeOf<MethodNames>().toEqualTypeOf<
      'readPage' | 'saveDraft' | 'listDrafts' | 'listPages' | 'listPageSummaries' | 'publishDraft' | 'deleteDraft' | 'deletePage' | 'unpublishPage' | 'listHistory' | 'readHistorySnapshot' | 'renamePage' | 'readGlobal' | 'saveGlobal' | 'saveGlobalDraft' | 'listGlobalDrafts' | 'publishGlobalDraft' | 'deleteGlobalDraft' | 'listGlobals' | 'deleteGlobal' | 'listGlobalHistory' | 'readGlobalHistorySnapshot' | 'rollbackGlobal'
    >()
  })

  it('GlobalDraftSummary carries name and updatedAt only', () => {
    expectTypeOf<GlobalDraftSummary>().toEqualTypeOf<{
      readonly name: string
      readonly updatedAt: Date
    }>()
  })

  it('PageMode is the published/draft literal union', () => {
    expectTypeOf<PageMode>().toEqualTypeOf<'published' | 'draft'>()
  })

  it('DraftSummary carries slug and updatedAt only', () => {
    expectTypeOf<DraftSummary>().toEqualTypeOf<{
      readonly slug: string
      readonly updatedAt: Date
    }>()
  })

  it('PublishedPageEntry carries slug and updatedAt only', () => {
    expectTypeOf<PublishedPageEntry>().toEqualTypeOf<{
      readonly slug: string
      readonly updatedAt: Date
    }>()
  })

  it('PageSummaryEntry is the domain PageSummary widened with updatedAt', () => {
    // Structural identity: every field on the domain summary plus a Date.
    expectTypeOf<PageSummaryEntry>().toMatchTypeOf<PageSummary>()
    expectTypeOf<PageSummaryEntry>().toHaveProperty('updatedAt').toEqualTypeOf<Date>()
    // sections must NOT be reachable on the entry — it's a metadata projection.
    expectTypeOf<PageSummaryEntry>().not.toHaveProperty('sections')
  })

  it('GlobalSummary carries name, type, and updatedAt', () => {
    expectTypeOf<GlobalSummary>().toEqualTypeOf<{
      readonly name: string
      readonly type: string
      readonly updatedAt: Date
    }>()
  })

  it('AssetStorageAdapter carries upload + list in v1', () => {
    const adapter: AssetStorageAdapter = new StubAssetAdapter()

    expectTypeOf(adapter.upload).toEqualTypeOf<
      (input: AssetUploadInput) => Promise<AssetUploadResult>
    >()

    expectTypeOf(adapter.list).toEqualTypeOf<
      () => Promise<ReadonlyArray<AssetListEntry>>
    >()

    // See content-adapter comment — locks the v1 surface. `resolve` is
    // deliberately absent (see assets.ts header for the rationale).
    // `list()` joined the surface in 0.1.16 so the image picker can
    // browse existing assets.
    type MethodNames = keyof AssetStorageAdapter
    expectTypeOf<MethodNames>().toEqualTypeOf<'upload' | 'list'>()
  })

  it('AssetUploadInput carries bytes, filename, and contentType', () => {
    expectTypeOf<AssetUploadInput>().toEqualTypeOf<{
      readonly bytes: Uint8Array
      readonly filename: string
      readonly contentType: string
    }>()
  })

  it('AssetUploadResult carries url and filename', () => {
    expectTypeOf<AssetUploadResult>().toEqualTypeOf<{
      readonly url: string
      readonly filename: string
    }>()
  })

  it('AssetListEntry carries filename, url, contentType, modifiedAt', () => {
    expectTypeOf<AssetListEntry>().toEqualTypeOf<{
      readonly filename: string
      readonly url: string
      readonly contentType: string | undefined
      readonly modifiedAt: Date
    }>()
  })
})
