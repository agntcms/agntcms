// Tests for the config module: `defineConfig`, `withagntcms`, and the
// default adapter factories.

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImageValue, Page } from '../domain/index'
import { TextField, ImageField } from '../domain/index'
import { defineSection } from '../sections/defineSection'
import type { AnySectionDefinition, EditableSlot } from '../sections/defineSection'
import type { ContentStorageAdapter } from '../storage/content'
import type { AssetStorageAdapter } from '../storage/assets'
import {
  defineConfig,
  withagntcms,
  createDefaultContentAdapter,
  createDefaultAssetAdapter,
} from './index'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HeroDef = defineSection({
  name: 'Hero',
  schema: { title: TextField, image: ImageField },
  // EDITABILITY_DESIGN.md sub-task 1: editable kinds become
  // `EditableSlot<K, V>`. The `ImageValue` import is kept because the
  // slot's inner `V` is still `ImageValue`.
  component: (_props: {
    title: EditableSlot<'text', string>
    image: EditableSlot<'image', ImageValue>
  }) => null,
})

const TextBlockDef = defineSection({
  name: 'TextBlock',
  schema: { body: TextField },
  component: (_props: { body: EditableSlot<'text', string> }) => null,
})

// A minimal stub content adapter for tests that need an explicit adapter.
const stubContentAdapter: ContentStorageAdapter = {
  async readPage() {
    return null
  },
  async saveDraft() {},
  async listDrafts() {
    return []
  },
  async listPages() {
    return []
  },
  async listPageSummaries() {
    return []
  },
  async publishDraft(slug: string): Promise<Page> {
    return { slug, seo: { title: slug, description: slug }, sections: [] }
  },
  async deleteDraft() {},
  async deletePage() {},
  async unpublishPage() {},
  async listHistory() {
    return []
  },
  async readHistorySnapshot() {
    return null
  },
  async renamePage() {},
  async readGlobal() {
    return null
  },
  async saveGlobal() {},
  async saveGlobalDraft() {},
  async listGlobalDrafts() {
    return []
  },
  async publishGlobalDraft() {
    return { name: '', type: '', data: {} }
  },
  async deleteGlobalDraft() {},
  async listGlobals() {
    return []
  },
  async deleteGlobal() {},
  async listGlobalHistory() {
    return []
  },
  async readGlobalHistorySnapshot() {
    return null
  },
  async rollbackGlobal() {},
}

// A minimal stub asset adapter for tests that need an explicit adapter.
const stubAssetAdapter: AssetStorageAdapter = {
  async upload() {
    return { url: '/stub', filename: 'stub' }
  },
  async list() {
    return []
  },
}

// ---------------------------------------------------------------------------
// defineConfig
// ---------------------------------------------------------------------------

