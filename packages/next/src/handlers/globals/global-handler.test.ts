// Integration tests for the global handler: list, save, delete.
//
// Uses the real FS adapter against a tmpdir for true integration coverage.

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createGlobalHandler } from './global-handler'
import { createFsContentAdapter } from '../../storage/fs/content'
import type { GlobalHandler } from './global-handler'
import type { ContentStorageAdapter } from '../../storage/content'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string
let handler: GlobalHandler

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agntcms-global-handler-'))
  const contentAdapter = createFsContentAdapter({ contentRoot: tmpDir })
  handler = createGlobalHandler({ contentAdapter })
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createGlobalHandler', () => {
  describe('list', () => {
    it('returns empty globals array when nothing exists', async () => {
      const res = await handler.list(
        getRequest('http://localhost/api/agntcms/global/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { globals: unknown[] }
      expect(body.globals).toEqual([])
    })

    it('does not include types field when allowedTypes is not provided', async () => {
      const res = await handler.list(
        getRequest('http://localhost/api/agntcms/global/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body['globals']).toBeDefined()
      expect(body['types']).toBeUndefined()
    })

    it('tags each list entry with system: false when systemTypes is not provided', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'Hi' },
        }),
      )

      const res = await handler.list(
        getRequest('http://localhost/api/agntcms/global/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        globals: Array<{ name: string; type: string; system: boolean }>
      }
      expect(body.globals).toHaveLength(1)
      expect(body.globals[0]).toMatchObject({ name: 'header', type: 'Hero', system: false })
    })

    it('tags an entry with system: true when its type is in systemTypes', async () => {
      // Seed two globals so both branches of the lookup are exercised.
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'site-meta',
          type: 'SiteMeta',
          data: {},
        }),
      )
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'Hi' },
        }),
      )

      const tagged = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        systemTypes: new Set(['SiteMeta']),
      })

      const res = await tagged.list(
        getRequest('http://localhost/api/agntcms/global/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        globals: Array<{ name: string; type: string; system: boolean }>
      }
      const bySite = body.globals.find((g) => g.name === 'site-meta')
      const byHeader = body.globals.find((g) => g.name === 'header')
      expect(bySite?.system).toBe(true)
      expect(byHeader?.system).toBe(false)
    })

    it('includes sorted types array when allowedTypes is provided', async () => {
      const restricted = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        allowedTypes: new Set(['Footer', 'Hero', 'Banner']),
      })

      const res = await restricted.list(
        getRequest('http://localhost/api/agntcms/global/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { globals: unknown[]; types: string[]; systemTypes?: string[] }
      expect(body.globals).toEqual([])
      expect(body.types).toEqual(['Banner', 'Footer', 'Hero'])
      // No systemTypes provided -> field is absent (additive flag).
      expect(body.systemTypes).toBeUndefined()
    })

    it('includes sorted systemTypes array when systemTypes is provided', async () => {
      const restricted = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        allowedTypes: new Set(['Footer', 'Hero', 'SiteMeta', 'Search']),
        systemTypes: new Set(['SiteMeta', 'Search']),
      })

      const res = await restricted.list(
        getRequest('http://localhost/api/agntcms/global/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        globals: unknown[]
        types: string[]
        systemTypes: string[]
      }
      expect(body.systemTypes).toEqual(['Search', 'SiteMeta'])
    })

    it('returns globals after saving some', async () => {
      // Save two globals.
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'Hello' },
        }),
      )
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'footer',
          type: 'Footer',
          data: { copyright: '2026' },
        }),
      )

      const res = await handler.list(
        getRequest('http://localhost/api/agntcms/global/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        globals: Array<{ name: string; type: string; updatedAt: string }>
      }
      expect(body.globals).toHaveLength(2)

      const names = body.globals.map((g) => g.name).sort()
      expect(names).toEqual(['footer', 'header'])

      // Each entry should have a valid ISO date.
      for (const g of body.globals) {
        expect(new Date(g.updatedAt).toISOString()).toBe(g.updatedAt)
      }
    })
  })

  describe('read', () => {
    it('returns 400 when name param is missing', async () => {
      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/global/read'),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('missing_name')
    })

    it('returns 400 for invalid name format', async () => {
      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/global/read?name=foo/bar'),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('invalid_name')
    })

    it('returns 404 when global does not exist', async () => {
      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/global/read?name=nonexistent'),
      )
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('not_found')
    })

    it('returns the global data when found', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'Hello', subtitle: 'World' },
        }),
      )

      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/global/read?name=header'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        global: { name: string; type: string; data: Record<string, unknown> }
      }
      expect(body.global.name).toBe('header')
      expect(body.global.type).toBe('Hero')
      expect(body.global.data).toEqual({ title: 'Hello', subtitle: 'World' })
    })

    it('returns the draft when ?mode=draft and a draft exists', async () => {
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { title: 'live' } })
      await adapter.saveGlobalDraft({ name: 'header', type: 'Hero', data: { title: 'pending' } })

      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/global/read?name=header&mode=draft'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        global: { data: Record<string, unknown> }
      }
      expect(body.global.data['title']).toBe('pending')
    })

    it('falls back to published with ?mode=draft when no draft exists', async () => {
      // Admin-read draft→published fallback. The storage adapter has no
      // cross-mode fallback by contract (single-purpose buckets); the
      // handler bridges that gap for the admin UI so a stale "has-draft"
      // hint from the row list is graceful, not destructive.
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { title: 'live' } })

      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/global/read?name=header&mode=draft'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        global: { data: Record<string, unknown> }
        mode: 'draft' | 'published'
      }
      expect(body.global.data['title']).toBe('live')
      // The response surfaces the bucket actually consumed so the
      // client can detect the fallback (e.g. clear a stale draft badge).
      expect(body.mode).toBe('published')
    })

    it('returns 404 with ?mode=draft when neither draft nor published exists', async () => {
      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/global/read?name=header&mode=draft'),
      )
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('not_found')
    })

    it('returns 400 when ?mode is an unknown value', async () => {
      const res = await handler.read(
        getRequest('http://localhost/api/agntcms/global/read?name=header&mode=preview'),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('invalid_mode')
    })
  })

  describe('save', () => {
    it('saves a new global and returns ok', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'Hello' },
        }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body['ok']).toBe(true)

      // Verify on disk.
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const global = await adapter.readGlobal('header', 'published')
      expect(global).not.toBeNull()
      expect(global!.name).toBe('header')
      expect(global!.type).toBe('Hero')
      expect(global!.data).toEqual({ title: 'Hello' })
    })

    it('overwrites an existing global', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'V1' },
        }),
      )

      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'V2' },
        }),
      )
      expect(res.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const global = await adapter.readGlobal('header', 'published')
      expect(global!.data).toEqual({ title: 'V2' })
    })

    it('returns 400 when name is missing', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          type: 'Hero',
          data: {},
        }),
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when type is missing', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          data: {},
        }),
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when data is missing', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
        }),
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when data is an array', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: [1, 2, 3],
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('missing_data')
    })

    it('returns 400 when name contains path separators', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'foo/bar',
          type: 'Hero',
          data: { title: 'Hello' },
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('invalid_name')
    })

    it('returns 400 for invalid JSON', async () => {
      const res = await handler.save(
        new Request('http://localhost/api/agntcms/global/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'not json',
        }),
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 with unknown_type when type is not in allowedTypes', async () => {
      const restricted = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        allowedTypes: new Set(['Hero', 'Footer']),
      })

      const res = await restricted.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Unknown',
          data: { title: 'Hello' },
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string; message: string }
      expect(body.error).toBe('unknown_type')
      expect(body.message).toContain('Unknown')
    })

    it('accepts a known type when allowedTypes is provided', async () => {
      const restricted = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        allowedTypes: new Set(['Hero', 'Footer']),
      })

      const res = await restricted.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'Hello' },
        }),
      )
      expect(res.status).toBe(200)
    })

    it('accepts any type string when allowedTypes is not provided', async () => {
      // handler is created without allowedTypes in beforeEach — any type works.
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'CompletelyArbitraryType',
          data: { title: 'Hello' },
        }),
      )
      expect(res.status).toBe(200)
    })

    it('fills missing fields from sectionDefaults when data is empty', async () => {
      const withDefaults = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        sectionDefaults: new Map([
          ['Hero', { title: 'Default Title', subtitle: 'Default Subtitle' }],
        ]),
      })

      const res = await withDefaults.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: {},
        }),
      )
      expect(res.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const global = await adapter.readGlobal('header', 'published')
      expect(global).not.toBeNull()
      expect(global!.data).toEqual({ title: 'Default Title', subtitle: 'Default Subtitle' })
    })

    it('preserves explicit data values over sectionDefaults', async () => {
      const withDefaults = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        sectionDefaults: new Map([
          ['Hero', { title: 'Default Title', subtitle: 'Default Subtitle' }],
        ]),
      })

      const res = await withDefaults.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'My Custom Title' },
        }),
      )
      expect(res.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const global = await adapter.readGlobal('header', 'published')
      expect(global).not.toBeNull()
      expect(global!.data).toEqual({ title: 'My Custom Title', subtitle: 'Default Subtitle' })
    })

    it('does not merge defaults when sectionDefaults is not provided', async () => {
      // The default `handler` from beforeEach has no sectionDefaults.
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: {},
        }),
      )
      expect(res.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const global = await adapter.readGlobal('header', 'published')
      expect(global).not.toBeNull()
      expect(global!.data).toEqual({})
    })

    it('does not merge defaults when type has no matching entry in sectionDefaults', async () => {
      const withDefaults = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        sectionDefaults: new Map([
          ['Footer', { copyright: '2026' }],
        ]),
      })

      const res = await withDefaults.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: {},
        }),
      )
      expect(res.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const global = await adapter.readGlobal('header', 'published')
      expect(global).not.toBeNull()
      expect(global!.data).toEqual({})
    })

    it('allows CREATING a NEW global whose type is in systemTypes', async () => {
      // Branch A (formerly `system_global_cannot_be_created`) has been
      // removed: a system global may be (re-)created from the admin UI,
      // because deletion is now also allowed. The framework no longer
      // treats system-typed records as locked configuration — `system`
      // is presentation-only, with the single exception of Branch B
      // (type-mismatch overwrite) which remains.
      const guarded = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        allowedTypes: new Set(['SiteMeta', 'Hero']),
        systemTypes: new Set(['SiteMeta']),
      })

      const res = await guarded.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'site-meta',
          type: 'SiteMeta',
          data: { siteName: 'fresh' },
        }),
      )
      expect(res.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const global = await adapter.readGlobal('site-meta', 'published')
      expect(global).not.toBeNull()
      expect(global!.type).toBe('SiteMeta')
      expect(global!.data).toEqual({ siteName: 'fresh' })
    })

    it('allows UPDATING an existing system global (same name + same type)', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'site-meta',
          type: 'SiteMeta',
          data: { siteName: 'v1' },
        }),
      )

      const guarded = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        allowedTypes: new Set(['SiteMeta']),
        systemTypes: new Set(['SiteMeta']),
      })

      const res = await guarded.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'site-meta',
          type: 'SiteMeta',
          data: { siteName: 'v2' },
        }),
      )
      expect(res.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const global = await adapter.readGlobal('site-meta', 'published')
      expect(global!.data).toEqual({ siteName: 'v2' })
    })

    it('rejects overwriting an existing system global with a non-system type', async () => {
      // F8: a save of a NON-system type at a name occupied by a system
      // global must be refused — otherwise a Hero submitted at
      // `site-meta` silently clobbers the SEO config.
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'site-meta',
          type: 'SiteMeta',
          data: { siteName: 'demo' },
        }),
      )

      const guarded = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        allowedTypes: new Set(['Hero', 'SiteMeta']),
        systemTypes: new Set(['SiteMeta']),
      })

      const res = await guarded.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'site-meta',
          type: 'Hero',
          data: {},
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('system_global_cannot_be_overwritten')

      // On-disk record unchanged.
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const existing = await adapter.readGlobal('site-meta', 'published')
      expect(existing).not.toBeNull()
      expect(existing!.type).toBe('SiteMeta')
    })

    it('rejects overwriting a DRAFT-only system global with a non-system type at the same name', async () => {
      // Regression: the live Branch B guard used to read only the
      // `published` bucket, leaving an asymmetric hole with the
      // draft-save guard. A draft saved at a system name (never
      // published) still occupies the name — without the draft read,
      // a live POST of a different non-system type at the same name
      // returned 200, and saveGlobal's sibling-draft cleanup then
      // silently destroyed the pending draft.
      //
      // Use the adapter directly to seed a draft-only system global
      // (the live save handler would, post-fix, refuse to create the
      // draft via the draft handler too, but here we want the test to
      // exercise *this* handler's read symmetry, not the draft path).
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      await adapter.saveGlobalDraft({
        name: 'site-meta',
        type: 'SiteMeta',
        data: { siteName: 'pending' },
      })

      const guarded = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        allowedTypes: new Set(['Hero', 'SiteMeta']),
        systemTypes: new Set(['SiteMeta']),
      })

      const res = await guarded.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'site-meta',
          type: 'Hero',
          data: {},
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('system_global_cannot_be_overwritten')

      // Published bucket is still empty — the save was refused.
      expect(await adapter.readGlobal('site-meta', 'published')).toBeNull()
      // Draft is still intact — sibling-draft cleanup didn't run.
      const draft = await adapter.readGlobal('site-meta', 'draft')
      expect(draft).not.toBeNull()
      expect(draft!.type).toBe('SiteMeta')
      expect(draft!.data).toEqual({ siteName: 'pending' })
    })

    it('allows saving a NON-system global at a name not occupied by a system global', async () => {
      // Control: the unconditional read introduced for F8 must not
      // over-reject regular user globals when systemTypes is set.
      const guarded = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        allowedTypes: new Set(['Hero', 'SiteMeta']),
        systemTypes: new Set(['SiteMeta']),
      })

      const res = await guarded.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'banner',
          type: 'Hero',
          data: {},
        }),
      )
      expect(res.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const existing = await adapter.readGlobal('banner', 'published')
      expect(existing).not.toBeNull()
      expect(existing!.type).toBe('Hero')
    })

    it('fails closed with 500 when readGlobal throws during the system-overwrite check', async () => {
      // Mirrors the F2/F1-fail-closed test on the overwrite-guard side:
      // a thrown read must yield 500 AND saveGlobal must NOT be invoked.
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      let saveCalled = false
      const throwingAdapter: ContentStorageAdapter = {
        ...adapter,
        readGlobal: async () => {
          throw new Error('boom: adapter index corrupted')
        },
        saveGlobal: async (g) => {
          saveCalled = true
          return adapter.saveGlobal(g)
        },
      }

      const guarded = createGlobalHandler({
        contentAdapter: throwingAdapter,
        allowedTypes: new Set(['Hero', 'SiteMeta']),
        systemTypes: new Set(['SiteMeta']),
      })

      // Use a NON-system type so the failure path is the overwrite-check
      // branch (entry condition is systemTypes.size > 0, not obj.type).
      const res = await guarded.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'banner',
          type: 'Hero',
          data: {},
        }),
      )
      expect(res.status).toBe(500)
      const body = (await res.json()) as { error: string; message: string }
      expect(body.error).toBe('read_global_failed')
      expect(body.message).toContain('adapter index corrupted')
      expect(saveCalled).toBe(false)
    })
  })

  describe('delete', () => {
    it('deletes an existing global', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'Hello' },
        }),
      )

      const res = await handler.delete(
        postJson('http://localhost/api/agntcms/global/delete', {
          name: 'header',
        }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body['ok']).toBe(true)

      // Verify gone.
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      expect(await adapter.readGlobal('header', 'published')).toBeNull()
    })

    it('returns 404 when global does not exist', async () => {
      const res = await handler.delete(
        postJson('http://localhost/api/agntcms/global/delete', {
          name: 'ghost',
        }),
      )
      expect(res.status).toBe(404)
    })

    it('returns 400 when name is missing', async () => {
      const res = await handler.delete(
        postJson('http://localhost/api/agntcms/global/delete', {}),
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when name contains path separators', async () => {
      const res = await handler.delete(
        postJson('http://localhost/api/agntcms/global/delete', {
          name: 'foo/bar',
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('invalid_name')
    })

    it('allows deletion of a global whose type is in systemTypes', async () => {
      // System-flagged globals are now first-class deletable records — the
      // `system: true` flag drives only UI grouping and the Branch-B
      // overwrite guard on `save`. The delete handler no longer reads
      // before mutating.
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'site-meta',
          type: 'SiteMeta',
          data: { siteName: 'demo' },
        }),
      )

      const guarded = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        systemTypes: new Set(['SiteMeta']),
      })

      const res = await guarded.delete(
        postJson('http://localhost/api/agntcms/global/delete', {
          name: 'site-meta',
        }),
      )
      expect(res.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      expect(await adapter.readGlobal('site-meta', 'published')).toBeNull()
    })

    it('still deletes a non-system global when systemTypes is configured', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'Hi' },
        }),
      )

      const guarded = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        systemTypes: new Set(['SiteMeta']),
      })

      const res = await guarded.delete(
        postJson('http://localhost/api/agntcms/global/delete', {
          name: 'header',
        }),
      )
      expect(res.status).toBe(200)
    })

    it('allows deleting a system global and then re-creating one of the same system type at the same name', async () => {
      // End-to-end round-trip: this is the supported recovery flow for a
      // user who wants to reset a framework-managed global (e.g. wipe
      // site-meta back to defaults). Delete + save must both succeed
      // against a handler with the system guard configured.
      const guarded = createGlobalHandler({
        contentAdapter: createFsContentAdapter({ contentRoot: tmpDir }),
        allowedTypes: new Set(['SiteMeta']),
        systemTypes: new Set(['SiteMeta']),
      })

      // Seed an existing system global through the same guarded handler.
      const seed = await guarded.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'site-meta',
          type: 'SiteMeta',
          data: { siteName: 'old' },
        }),
      )
      expect(seed.status).toBe(200)

      // Delete it.
      const del = await guarded.delete(
        postJson('http://localhost/api/agntcms/global/delete', {
          name: 'site-meta',
        }),
      )
      expect(del.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      expect(await adapter.readGlobal('site-meta', 'published')).toBeNull()

      // Re-create a fresh system global at the same name and type.
      const recreate = await guarded.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'site-meta',
          type: 'SiteMeta',
          data: { siteName: 'fresh' },
        }),
      )
      expect(recreate.status).toBe(200)

      const after = await adapter.readGlobal('site-meta', 'published')
      expect(after).not.toBeNull()
      expect(after!.type).toBe('SiteMeta')
      expect(after!.data).toEqual({ siteName: 'fresh' })
    })
  })

  describe('listHistory', () => {
    it('returns 400 when name is missing', async () => {
      const res = await handler.listHistory(
        getRequest('http://localhost/api/agntcms/global/history'),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('missing_name')
    })

    it('returns 400 when ts is explicitly empty', async () => {
      const res = await handler.listHistory(
        getRequest('http://localhost/api/agntcms/global/history?name=header&ts='),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('missing_timestamp')
    })

    it('returns empty entries for an unknown name', async () => {
      const res = await handler.listHistory(
        getRequest('http://localhost/api/agntcms/global/history?name=ghost'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { entries: Array<{ timestamp: string }> }
      expect(body.entries).toEqual([])
    })

    it('returns history entries newest-first after multiple saves', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { t: 'A' },
        }),
      )
      // Small delay → distinct millisecond timestamps → lexicographic
      // order matches chronological order (see uniqueGlobalHistoryPath).
      await new Promise((resolve) => setTimeout(resolve, 5))
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { t: 'B' },
        }),
      )

      const res = await handler.listHistory(
        getRequest('http://localhost/api/agntcms/global/history?name=header'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { entries: Array<{ timestamp: string }> }
      expect(body.entries).toHaveLength(2)
      expect(body.entries[0]!.timestamp >= body.entries[1]!.timestamp).toBe(true)
    })

    it('returns the full global body when ?ts= matches', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { t: 'v1' },
        }),
      )

      const list = await handler.listHistory(
        getRequest('http://localhost/api/agntcms/global/history?name=header'),
      )
      const listBody = (await list.json()) as { entries: Array<{ timestamp: string }> }
      const ts = listBody.entries[0]!.timestamp

      const res = await handler.listHistory(
        getRequest(`http://localhost/api/agntcms/global/history?name=header&ts=${ts}`),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        global: { name: string; type: string; data: Record<string, unknown> }
      }
      expect(body.global).toEqual({ name: 'header', type: 'Hero', data: { t: 'v1' } })
    })

    it('returns 404 when ?ts= does not exist', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { t: 'v1' },
        }),
      )
      const res = await handler.listHistory(
        getRequest(
          'http://localhost/api/agntcms/global/history?name=header&ts=2099-01-01T00-00-00.000Z',
        ),
      )
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('not_found')
    })
  })

  describe('rollback', () => {
    it('rolls back to an older snapshot and produces a new history entry', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { t: 'A' },
        }),
      )
      // Small delay so the two saves land in different milliseconds; this
      // keeps lexicographic-newest-first ordering exactly aligned with
      // chronological order (the `-N` suffix tie-breaker would otherwise
      // invert order of two same-millisecond writes — see
      // `uniqueGlobalHistoryPath`).
      await new Promise((resolve) => setTimeout(resolve, 5))
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { t: 'B' },
        }),
      )

      // Find the snapshot that actually contains {t: 'A'} rather than
      // trusting order: robust against same-millisecond rare races.
      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      const all = await adapter.listGlobalHistory('header')
      let tsForA: string | null = null
      for (const entry of all) {
        const snap = await adapter.readGlobalHistorySnapshot('header', entry.timestamp)
        if (snap && (snap.data as { t: string }).t === 'A') {
          tsForA = entry.timestamp
          break
        }
      }
      if (tsForA === null) throw new Error('expected a history entry for A')

      const res = await handler.rollback(
        postJson('http://localhost/api/agntcms/global/rollback', {
          name: 'header',
          timestamp: tsForA,
        }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body['ok']).toBe(true)

      // Live file now holds the old content, and history gained a 3rd entry.
      expect((await adapter.readGlobal('header', 'published'))!.data).toEqual({ t: 'A' })
      expect(await adapter.listGlobalHistory('header')).toHaveLength(3)
    })

    it('rolling back to the current snapshot is a dedupe no-op', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/global/save', {
          name: 'header',
          type: 'Hero',
          data: { t: 'A' },
        }),
      )

      const list = await handler.listHistory(
        getRequest('http://localhost/api/agntcms/global/history?name=header'),
      )
      const listBody = (await list.json()) as { entries: Array<{ timestamp: string }> }
      const latestTs = listBody.entries[0]!.timestamp

      const res = await handler.rollback(
        postJson('http://localhost/api/agntcms/global/rollback', {
          name: 'header',
          timestamp: latestTs,
        }),
      )
      expect(res.status).toBe(200)

      const adapter = createFsContentAdapter({ contentRoot: tmpDir })
      expect(await adapter.listGlobalHistory('header')).toHaveLength(1)
    })

    it('returns 400 when name is missing', async () => {
      const res = await handler.rollback(
        postJson('http://localhost/api/agntcms/global/rollback', {
          timestamp: '2026-04-12T00-00-00.000Z',
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('missing_name')
    })

    it('returns 400 when timestamp is missing', async () => {
      const res = await handler.rollback(
        postJson('http://localhost/api/agntcms/global/rollback', {
          name: 'header',
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('missing_timestamp')
    })

    it('returns 404 when the snapshot does not exist', async () => {
      const res = await handler.rollback(
        postJson('http://localhost/api/agntcms/global/rollback', {
          name: 'header',
          timestamp: '2099-01-01T00-00-00.000Z',
        }),
      )
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('not_found')
    })
  })
})
