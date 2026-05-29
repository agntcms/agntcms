// Integration tests for `getGlobal` (Phase 2 — site-wide globals API).
//
// Mirrors the structure of `getContent.test.ts`: real temp dir, real FS
// content adapter, no mocks. Exercises both modes plus the missing-global
// null path.

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFsContentAdapter } from '../storage/fs/content'
import type { PreviewField } from './getContent.types'
import { createRuntime, type Runtime } from './getContent'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const isPreviewField = (value: unknown): value is PreviewField<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  '__agntcmsPreview' in value &&
  (value as Record<string, unknown>).__agntcmsPreview === true

let tmpDir: string
let runtime: Runtime
let contentAdapter: ReturnType<typeof createFsContentAdapter>

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agntcms-getglobal-test-'))
  contentAdapter = createFsContentAdapter({ contentRoot: tmpDir })
  runtime = createRuntime({ contentAdapter })
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// 1. Missing global — must return null, NOT throw
// ---------------------------------------------------------------------------

describe('getGlobal — missing global', () => {
  it('returns null in published mode when the global does not exist', async () => {
    const result = await runtime.getGlobal({
      name: 'site-header',
      mode: 'published',
    })
    expect(result).toBeNull()
  })

  it('returns null in preview mode when the global does not exist', async () => {
    const result = await runtime.getGlobal({
      name: 'site-header',
      mode: 'preview',
    })
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. Published mode — bare data, zero wrapping
// ---------------------------------------------------------------------------

describe('getGlobal — published mode', () => {
  it('returns the bare global with no PreviewField wrapping', async () => {
    await contentAdapter.saveGlobal({
      name: 'site-header',
      type: 'SiteHeader',
      data: { title: 'agntcms', logo: '/logo.png' },
    })

    const result = await runtime.getGlobal({
      name: 'site-header',
      mode: 'published',
    })

    expect(result).not.toBeNull()
    expect(result!.name).toBe('site-header')
    expect(result!.type).toBe('SiteHeader')

    const data = result!.data as Record<string, unknown>
    expect(data['title']).toBe('agntcms')
    expect(data['logo']).toBe('/logo.png')
    // No wrapping in published mode.
    expect(isPreviewField(data['title'])).toBe(false)
    expect(isPreviewField(data['logo'])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. Preview mode — every field wrapped with kind: 'global' origin
// ---------------------------------------------------------------------------

describe('getGlobal — preview mode', () => {
  it('wraps every field with a PreviewField carrying kind: global origin', async () => {
    // Save through the draft bucket since preview now composes draft→published.
    await contentAdapter.saveGlobalDraft({
      name: 'site-footer',
      type: 'SiteFooter',
      data: { copyright: '2026 agntcms', links: ['/about', '/contact'] },
    })

    const result = await runtime.getGlobal({
      name: 'site-footer',
      mode: 'preview',
    })

    expect(result).not.toBeNull()
    expect(result!.name).toBe('site-footer')
    expect(result!.type).toBe('SiteFooter')

    const data = result!.data as Record<string, unknown>

    // copyright field — wrapped
    const copyright = data['copyright']
    expect(isPreviewField(copyright)).toBe(true)
    const cpf = copyright as PreviewField<unknown>
    expect(cpf.value).toBe('2026 agntcms')
    expect(cpf.origin.kind).toBe('global')
    expect(cpf.origin.globalName).toBe('site-footer')
    expect(cpf.origin.fieldPath).toBe('copyright')
    // Sentinel values for back-compat with existing widgets.
    expect(cpf.origin.pageSlug).toBe('__global__:site-footer')
    expect(cpf.origin.sectionId).toBe('site-footer')
    // 'draft' here is the resolved bucket source (the test's setup saved via
    // `saveGlobalDraft`), NOT a hardcoded v0.1 sentinel — the per-bucket
    // discrimination is exhaustively tested in the newer suite below.
    expect(cpf.origin.source).toBe('draft')
    expect(typeof cpf.origin.revision).toBe('string')
    expect(cpf.origin.revision.length).toBe(64) // SHA-256 hex

    // links field — also wrapped, value preserved as-is (array stays array)
    const links = data['links']
    expect(isPreviewField(links)).toBe(true)
    const lpf = links as PreviewField<unknown>
    expect(lpf.value).toEqual(['/about', '/contact'])
    expect(lpf.origin.kind).toBe('global')
    expect(lpf.origin.fieldPath).toBe('links')
  })

  it('produces stable revision for the same content read twice', async () => {
    await contentAdapter.saveGlobalDraft({
      name: 'header',
      type: 'Header',
      data: { title: 'X' },
    })

    const r1 = await runtime.getGlobal({ name: 'header', mode: 'preview' })
    const r2 = await runtime.getGlobal({ name: 'header', mode: 'preview' })

    const rev1 = (
      (r1!.data as Record<string, unknown>)['title'] as PreviewField<unknown>
    ).origin.revision
    const rev2 = (
      (r2!.data as Record<string, unknown>)['title'] as PreviewField<unknown>
    ).origin.revision

    expect(rev1).toBe(rev2)
  })

  it('produces a different revision when the content changes', async () => {
    await contentAdapter.saveGlobalDraft({
      name: 'header',
      type: 'Header',
      data: { title: 'first' },
    })
    const r1 = await runtime.getGlobal({ name: 'header', mode: 'preview' })

    await contentAdapter.saveGlobalDraft({
      name: 'header',
      type: 'Header',
      data: { title: 'second' },
    })
    const r2 = await runtime.getGlobal({ name: 'header', mode: 'preview' })

    const rev1 = (
      (r1!.data as Record<string, unknown>)['title'] as PreviewField<unknown>
    ).origin.revision
    const rev2 = (
      (r2!.data as Record<string, unknown>)['title'] as PreviewField<unknown>
    ).origin.revision

    expect(rev1).not.toBe(rev2)
  })
})

// ---------------------------------------------------------------------------
// 3b. Preview mode — draft → published composition
// ---------------------------------------------------------------------------

describe('getGlobal — preview composition', () => {
  it('returns the draft when both draft and published exist (draft wins)', async () => {
    await contentAdapter.saveGlobal({
      name: 'header',
      type: 'Header',
      data: { title: 'published-version' },
    })
    await contentAdapter.saveGlobalDraft({
      name: 'header',
      type: 'Header',
      data: { title: 'draft-version' },
    })

    const result = await runtime.getGlobal({ name: 'header', mode: 'preview' })
    const data = result!.data as Record<string, unknown>
    const title = data['title'] as PreviewField<unknown>
    expect(title.value).toBe('draft-version')
    expect(title.origin.source).toBe('draft')
  })

  it('falls back to published when no draft exists, marking source=published', async () => {
    await contentAdapter.saveGlobal({
      name: 'header',
      type: 'Header',
      data: { title: 'live-only' },
    })

    const result = await runtime.getGlobal({ name: 'header', mode: 'preview' })
    const data = result!.data as Record<string, unknown>
    const title = data['title'] as PreviewField<unknown>
    expect(title.value).toBe('live-only')
    expect(title.origin.source).toBe('published')
  })

  it('returns null in preview mode when neither draft nor published exist', async () => {
    const result = await runtime.getGlobal({ name: 'ghost', mode: 'preview' })
    expect(result).toBeNull()
  })

  it('published mode ignores the draft bucket entirely', async () => {
    // Live site behaviour: a draft must NEVER bleed into production
    // even when one exists. Same invariant as `readPage` with mode=published.
    await contentAdapter.saveGlobalDraft({
      name: 'header',
      type: 'Header',
      data: { title: 'draft-only' },
    })

    const result = await runtime.getGlobal({ name: 'header', mode: 'published' })
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4. Strict additivity — getContent path is unchanged
// ---------------------------------------------------------------------------

describe('runtime — getContent unchanged by getGlobal addition', () => {
  it('exposes both getContent and getGlobal on the Runtime surface', () => {
    expect(typeof runtime.getContent).toBe('function')
    expect(typeof runtime.getGlobal).toBe('function')
    expect(typeof runtime.publishDraft).toBe('function')
  })
})
