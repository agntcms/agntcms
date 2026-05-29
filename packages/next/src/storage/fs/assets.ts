// FS implementation of `AssetStorageAdapter`.
//
// Layout under `assetsRoot` (ARCHITECTURE.md §3: `public/assets/` in the
// template, served as static files by Next.js):
//
//   <assetsRoot>/<sha256-hex><ext>          the bytes
//
// Filename strategy: CONTENT-ADDRESSABLE (sha256 hex + extension).
//
//   Rationale (chosen over slug-based):
//
//   1. Duplicate uploads collapse naturally — the same bytes always produce
//      the same filename, so re-uploading an image during an edit session
//      is a cheap no-op instead of silently growing the assets directory.
//   2. No filename sanitisation edge cases. Slug-based strategies have to
//      wrestle with collisions, unicode, case-insensitive filesystems, and
//      filenames that are already mostly-hex (`a1.png`). Hashes sidestep
//      every one of these.
//   3. URLs become stable without extra bookkeeping: if the bytes do not
//      change, the URL does not change, so cached CDN/browser entries stay
//      valid across re-uploads.
//   4. The asset interface does not promise to preserve the original
//      filename (see `../assets.ts` header: URL format is adapter-defined).
//      That frees us to use the hash as the authoritative name.
//
//   Extension handling: we take the extension from `input.filename` (lower-
//   cased, including the leading `.`), after a conservative character
//   filter. If `filename` has no extension, the stored file has none — the
//   browser will rely on `contentType` for sniffing. We deliberately do NOT
//   derive the extension from `contentType` because MIME → extension
//   mapping is ambiguous (`image/jpeg` → `.jpg` vs `.jpeg`), and guessing
//   wrong produces URLs that mismatch the user's expectations.
//
// Write atomicity:
//
//   Bytes go through a temp file in the same directory and a `rename`
//   onto the final name. Two uploads of the same bytes racing each
//   other converge because `rename` onto an existing file is atomic on
//   POSIX and the end state is identical bytes either way.
//
//   The input buffer MUST NOT be mutated (interface contract). We use
//   `createHash().update(input.bytes)` which reads the buffer, and write
//   it unchanged via `fs.writeFile`.
//
// Security:
//
//   The filename is pure hex plus a vetted extension, so it cannot contain
//   `..`, `/`, or `\`. Even so, we perform a prefix-check on the resolved
//   target path as defence in depth.
//
// Import policy: `node:*` + `../../domain/` (not currently referenced) +
// `../assets` for the interface types. Nothing from runtime/react/etc.

import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type {
  AssetListEntry,
  AssetStorageAdapter,
  AssetUploadInput,
  AssetUploadResult,
} from '../assets'
import { isEnoent, writeAtomic } from './_helpers'

/** Config for `createFsAssetAdapter`. */
export interface FsAssetAdapterOptions {
  /**
   * Absolute path to the directory where uploaded bytes land. In the
   * template this is `public/assets/`, served as static files by Next.js.
   */
  readonly assetsRoot: string
  /**
   * URL prefix prepended to stored filenames to produce `AssetUploadResult.url`.
   * Example: `/assets` yields URLs like `/assets/<hash>.png`.
   * The prefix MUST NOT end in `/`; the adapter always joins with a single
   * `/` before the filename.
   */
  readonly publicUrlBase: string
}

// Conservative extension filter: lowercase letters, digits, `-`, `_`, max
// 16 chars after the leading dot. Rejects anything weird (spaces, multi-dot
// names, unicode). A filename without a recognised extension stores the
// file WITHOUT an extension, which is fine for static serving.
const EXT_PATTERN = /^\.[a-z0-9_-]{1,16}$/

// The picker is image-only. We still skip any `.json` entries in `list()`
// as a cheap defensive filter: if a user ever drops sidecar-style metadata
// (from a remote-adapter experiment, a tool, or an older pre-0.1.18
// install) next to the bytes, we do not want to surface them as assets.
const JSON_SUFFIX = '.json'

const extensionFrom = (filename: string): string => {
  const dot = filename.lastIndexOf('.')
  if (dot < 0 || dot === filename.length - 1) return ''
  const raw = filename.slice(dot).toLowerCase()
  return EXT_PATTERN.test(raw) ? raw : ''
}

