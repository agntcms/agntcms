// Integration tests for the FS `AssetStorageAdapter`.
//
// tmpdir per test, cleaned in afterEach. Round-trip checks verify that the
// returned URL corresponds to an on-disk file under `assetsRoot`, and that
// the content-addressable strategy produces the expected idempotent
// behaviour for duplicate uploads. 0.1.18 reverts the brief sidecar-based
// alt-metadata experiment — there are no sidecar assertions here.

import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFsAssetAdapter } from './assets'

let assetsRoot: string
const publicUrlBase = '/assets'

beforeEach(async () => {
  assetsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agntcms-assets-'))
})

afterEach(async () => {
  await fs.rm(assetsRoot, { recursive: true, force: true })
})

const sha256Hex = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

const bytesOf = (s: string): Uint8Array => new TextEncoder().encode(s)

describe('createFsAssetAdapter', () => {
  it('uploads bytes and returns a URL + filename', async () => {
    const adapter = createFsAssetAdapter({ assetsRoot, publicUrlBase })
    const bytes = bytesOf('hello world')

    const result = await adapter.upload({
      bytes,
      filename: 'greeting.txt',
      contentType: 'text/plain',
    })

    const expectedName = `${sha256Hex(bytes)}.txt`
    expect(result.url).toBe(`${publicUrlBase}/${expectedName}`)
    expect(result.filename).toBe(expectedName)
  })

  it('URL round-trips to a file that exists under assetsRoot', async () => {
    const adapter = createFsAssetAdapter({ assetsRoot, publicUrlBase })
    const bytes = bytesOf('payload')

    const { url } = await adapter.upload({
      bytes,
      filename: 'thing.bin',
      contentType: 'application/octet-stream',
    })

    // Strip publicUrlBase, then resolve inside assetsRoot.
    expect(url.startsWith(`${publicUrlBase}/`)).toBe(true)
    const relative = url.slice(publicUrlBase.length + 1)
    const onDisk = path.join(assetsRoot, relative)

    const stored = await fs.readFile(onDisk)
    expect(Buffer.from(stored)).toEqual(Buffer.from(bytes))
  })

  it('uploads the same bytes twice: idempotent URL, one file on disk', async () => {
    const adapter = createFsAssetAdapter({ assetsRoot, publicUrlBase })
    const bytes = bytesOf('duplicate me')

    const first = await adapter.upload({
      bytes,
      filename: 'a.png',
      contentType: 'image/png',
    })
    const second = await adapter.upload({
      bytes,
      filename: 'b.png', // different hint, same bytes
      contentType: 'image/png',
    })

    // Content-addressable: same bytes → same URL, regardless of filename hint.
    expect(second.url).toBe(first.url)

    const entries = await fs.readdir(assetsRoot)
    // Exactly one bytes file. No sidecars, no temp files left behind.
    expect(entries).toEqual([`${sha256Hex(bytes)}.png`])
  })

  it('different bytes produce different URLs', async () => {
    const adapter = createFsAssetAdapter({ assetsRoot, publicUrlBase })
    const a = await adapter.upload({
      bytes: bytesOf('A'),
      filename: 'x.png',
      contentType: 'image/png',
    })
    const b = await adapter.upload({
      bytes: bytesOf('B'),
      filename: 'x.png',
      contentType: 'image/png',
    })
    expect(a.url).not.toBe(b.url)
  })

  it('strips unsafe extensions and stores without one', async () => {
    const adapter = createFsAssetAdapter({ assetsRoot, publicUrlBase })
    // Weird extension: contains spaces and punctuation — not in EXT_PATTERN.
    const { url } = await adapter.upload({
      bytes: bytesOf('x'),
      filename: 'image.weird ext!',
      contentType: 'image/png',
    })
    expect(url).toBe(`${publicUrlBase}/${sha256Hex(bytesOf('x'))}`)
  })

  it('does NOT mutate the input buffer', async () => {
    const adapter = createFsAssetAdapter({ assetsRoot, publicUrlBase })
    const bytes = bytesOf('immutable please')
    const snapshot = Buffer.from(bytes)

    await adapter.upload({
      bytes,
      filename: 'x.bin',
      contentType: 'application/octet-stream',
    })

    expect(Buffer.from(bytes)).toEqual(snapshot)
  })

  it('rejects a filename that attempts path traversal via extension', async () => {
    // The filename is used only as a hint for the extension. A crafted
    // value must not end up causing a write outside assetsRoot.
    const adapter = createFsAssetAdapter({ assetsRoot, publicUrlBase })
    const bytes = bytesOf('traversal-attempt')
    const { url } = await adapter.upload({
      bytes,
      // `..` in a filename would be dangerous if used naively. Our
      // extension extractor takes only the final `.xxx` segment and
      // validates it against EXT_PATTERN, so this should resolve to an
      // unextended filename under assetsRoot.
      filename: '../../etc/passwd',
      contentType: 'application/octet-stream',
    })

    // URL: `/assets/<hash>` — no `..`, no slashes after publicUrlBase.
    const relative = url.slice(publicUrlBase.length + 1)
    expect(relative).not.toContain('/')
    expect(relative).not.toContain('..')

    // The actual file lives under assetsRoot.
    const onDisk = path.join(assetsRoot, relative)
    await expect(fs.access(onDisk)).resolves.toBeUndefined()

    // Nothing leaked outside assetsRoot.
    const parent = path.dirname(assetsRoot)
    const leak = path.join(parent, 'etc', 'passwd')
    await expect(fs.access(leak)).rejects.toThrow()
  })

  it('creates assetsRoot on first upload if missing', async () => {
    // Create a path INSIDE the tmpdir that does not yet exist.
    const nested = path.join(assetsRoot, 'nested')
    const adapter = createFsAssetAdapter({
      assetsRoot: nested,
      publicUrlBase,
    })
    await expect(fs.access(nested)).rejects.toThrow()
    await adapter.upload({
      bytes: bytesOf('x'),
      filename: 'x.bin',
      contentType: 'application/octet-stream',
    })
    await expect(fs.access(nested)).resolves.toBeUndefined()
  })

  it('rejects a non-absolute assetsRoot', () => {
    expect(() =>
      createFsAssetAdapter({
        assetsRoot: 'relative/assets',
        publicUrlBase,
      }),
    ).toThrow(/absolute/)
  })

  it('rejects a publicUrlBase ending in "/"', () => {
    expect(() =>
      createFsAssetAdapter({
        assetsRoot,
        publicUrlBase: '/assets/',
      }),
    ).toThrow(/must not end with/)
  })
})

