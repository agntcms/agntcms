// Route-handler tests for `createAssetsHandler`.
//
// The tests use a stub `AssetStorageAdapter` rather than the FS adapter
// so we can cover 400/500 branches without a tmpdir and without conflating
// handler validation with adapter semantics. The FS adapter has its own
// integration suite.

import { describe, it, expect } from 'vitest'
import { createAssetsHandler } from './assets-handler'
import type {
  AssetListEntry,
  AssetStorageAdapter,
  AssetUploadInput,
  AssetUploadResult,
} from '../../storage/assets'

// ---------------------------------------------------------------------------
// Stub adapter
// ---------------------------------------------------------------------------

interface StubControls {
  readonly entries: AssetListEntry[]
  readonly uploads: AssetUploadInput[]
  throwOnList?: Error | undefined
  throwOnUpload?: Error | undefined
  uploadResult?: AssetUploadResult | undefined
}

const makeAdapter = (ctrl: StubControls): AssetStorageAdapter => ({
  async list() {
    if (ctrl.throwOnList) throw ctrl.throwOnList
    return ctrl.entries
  },
  async upload(input) {
    if (ctrl.throwOnUpload) throw ctrl.throwOnUpload
    ctrl.uploads.push(input)
    return (
      ctrl.uploadResult ?? {
        url: `/assets/${input.filename || 'stub'}`,
        filename: input.filename || 'stub',
      }
    )
  },
})

const fixedDate = (offsetSec: number): Date =>
  new Date(Date.UTC(2026, 3, 14, 10, 0, offsetSec))

// ---------------------------------------------------------------------------
// list()
// ---------------------------------------------------------------------------

describe('createAssetsHandler.list', () => {
  it('returns 200 with serialised entries', async () => {
    const ctrl: StubControls = {
      entries: [
        {
          filename: 'hero.png',
          url: '/assets/hero.png',
          contentType: 'image/png',
          modifiedAt: fixedDate(1),
        },
        {
          filename: 'legacy.png',
          url: '/assets/legacy.png',
          contentType: undefined,
          modifiedAt: fixedDate(0),
        },
      ],
      uploads: [],
    }
    const handler = createAssetsHandler({ assetAdapter: makeAdapter(ctrl) })

    const res = await handler.list(new Request('http://localhost/api/agntcms/assets'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      assets: Array<{ filename: string; url: string; contentType: string | null; modifiedAt: string }>
    }
    expect(body.assets).toEqual([
      {
        filename: 'hero.png',
        url: '/assets/hero.png',
        contentType: 'image/png',
        modifiedAt: fixedDate(1).toISOString(),
      },
      {
        filename: 'legacy.png',
        url: '/assets/legacy.png',
        // undefined content-type becomes null for a stable JSON shape.
        contentType: null,
        modifiedAt: fixedDate(0).toISOString(),
      },
    ])
  })

  it('returns 405 on non-GET requests', async () => {
    const handler = createAssetsHandler({
      assetAdapter: makeAdapter({ entries: [], uploads: [] }),
    })
    const res = await handler.list(
      new Request('http://localhost/api/agntcms/assets', { method: 'POST' }),
    )
    expect(res.status).toBe(405)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('method_not_allowed')
  })

  it('returns 500 when the adapter throws', async () => {
    const handler = createAssetsHandler({
      assetAdapter: makeAdapter({
        entries: [],
        uploads: [],
        throwOnList: new Error('disk offline'),
      }),
    })
    const res = await handler.list(new Request('http://localhost/api/agntcms/assets'))
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('list_failed')
    expect(body.message).toBe('disk offline')
  })
})

// ---------------------------------------------------------------------------
// upload()
// ---------------------------------------------------------------------------

const multipartRequest = (parts: {
  file?: { bytes: Uint8Array; filename: string; type: string }
}): Request => {
  const form = new FormData()
  if (parts.file) {
    // Build a dedicated ArrayBuffer to sidestep TS's SharedArrayBuffer
    // unification on `Uint8Array.buffer` — Blob's BlobPart type insists
    // on a plain ArrayBuffer.
    const buffer = new ArrayBuffer(parts.file.bytes.byteLength)
    new Uint8Array(buffer).set(parts.file.bytes)
    const file = new File([buffer], parts.file.filename, { type: parts.file.type })
    form.append('file', file)
  }
  return new Request('http://localhost/api/agntcms/assets', {
    method: 'POST',
    body: form,
  })
}

describe('createAssetsHandler.upload', () => {
  it('returns 200 with the asset entry on happy path', async () => {
    const ctrl: StubControls = { entries: [], uploads: [] }
    const handler = createAssetsHandler({ assetAdapter: makeAdapter(ctrl) })

    const res = await handler.upload(
      multipartRequest({
        file: {
          bytes: new Uint8Array([1, 2, 3, 4]),
          filename: 'hero.png',
          type: 'image/png',
        },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      asset: {
        filename: string
        url: string
        contentType: string
        modifiedAt: string
      }
    }
    expect(body.asset.filename).toBe('hero.png')
    expect(body.asset.contentType).toBe('image/png')
    // modifiedAt must parse back to a Date.
    expect(new Date(body.asset.modifiedAt).toISOString()).toBe(body.asset.modifiedAt)

    expect(ctrl.uploads).toHaveLength(1)
    expect(ctrl.uploads[0]?.contentType).toBe('image/png')
    expect(ctrl.uploads[0]?.filename).toBe('hero.png')
  })

  it('returns 400 missing_file when no file is attached', async () => {
    const handler = createAssetsHandler({
      assetAdapter: makeAdapter({ entries: [], uploads: [] }),
    })
    const res = await handler.upload(multipartRequest({}))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('missing_file')
  })

  it('returns 400 invalid_content_type for non-image uploads', async () => {
    const handler = createAssetsHandler({
      assetAdapter: makeAdapter({ entries: [], uploads: [] }),
    })
    const res = await handler.upload(
      multipartRequest({
        file: {
          bytes: new Uint8Array([1]),
          filename: 'a.pdf',
          type: 'application/pdf',
        },
      }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('invalid_content_type')
  })

  it('returns 500 when the adapter throws', async () => {
    const handler = createAssetsHandler({
      assetAdapter: makeAdapter({
        entries: [],
        uploads: [],
        throwOnUpload: new Error('disk full'),
      }),
    })
    const res = await handler.upload(
      multipartRequest({
        file: {
          bytes: new Uint8Array([1]),
          filename: 'a.png',
          type: 'image/png',
        },
      }),
    )
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('upload_failed')
    expect(body.message).toBe('disk full')
  })
})
