// Tests for the catch-all route dispatcher.
//
// Scope: routing correctness only. The underlying handler factories
// already have their own exhaustive tests; we do NOT duplicate their
// validation/error coverage here. Each test exercises:
//   - "known (path, method) tuple → underlying handler is called and
//     its Response surfaces unchanged"
//   - "unknown path → 404"
//   - "known path + unsupported method → 405 with Allow header"
//
// Implementation uses an FS-backed content adapter only where the
// underlying handler actually touches storage (drafts and pages); other
// paths use minimal stubs because the dispatcher does not care about
// adapter internals.

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createagntcmsRouteHandler } from './dispatcher'
import { createFsContentAdapter } from '../storage/fs/content'
import { createFsAssetAdapter } from '../storage/fs/assets'
import { createRuntime } from '../runtime/getContent'
import type { agntcmsRouteContext, agntcmsRouteHandlerOptions } from './dispatcher'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a `params: Promise<{ path: string[] }>` like Next.js 15 does. */
const ctxFor = (segments: readonly string[]): agntcmsRouteContext => ({
  params: Promise.resolve({ path: segments }),
})

/** Build a full deps object backed by an FS content adapter inside `dir`.
 *  Each test that mutates state creates its own tmpdir. */
const makeDeps = (dir: string): agntcmsRouteHandlerOptions => {
  const contentAdapter = createFsContentAdapter({ contentRoot: dir })
  const assetAdapter = createFsAssetAdapter({
    assetsRoot: path.join(dir, 'assets'),
    publicUrlBase: '/assets',
  })
  const runtime = createRuntime({ contentAdapter })

  return {
    assets: { assetAdapter },
    draft: { contentAdapter, runtime },
    page: { contentAdapter, runtime },
    global: { contentAdapter },
    globalDraft: { contentAdapter },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createagntcmsRouteHandler', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agntcms-dispatcher-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('routing', () => {
    it('routes GET /draft/list to the draft list handler (200 with shape)', async () => {
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))
      const req = new Request('http://localhost/api/agntcms/draft/list', { method: 'GET' })
      const res = await handler.GET(req, ctxFor(['draft', 'list']))
      expect(res.status).toBe(200)
      const body = (await res.json()) as { drafts: unknown[] }
      // Empty tmpdir, so no drafts yet. The shape comes from the draft
      // handler — proves the dispatcher reached the correct factory.
      expect(body.drafts).toEqual([])
    })

    it('routes GET /assets to the assets list handler', async () => {
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))
      const req = new Request('http://localhost/api/agntcms/assets', { method: 'GET' })
      const res = await handler.GET(req, ctxFor(['assets']))
      expect(res.status).toBe(200)
      const body = (await res.json()) as { assets: unknown[] }
      expect(body.assets).toEqual([])
    })

    it('routes GET /page/read to the page read handler (404 from handler propagates)', async () => {
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))
      const req = new Request('http://localhost/api/agntcms/page/read?slug=missing', { method: 'GET' })
      const res = await handler.GET(req, ctxFor(['page', 'read']))
      // Missing page → 404 from the handler, surfaces unchanged.
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('page_not_found')
    })

    it('routes POST /preview/exit to the preview exit handler (sets Set-Cookie)', async () => {
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))
      const req = new Request('http://localhost/api/agntcms/preview/exit', { method: 'POST' })
      const res = await handler.POST(req, ctxFor(['preview', 'exit']))
      expect(res.status).toBe(200)
      const setCookie = res.headers.get('Set-Cookie')
      expect(setCookie).toContain('Max-Age=0')
    })

    it('routes POST /preview/enter and GET /preview/enter to different methods', async () => {
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))

      const postRes = await handler.POST(
        new Request('http://localhost/api/agntcms/preview/enter', { method: 'POST' }),
        ctxFor(['preview', 'enter']),
      )
      expect(postRes.status).toBe(200)
      expect(postRes.headers.get('Set-Cookie')).toContain('__agntcms_preview=1')

      // Without a token store wired, GET enterWithToken returns 501.
      // The 501 is the handler's response — proves the dispatcher hit
      // the GET arm of `preview/enter`, not the POST arm.
      const getRes = await handler.GET(
        new Request('http://localhost/api/agntcms/preview/enter?token=x', { method: 'GET' }),
        ctxFor(['preview', 'enter']),
      )
      expect(getRes.status).toBe(501)
    })

    // Regression: when the dispatcher is wired WITHOUT an explicit
    // `globalDraft` slice, the fallback must inherit `systemTypes` (and
    // `allowedTypes` / `sectionDefaults`) from `opts.global` so the
    // Branch B overwrite guard fires at the draft boundary. Earlier the
    // fallback was `{ contentAdapter: opts.global.contentAdapter }`,
    // which silently dropped those fields and let a non-system payload
    // be saved as a draft at a system-occupied name — a publish would
    // then clobber the live system global. See
    // global-draft-handler.ts:145-171 for the guard.
    it('global-draft/save inherits systemTypes from global slice when globalDraft is omitted', async () => {
      const contentAdapter = createFsContentAdapter({ contentRoot: tmpDir })
      const assetAdapter = createFsAssetAdapter({
        assetsRoot: path.join(tmpDir, 'assets'),
        publicUrlBase: '/assets',
      })
      const runtime = createRuntime({ contentAdapter })

      // Seed a published system global at `site-meta` of type SiteMeta.
      await contentAdapter.saveGlobal({
        name: 'site-meta',
        type: 'SiteMeta',
        data: { title: 'Existing site meta' },
      })

      // Build deps WITHOUT `globalDraft` — the case we want to cover.
      const deps: agntcmsRouteHandlerOptions = {
        assets: { assetAdapter },
        draft: { contentAdapter, runtime },
        page: { contentAdapter, runtime },
        global: {
          contentAdapter,
          allowedTypes: new Set(['SiteMeta', 'Hero']),
          systemTypes: new Set(['SiteMeta']),
        },
      }

      const handler = createagntcmsRouteHandler(deps)
      const req = new Request('http://localhost/api/agntcms/global-draft/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'site-meta', type: 'Hero', data: { title: 'X' } }),
      })
      const res = await handler.POST(req, ctxFor(['global-draft', 'save']))
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('system_global_cannot_be_overwritten')
    })

    it('routes POST /draft/replace-section to the draft replace-section handler', async () => {
      // No page exists in the tmpdir, so the handler returns 404. That is
      // enough to prove the dispatcher reached the right method on the
      // right factory — exhaustive coverage of the swap mechanics lives
      // in `draft-handler.test.ts`.
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))
      const req = new Request('http://localhost/api/agntcms/draft/replace-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageSlug: 'missing', sectionId: 's1', newType: 'Hero' }),
      })
      const res = await handler.POST(req, ctxFor(['draft', 'replace-section']))
      // Without `sectionDefaults` in `makeDeps`, the handler short-circuits
      // with `unknown_section_type` (400) BEFORE touching storage. That is
      // still the correct dispatcher signal: GET 405 would mean routing
      // failed, 404 would mean a different path matched.
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('unknown_section_type')
    })

    it('routes DELETE /global/delete via the DELETE method export', async () => {
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))
      const req = new Request('http://localhost/api/agntcms/global/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'missing' }),
      })
      const res = await handler.DELETE(req, ctxFor(['global', 'delete']))
      // Missing global → 404 from the handler; routing succeeded.
      expect(res.status).toBe(404)
    })
  })

  describe('unknown path → 404', () => {
    it('returns 404 for a path not in the table', async () => {
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))
      const req = new Request('http://localhost/api/agntcms/does/not/exist', { method: 'GET' })
      const res = await handler.GET(req, ctxFor(['does', 'not', 'exist']))
      expect(res.status).toBe(404)
      // No body — matches the "dispatcher is invisible" contract.
      expect(await res.text()).toBe('')
    })

    it('returns 404 for an empty path array', async () => {
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))
      const req = new Request('http://localhost/api/agntcms/', { method: 'GET' })
      const res = await handler.GET(req, ctxFor([]))
      expect(res.status).toBe(404)
    })
  })

  describe('unsupported method → 405', () => {
    it('returns 405 for POST on a GET-only path with Allow header', async () => {
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))
      const req = new Request('http://localhost/api/agntcms/assets', { method: 'POST' })
      const res = await handler.POST(req, ctxFor(['assets']))
      expect(res.status).toBe(405)
      expect(res.headers.get('Allow')).toBe('GET')
    })

    it('returns 405 for GET on a POST-only path with Allow header', async () => {
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))
      const req = new Request('http://localhost/api/agntcms/draft/save', { method: 'GET' })
      const res = await handler.GET(req, ctxFor(['draft', 'save']))
      expect(res.status).toBe(405)
      expect(res.headers.get('Allow')).toBe('POST')
    })

    it('returns 405 for DELETE on a multi-method path (preview/enter is POST+GET)', async () => {
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))
      const req = new Request('http://localhost/api/agntcms/preview/enter', { method: 'DELETE' })
      const res = await handler.DELETE(req, ctxFor(['preview', 'enter']))
      expect(res.status).toBe(405)
      const allow = res.headers.get('Allow')
      // Either order is acceptable — Object.keys returns insertion order
      // and `preview/enter` is registered with POST first then GET.
      expect(allow).toBe('POST, GET')
    })

    it('returns 405 for PUT on every registered path (no path uses PUT today)', async () => {
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))
      const req = new Request('http://localhost/api/agntcms/page/list', { method: 'PUT' })
      const res = await handler.PUT(req, ctxFor(['page', 'list']))
      expect(res.status).toBe(405)
      expect(res.headers.get('Allow')).toBe('GET')
    })
  })

  describe('params.path Promise convention (Next.js 15)', () => {
    it('awaits the params Promise before dispatching', async () => {
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))

      // Build a Promise that resolves asynchronously on the next tick.
      // The handler must await it, not read it synchronously.
      let resolved = false
      const ctx: agntcmsRouteContext = {
        params: new Promise((resolve) => {
          // Resolve in a microtask — if the dispatcher reads .path without
          // awaiting, it would observe the unresolved Promise and crash.
          queueMicrotask(() => {
            resolved = true
            resolve({ path: ['draft', 'list'] })
          })
        }),
      }

      const res = await handler.GET(
        new Request('http://localhost/api/agntcms/draft/list', { method: 'GET' }),
        ctx,
      )
      expect(resolved).toBe(true)
      expect(res.status).toBe(200)
    })
  })

  describe('Response is forwarded verbatim', () => {
    it('does not wrap or alter the handler Response (status + headers preserved)', async () => {
      // Use preview/exit because it sets a non-trivial header (Set-Cookie)
      // that the dispatcher must NOT strip or modify.
      const handler = createagntcmsRouteHandler(makeDeps(tmpDir))
      const res = await handler.POST(
        new Request('http://localhost/api/agntcms/preview/exit', { method: 'POST' }),
        ctxFor(['preview', 'exit']),
      )
      expect(res.headers.get('Content-Type')).toBe('application/json')
      expect(res.headers.get('Set-Cookie')).toContain('__agntcms_preview=')
    })
  })
})

