// Integration tests for the global-draft handler: save / list / publish / discard.
//
// Mirrors `handlers/draft/draft-handler.test.ts` for pages. Uses the real
// FS adapter against a tmpdir for true integration coverage — no mocks.

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createGlobalDraftHandler } from './global-draft-handler'
import { createFsContentAdapter } from '../../storage/fs/content'
import type { GlobalDraftHandler } from './global-draft-handler'
import type { ContentStorageAdapter } from '../../storage/content'
import type { Global } from '../../domain/index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string
let handler: GlobalDraftHandler
let adapter: ContentStorageAdapter

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agntcms-global-draft-handler-'))
  adapter = createFsContentAdapter({ contentRoot: tmpDir })
  handler = createGlobalDraftHandler({ contentAdapter: adapter })
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

describe('createGlobalDraftHandler', () => {
  describe('save + list', () => {
    it('saves a draft and lists it', async () => {
      const saveRes = await handler.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'Hello' },
        }),
      )
      expect(saveRes.status).toBe(200)
      const saveBody = (await saveRes.json()) as Record<string, unknown>
      expect(saveBody).toEqual({ ok: true })

      const listRes = await handler.list(
        getRequest('http://localhost/api/agntcms/global-draft/list'),
      )
      expect(listRes.status).toBe(200)
      const listBody = (await listRes.json()) as {
        drafts: Array<{ name: string; updatedAt: string }>
      }
      expect(listBody.drafts).toHaveLength(1)
      expect(listBody.drafts[0]!.name).toBe('header')
      expect(new Date(listBody.drafts[0]!.updatedAt).toISOString()).toBe(
        listBody.drafts[0]!.updatedAt,
      )
    })

    it('lists an empty array when no drafts exist', async () => {
      const res = await handler.list(
        getRequest('http://localhost/api/agntcms/global-draft/list'),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { drafts: unknown[] }
      expect(body.drafts).toEqual([])
    })

    it('saving overwrites an existing draft for the same name', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'v1' },
        }),
      )
      await handler.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'v2' },
        }),
      )

      const draft = await adapter.readGlobal('header', 'draft')
      expect((draft!.data as { title: string }).title).toBe('v2')
    })

    it('save does NOT touch the published bucket', async () => {
      // Publish a baseline first.
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { title: 'live' } })

      // Save a different draft on top.
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'pending' },
        }),
      )
      expect(res.status).toBe(200)

      // Published is unchanged.
      const live = await adapter.readGlobal('header', 'published')
      expect((live!.data as { title: string }).title).toBe('live')
    })
  })

  describe('save + publish round-trip', () => {
    it('publishes a saved draft', async () => {
      await handler.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'ready' },
        }),
      )

      const publishRes = await handler.publish(
        postJson('http://localhost/api/agntcms/global-draft/publish', { name: 'header' }),
      )
      expect(publishRes.status).toBe(200)
      const publishBody = (await publishRes.json()) as { ok: boolean; global: Global }
      expect(publishBody.ok).toBe(true)
      expect(publishBody.global.name).toBe('header')
      expect((publishBody.global.data as { title: string }).title).toBe('ready')

      // Live file now has the published content.
      const live = await adapter.readGlobal('header', 'published')
      expect((live!.data as { title: string }).title).toBe('ready')
      // Draft removed.
      expect(await adapter.readGlobal('header', 'draft')).toBeNull()
      // History snapshot was written. Handler-level round-trip coverage:
      // the FS adapter has its own snapshot tests, but the DoD for this
      // commit explicitly requires that "publish writes history + deletes
      // the draft" is visible end-to-end through the handler.
      const history = await adapter.listGlobalHistory('header')
      expect(history.length).toBeGreaterThan(0)
    })
  })

  describe('publish nonexistent draft', () => {
    it('returns 404', async () => {
      const res = await handler.publish(
        postJson('http://localhost/api/agntcms/global-draft/publish', { name: 'ghost' }),
      )
      expect(res.status).toBe(404)
      const body = (await res.json()) as Record<string, unknown>
      expect(body['error']).toBe('not_found')
    })

    it('returns 400 when name is missing from publish body', async () => {
      const res = await handler.publish(
        postJson('http://localhost/api/agntcms/global-draft/publish', {}),
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when name is invalid', async () => {
      const res = await handler.publish(
        postJson('http://localhost/api/agntcms/global-draft/publish', { name: 'a/b' }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('invalid_name')
    })

    it('returns 500 with publish_global_draft_failed when the adapter throws a generic error', async () => {
      // A non-"no draft" adapter failure must surface as 500, not as a
      // misleading 404. We stub the adapter through the handler's deps so
      // the test exercises ONLY the error-mapping branch — the FS adapter
      // does not synthesise this class of failure on its own.
      const stubAdapter: ContentStorageAdapter = {
        ...adapter,
        publishGlobalDraft: async () => {
          throw new Error('disk full')
        },
      }
      const stubHandler = createGlobalDraftHandler({ contentAdapter: stubAdapter })

      const res = await stubHandler.publish(
        postJson('http://localhost/api/agntcms/global-draft/publish', { name: 'header' }),
      )
      expect(res.status).toBe(500)
      const body = (await res.json()) as { error: string; message: string }
      expect(body.error).toBe('publish_global_draft_failed')
      expect(body.message).toContain('disk full')
    })
  })

  describe('discard', () => {
    it('removes a draft and leaves the published global intact', async () => {
      // Publish a baseline.
      await adapter.saveGlobal({ name: 'header', type: 'Hero', data: { title: 'live' } })
      // Save a draft on top.
      await handler.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'pending' },
        }),
      )

      const res = await handler.discard(
        postJson('http://localhost/api/agntcms/global-draft/discard', { name: 'header' }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body).toEqual({ ok: true })

      // Draft is gone, published intact.
      expect(await adapter.readGlobal('header', 'draft')).toBeNull()
      const live = await adapter.readGlobal('header', 'published')
      expect((live!.data as { title: string }).title).toBe('live')
    })

    it('discarding a draft-only global is allowed (no published-version guard)', async () => {
      // Unlike pages, a draft-only global can be discarded — globals
      // legitimately exist as draft-only (fresh create, never published).
      await handler.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'pending' },
        }),
      )
      // Precondition: no published version.
      expect(await adapter.readGlobal('header', 'published')).toBeNull()

      const res = await handler.discard(
        postJson('http://localhost/api/agntcms/global-draft/discard', { name: 'header' }),
      )
      expect(res.status).toBe(200)
      expect(await adapter.readGlobal('header', 'draft')).toBeNull()
    })

    it('returns 404 when no draft exists', async () => {
      const res = await handler.discard(
        postJson('http://localhost/api/agntcms/global-draft/discard', { name: 'ghost' }),
      )
      expect(res.status).toBe(404)
      const body = (await res.json()) as Record<string, unknown>
      expect(body['error']).toBe('not_found')
    })

    it('returns 400 when name is missing', async () => {
      const res = await handler.discard(
        postJson('http://localhost/api/agntcms/global-draft/discard', {}),
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when name is invalid', async () => {
      const res = await handler.discard(
        postJson('http://localhost/api/agntcms/global-draft/discard', { name: '../etc' }),
      )
      expect(res.status).toBe(400)
    })
  })

  describe('save validation', () => {
    it('returns 400 when name is missing', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global-draft/save', { type: 'Hero', data: {} }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('missing_name')
    })

    it('returns 400 when name is invalid', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'a/b',
          type: 'Hero',
          data: {},
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('invalid_name')
    })

    it('returns 400 when type is missing', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'header',
          data: {},
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('missing_type')
    })

    it('returns 400 when type is not in allowedTypes', async () => {
      const guarded = createGlobalDraftHandler({
        contentAdapter: adapter,
        allowedTypes: new Set(['Hero']),
      })
      const res = await guarded.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'header',
          type: 'NotRegistered',
          data: {},
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('unknown_type')
    })

    it('returns 400 when data is missing', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'header',
          type: 'Hero',
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('missing_data')
    })

    it('returns 400 when data is an array', async () => {
      const res = await handler.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'header',
          type: 'Hero',
          data: [],
        }),
      )
      expect(res.status).toBe(400)
    })

    it('returns 400 when body is invalid JSON', async () => {
      const req = new Request('http://localhost/api/agntcms/global-draft/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json{',
      })
      const res = await handler.save(req)
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('invalid_json')
    })
  })

  describe('sectionDefaults merge', () => {
    it('fills missing fields from defaults when saving a draft', async () => {
      const guarded = createGlobalDraftHandler({
        contentAdapter: adapter,
        sectionDefaults: new Map([
          ['Hero', { title: 'default-title', subtitle: 'default-sub' }],
        ]),
      })

      await guarded.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'header',
          type: 'Hero',
          data: { title: 'user-title' },
        }),
      )

      const draft = await adapter.readGlobal('header', 'draft')
      expect(draft!.data).toEqual({ title: 'user-title', subtitle: 'default-sub' })
    })
  })

  describe('system-overwrite guard (Branch B)', () => {
    it('rejects a draft save that would overwrite a system global with a different type', async () => {
      // Set up: a published system global at `site-meta` of type SiteMeta.
      await adapter.saveGlobal({
        name: 'site-meta',
        type: 'SiteMeta',
        data: { siteName: 'site' },
      })

      const guarded = createGlobalDraftHandler({
        contentAdapter: adapter,
        allowedTypes: new Set(['SiteMeta', 'Hero']),
        systemTypes: new Set(['SiteMeta']),
      })

      // Try to draft-save a Hero at the same name.
      const res = await guarded.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'site-meta',
          type: 'Hero',
          data: { title: 'gotcha' },
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('system_global_cannot_be_overwritten')
    })

    it('allows a draft save with the SAME system type', async () => {
      await adapter.saveGlobal({
        name: 'site-meta',
        type: 'SiteMeta',
        data: { siteName: 'old' },
      })

      const guarded = createGlobalDraftHandler({
        contentAdapter: adapter,
        allowedTypes: new Set(['SiteMeta']),
        systemTypes: new Set(['SiteMeta']),
      })

      const res = await guarded.save(
        postJson('http://localhost/api/agntcms/global-draft/save', {
          name: 'site-meta',
          type: 'SiteMeta',
          data: { siteName: 'new' },
        }),
      )
      expect(res.status).toBe(200)
    })
  })
})