describe('createFsAssetAdapter.list', () => {
  it('returns an empty list when assetsRoot does not exist yet', async () => {
    // Point at a sibling path the adapter has not yet populated.
    const fresh = path.join(assetsRoot, 'never-created')
    const adapter = createFsAssetAdapter({
      assetsRoot: fresh,
      publicUrlBase,
    })
    await expect(adapter.list()).resolves.toEqual([])
  })

  it('returns an empty list for an empty directory', async () => {
    const adapter = createFsAssetAdapter({ assetsRoot, publicUrlBase })
    await expect(adapter.list()).resolves.toEqual([])
  })

  it('skips dotfiles and any .json entries', async () => {
    const adapter = createFsAssetAdapter({ assetsRoot, publicUrlBase })
    await adapter.upload({
      bytes: bytesOf('content'),
      filename: 'real.png',
      contentType: 'image/png',
    })

    // Manually drop a dotfile and a stray JSON into the directory. The
    // `.json` filter is defensive — not produced by this adapter, but
    // we must not surface one if present (old sidecar from a prior
    // install, leftover from a tool, etc.).
    await fs.writeFile(path.join(assetsRoot, '.tempfile'), 'noise')
    await fs.writeFile(path.join(assetsRoot, 'orphan.json'), '{}')

    const listed = await adapter.list()
    expect(listed.map((e) => e.filename)).toEqual([
      `${sha256Hex(bytesOf('content'))}.png`,
    ])
  })

  it('sorts entries newest-first by mtime', async () => {
    const adapter = createFsAssetAdapter({ assetsRoot, publicUrlBase })

    const first = await adapter.upload({
      bytes: bytesOf('one'),
      filename: 'one.png',
      contentType: 'image/png',
    })
    // Artificially age the first upload so mtime ordering is
    // unambiguous in fast test runs.
    const oldTime = new Date(Date.now() - 60_000)
    await fs.utimes(
      path.join(assetsRoot, first.filename),
      oldTime,
      oldTime,
    )

    const second = await adapter.upload({
      bytes: bytesOf('two'),
      filename: 'two.png',
      contentType: 'image/png',
    })

    const listed = await adapter.list()
    expect(listed.map((e) => e.filename)).toEqual([
      second.filename,
      first.filename,
    ])
  })

  it('populates contentType from the filename extension', async () => {
    const adapter = createFsAssetAdapter({ assetsRoot, publicUrlBase })
    const uploaded = await adapter.upload({
      bytes: bytesOf('image-bytes'),
      filename: 'hero.png',
      contentType: 'image/png',
    })

    const listed = await adapter.list()
    const match = listed.find((e) => e.filename === uploaded.filename)
    expect(match?.url).toBe(`${publicUrlBase}/${uploaded.filename}`)
    expect(match?.contentType).toBe('image/png')
  })
})