describe('defineConfig', () => {
  it('returns all provided options unchanged when fully specified', () => {
    const config = defineConfig({
      sections: [HeroDef, TextBlockDef],
      contentAdapter: stubContentAdapter,
      assetAdapter: stubAssetAdapter,
    })

    expect(config.sections).toEqual([HeroDef, TextBlockDef])
    expect(config.contentAdapter).toBe(stubContentAdapter)
    expect(config.assetAdapter).toBe(stubAssetAdapter)
  })

  it('fills in default adapters when not provided', () => {
    const config = defineConfig({
      sections: [HeroDef],
    })

    // Adapters should be present and functional (created by the default
    // factories). We verify by checking that the returned objects have the
    // expected method shapes.
    expect(config.contentAdapter).toBeDefined()
    expect(typeof config.contentAdapter.readPage).toBe('function')
    expect(typeof config.contentAdapter.saveDraft).toBe('function')
    expect(typeof config.contentAdapter.listDrafts).toBe('function')
    expect(typeof config.contentAdapter.publishDraft).toBe('function')

    expect(config.assetAdapter).toBeDefined()
    expect(typeof config.assetAdapter.upload).toBe('function')
  })

  it('default content adapter can readPage without throwing (returns null for nonexistent)', async () => {
    const config = defineConfig({
      sections: [HeroDef],
    })

    // readPage for a nonexistent slug should return null, not throw.
    const result = await config.contentAdapter.readPage('does-not-exist', 'published')
    expect(result).toBeNull()
  })

  it('warns but does not throw when sections array is empty', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const config = defineConfig({
        sections: [] as readonly AnySectionDefinition[],
      })
      expect(config.sections).toEqual([])
      expect(warnSpy).toHaveBeenCalledOnce()
      expect(warnSpy.mock.calls[0]?.[0]).toContain('sections')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('preserves sections identity (does not copy the array)', () => {
    const sections = [HeroDef] as readonly AnySectionDefinition[]
    const config = defineConfig({ sections })
    expect(config.sections).toBe(sections)
  })
})

// ---------------------------------------------------------------------------
// withagntcms
// ---------------------------------------------------------------------------

describe('withagntcms', () => {
  // NODE_ENV is read at call time inside `withagntcms`, so we toggle it
  // around each block that depends on it and restore afterwards. We use
  // the runtime value of `NODE_ENV` (vitest sets it to 'test' by default)
  // as the baseline non-prod case for the dev-extension tests.
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV
  })

  it('preserves all user-provided config properties', () => {
    const config = { foo: 42, bar: 'hello' }
    const result = withagntcms(config)
    expect(result.foo).toBe(42)
    expect(result.bar).toBe('hello')
  })

  it('preserves a user-provided output value', () => {
    // The framework no longer forces a specific `output` value (the
    // standalone-for-Docker injection was removed). A user who sets
    // `output` should see it pass through unchanged — this guards
    // against accidentally re-introducing a strip-or-override.
    const config: Record<string, unknown> = { output: 'export' }
    const result = withagntcms(config)
    expect(result.output).toBe('export')
  })

  it('defaults to dev pageExtensions including dev.ts/dev.tsx when NODE_ENV !== production', () => {
    // The dev variants let the template name dev-only routes
    // (`route.dev.ts`) so they drop out of the prod build naturally.
    process.env.NODE_ENV = 'development'
    const result = withagntcms({})
    expect(result.pageExtensions).toEqual(['dev.ts', 'dev.tsx', 'ts', 'tsx', 'js', 'jsx'])
  })

  it('defaults to prod pageExtensions WITHOUT dev.ts/dev.tsx in production', () => {
    process.env.NODE_ENV = 'production'
    const result = withagntcms({})
    expect(result.pageExtensions).toEqual(['ts', 'tsx', 'js', 'jsx'])
    expect(result.pageExtensions).not.toContain('dev.ts')
    expect(result.pageExtensions).not.toContain('dev.tsx')
  })

  it('respects a user-provided pageExtensions and does not overwrite it', () => {
    // A user who curates their own list (e.g. for MDX) wins over the
    // framework default — the dev-extension convention is opt-in.
    process.env.NODE_ENV = 'development'
    const userExtensions = ['mdx', 'ts', 'tsx']
    const result = withagntcms({ pageExtensions: userExtensions })
    expect(result.pageExtensions).toEqual(userExtensions)
  })

  it('also respects user-provided pageExtensions in production', () => {
    process.env.NODE_ENV = 'production'
    const userExtensions = ['mdx', 'ts', 'tsx']
    const result = withagntcms({ pageExtensions: userExtensions })
    expect(result.pageExtensions).toEqual(userExtensions)
  })

  // outputFileTracingIncludes: the framework must declare `./content/**/*`
  // for every route so Vercel's serverless bundle includes the JSON files
  // that the filesystem adapter reads at request time (nothing `import`s
  // them, so Next won't trace them on its own).

  it('injects outputFileTracingIncludes default for ./content/**/*', () => {
    const result = withagntcms({})
    expect(result.outputFileTracingIncludes).toEqual({
      '/**': ['./content/**/*'],
    })
  })

  it('merges with a user-provided "/**" entry, preserving user globs', () => {
    const result = withagntcms({
      outputFileTracingIncludes: { '/**': ['./other/**/*'] },
    })
    const entry = result.outputFileTracingIncludes['/**']
    expect(entry).toBeDefined()
    expect(entry).toContain('./other/**/*')
    expect(entry).toContain('./content/**/*')
    expect(entry?.length).toBe(2)
  })

  it('dedupes when the user already lists ./content/**/*', () => {
    const result = withagntcms({
      outputFileTracingIncludes: { '/**': ['./content/**/*', './other/**/*'] },
    })
    const entry = result.outputFileTracingIncludes['/**']
    expect(entry).toBeDefined()
    expect(entry).toContain('./other/**/*')
    expect(entry).toContain('./content/**/*')
    // Deduped — `./content/**/*` should appear exactly once.
    expect(entry?.filter((g) => g === './content/**/*').length).toBe(1)
  })

  it('preserves user-provided entries under unrelated route keys', () => {
    const result = withagntcms({
      outputFileTracingIncludes: { '/api/foo': ['./bar/**'] },
    })
    expect(result.outputFileTracingIncludes['/api/foo']).toEqual(['./bar/**'])
    expect(result.outputFileTracingIncludes['/**']).toEqual(['./content/**/*'])
  })

  it('ignores a malformed user outputFileTracingIncludes (defensive fallback)', () => {
    // If the user passed something that doesn't match the expected shape
    // we don't try to merge — we just inject the framework default. The
    // user will see a Next.js validation error from their malformed value
    // separately; we should not crash here.
    const result = withagntcms({
      outputFileTracingIncludes: 'not-an-object' as unknown as Record<string, string[]>,
    })
    expect(result.outputFileTracingIncludes).toEqual({
      '/**': ['./content/**/*'],
    })
  })
})

// ---------------------------------------------------------------------------
// Default adapter factories
// ---------------------------------------------------------------------------

describe('createDefaultContentAdapter', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agntcms-config-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('creates a working adapter with custom projectRoot', async () => {
    const adapter = createDefaultContentAdapter({ projectRoot: tmpDir })
    // Should be able to call readPage without error (returns null for
    // nonexistent slug since the content dir is empty).
    const result = await adapter.readPage('nonexistent', 'published')
    expect(result).toBeNull()
  })

  it('defaults to process.cwd() when projectRoot is omitted', () => {
    // Just ensure it creates without throwing — we cannot meaningfully
    // test the cwd-based adapter without creating files in cwd.
    const adapter = createDefaultContentAdapter()
    expect(typeof adapter.readPage).toBe('function')
  })
})

describe('createDefaultAssetAdapter', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agntcms-config-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('creates a working adapter with custom projectRoot', async () => {
    const adapter = createDefaultAssetAdapter({ projectRoot: tmpDir })
    const result = await adapter.upload({
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      filename: 'test.png',
      contentType: 'image/png',
    })
    expect(result.url).toMatch(/^\/assets\//)
    expect(result.url).toMatch(/\.png$/)
    expect(result.filename).toMatch(/\.png$/)
  })
})