// Narrow map from well-known image extensions to MIME types. Used by
// `list()` to populate `contentType`. Unknown extensions surface as
// `undefined`, which the picker treats as "let the browser sniff". This
// table is intentionally small — it is a UI hint, not a source of truth.
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
}

const contentTypeFor = (filename: string): string | undefined => {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return undefined
  const ext = filename.slice(dot).toLowerCase()
  return CONTENT_TYPE_BY_EXT[ext]
}

export const createFsAssetAdapter = (
  options: FsAssetAdapterOptions,
): AssetStorageAdapter => {
  const { assetsRoot, publicUrlBase } = options
  if (!path.isAbsolute(assetsRoot)) {
    throw new Error(
      `assetsRoot must be an absolute path, got: ${JSON.stringify(assetsRoot)}`,
    )
  }
  if (publicUrlBase.endsWith('/')) {
    // Prevent `//<hash>` URLs — the concat rule below assumes no trailing
    // slash. We normalise eagerly rather than silently trimming at use site
    // because misconfigured URLs would be hard to debug otherwise.
    throw new Error(
      `publicUrlBase must not end with '/', got: ${JSON.stringify(publicUrlBase)}`,
    )
  }

  // Resolve once so the prefix check in `upload` is reliable.
  const rootResolved = path.resolve(assetsRoot)
  const rootWithSep = rootResolved.endsWith(path.sep)
    ? rootResolved
    : rootResolved + path.sep

  const upload = async (
    input: AssetUploadInput,
  ): Promise<AssetUploadResult> => {
    // Interface contract: MUST NOT mutate `input.bytes`. `createHash.update`
    // and `fs.writeFile` both read without mutation.
    const hash = createHash('sha256').update(input.bytes).digest('hex')
    const ext = extensionFrom(input.filename)
    const storedName = `${hash}${ext}`

    const target = path.resolve(rootResolved, storedName)
    if (!target.startsWith(rootWithSep)) {
      // Unreachable via a legitimate hash+ext, but kept as defence in
      // depth against future changes to the naming rule.
      throw new Error(`asset path escapes assetsRoot: ${JSON.stringify(target)}`)
    }

    // Idempotency: if a file with this exact hash already exists, the
    // bytes are definitionally identical (modulo a sha256 collision).
    // Skip the write.
    let bytesExist = false
    try {
      await fs.stat(target)
      bytesExist = true
    } catch (err) {
      if (!isEnoent(err)) throw err
    }

    if (!bytesExist) {
      await writeAtomic(target, input.bytes)
    }

    return {
      url: `${publicUrlBase}/${storedName}`,
      filename: storedName,
    }
  }

  const list = async (): Promise<readonly AssetListEntry[]> => {
    let names: string[]
    try {
      names = await fs.readdir(rootResolved)
    } catch (err) {
      // No directory yet → no assets. The handler surfaces an empty list.
      if (isEnoent(err)) return []
      throw err
    }

    // Filter pass: ignore dotfiles (tmp files start with `.`) and any
    // `.json` entries (defensive — see file header). Everything else is
    // a candidate asset.
    const candidates = names.filter(
      (n) => !n.startsWith('.') && !n.endsWith(JSON_SUFFIX),
    )

    const entries: AssetListEntry[] = []
    for (const filename of candidates) {
      const full = path.join(rootResolved, filename)
      let stat: Awaited<ReturnType<typeof fs.stat>>
      try {
        stat = await fs.stat(full)
      } catch (err) {
        if (isEnoent(err)) continue
        throw err
      }
      if (!stat.isFile()) continue
      entries.push({
        filename,
        url: `${publicUrlBase}/${filename}`,
        contentType: contentTypeFor(filename),
        modifiedAt: stat.mtime,
      })
    }

    // Newest-first. `list()` drives the picker, and users expect their
    // most recent uploads at the top. Ties are broken by filename
    // lexicographically so the ordering is deterministic in tests.
    entries.sort((a, b) => {
      const delta = b.modifiedAt.getTime() - a.modifiedAt.getTime()
      if (delta !== 0) return delta
      return a.filename.localeCompare(b.filename)
    })

    return entries
  }

  return { upload, list }
}
