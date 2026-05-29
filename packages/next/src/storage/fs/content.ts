// FS implementation of `ContentStorageAdapter` (T-005).
//
// Layout under `contentRoot` (ARCHITECTURE.md §3 folder layout):
//
//   <contentRoot>/
//   ├── pages/<slug>.json              # published page
//   ├── drafts/<slug>.json             # pending page draft, removed on publish
//   ├── history/<slug>/<ts>.json       # page snapshots, one per publish (§4)
//   ├── globals/<name>.json            # published global
//   ├── global-drafts/<name>.json      # pending global draft, removed on publish
//   └── history-globals/<name>/<ts>.json# global snapshots, one per publish (§4)
//
// Note on directory separation: page and global history live in distinct
// top-level directories (`history/` vs `history-globals/`) so a page and a
// global that happen to share a name cannot collide on disk.
//
// History filename format (v1 contract, stable): the ISO-8601 timestamp of
// the publish moment with `:` replaced by `-` so the name stays valid on
// case-insensitive and restrictive filesystems (Windows, exFAT). Example:
// `2026-04-11T12-34-56.789Z.json`. Milliseconds are kept to minimise
// collisions when two publishes land in the same second. We tolerate the
// extreme case of two publishes at the exact same millisecond by appending
// `-1`, `-2`, ... until the name is unique — that is a robustness
// concession, not a deviation from the contract.
//
// Write atomicity:
//
//   Every file write goes through `writeAtomic`: write to a sibling temp
//   file in the SAME directory, then `rename` onto the target. `rename` is
//   atomic on POSIX filesystems for files within the same directory, and
//   this is the single guarantee the runtime relies on — no half-written
//   JSON file can ever be observed by a reader, even if the process is
//   killed mid-write. Cross-directory rename is deliberately avoided: some
//   filesystems (tmpfs on different mounts) treat it as copy+unlink, which
//   is not atomic.
//
// Path traversal:
//
//   Slugs come from request bodies and on-disk filenames, both of which
//   must be treated as untrusted. `resolveSlugPath` validates the slug
//   against a conservative regex AND verifies the resolved absolute path
//   is still under the intended bucket directory. Either check alone is
//   not enough: the regex catches `..` and separators, the prefix check
//   catches symlink escapes and future regex bugs.
//
// Import policy (from storage/content.ts header):
//
//   This file may import from `../../domain/` and from `node:*`. It MUST
//   NOT import from `runtime/`, `react/`, `handlers/`, `mcp/`, `tasks/`,
//   `sections/`, or `config/`. The interface in `../content.ts` is the
//   upward seam; we implement it here.

import { constants as fsConstants } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type { Global } from '../../domain/index'
import type { Page } from '../../domain/index'
import { assertValidPage } from '../../domain/index'
import type {
  ContentStorageAdapter,
  DraftSummary,
  GlobalDraftSummary,
  GlobalHistoryEntry,
  GlobalSummary,
  HistoryEntry,
  PageMode,
  PageSummaryEntry,
  PublishedPageEntry,
} from '../content'
import { isEnoent, resolveUnderBucket, writeAtomic } from './_helpers'

/** Config for `createFsContentAdapter`. */
export interface FsContentAdapterOptions {
  /** Absolute path to the root of the content tree (ARCHITECTURE.md §3). */
  readonly contentRoot: string
}

// Conservative slug shape: alphanumerics, `-`, `_`, and `/` only. No dots, no
// leading slash, no empty segments. This rejects `..`, `../etc/passwd`, and
// Windows-style separators. A real application may impose a stricter rule on
// top of this — that is fine; we only enforce the minimum necessary to keep
// the filesystem safe.
const SLUG_PATTERN = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/

const assertValidSlug = (slug: string): void => {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`invalid slug: ${JSON.stringify(slug)}`)
  }
}

/**
 * Structural equality over values that originate from `JSON.parse` — i.e.
 * plain objects, arrays, strings, numbers, booleans, and null. We do NOT
 * support Dates, Maps, Sets, class instances, or `undefined` values,
 * because none of those can round-trip through the storage layer's JSON
 * encoding. Two objects are equal iff they have the same set of own keys
 * (order-independent) and all corresponding values are deep-equal.
 *
 * Used by `publishDraft` to decide whether a publish is a semantic no-op
 * relative to the most recent history snapshot; see ARCHITECTURE.md §4.
 */
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (typeof a !== 'object') return false

  const aIsArr = Array.isArray(a)
  const bIsArr = Array.isArray(b)
  if (aIsArr !== bIsArr) return false

  if (aIsArr) {
    const arrA = a as readonly unknown[]
    const arrB = b as readonly unknown[]
    if (arrA.length !== arrB.length) return false
    for (let i = 0; i < arrA.length; i += 1) {
      if (!deepEqual(arrA[i], arrB[i])) return false
    }
    return true
  }

  const objA = a as Record<string, unknown>
  const objB = b as Record<string, unknown>
  const keysA = Object.keys(objA)
  const keysB = Object.keys(objB)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key)) return false
    if (!deepEqual(objA[key], objB[key])) return false
  }
  return true
}

export const createFsContentAdapter = (
  options: FsContentAdapterOptions,
): ContentStorageAdapter => {
  const { contentRoot } = options
  if (!path.isAbsolute(contentRoot)) {
    throw new Error(
      `contentRoot must be an absolute path, got: ${JSON.stringify(contentRoot)}`,
    )
  }

  // Resolve bucket paths once. `path.resolve` normalises trailing slashes so
  // the prefix check in `resolveSlugPath` is reliable.
  const pagesDir = path.resolve(contentRoot, 'pages')
  const draftsDir = path.resolve(contentRoot, 'drafts')
  const historyDir = path.resolve(contentRoot, 'history')
  const globalsDir = path.resolve(contentRoot, 'globals')
  // Globals now support a draft → publish cycle (mirror of pages). Drafts
  // live under a distinct `global-drafts/` root, parallel to `drafts/` for
  // pages — same disk-isolation rationale as `history-globals/`: a page and
  // a global that share a name cannot collide on disk.
  const globalDraftsDir = path.resolve(contentRoot, 'global-drafts')
  // Kept under a distinct `history-globals/` root (not under `history/`) so a
  // page and a global that share a name (e.g. both called "home") cannot
  // collide on disk. Same filename convention as page history.
  const globalsHistoryDir = path.resolve(contentRoot, 'history-globals')

  /**
   * Compute the absolute path for `<bucket>/<slug>.json` and verify it
   * does not escape the bucket. Belt-and-suspenders: the regex in
   * `assertValidSlug` should already catch any traversal, but the
   * resolved-path prefix check (via `resolveUnderBucket`) is cheap
   * insurance against regex bugs and against symlink-based escapes.
   */
  const resolveSlugPath = (bucket: string, slug: string, ext: string): string => {
    assertValidSlug(slug)
    return resolveUnderBucket(bucket, `${slug}${ext}`, 'slug escapes storage bucket', slug)
  }

  const readJsonOrNull = async <T>(filePath: string): Promise<T | null> => {
    try {
      const raw = await fs.readFile(filePath, { encoding: 'utf8' })
      return JSON.parse(raw) as T
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }
  }

  /**
   * Recursively walk `dir` and return all `.json` file paths relative to
   * `dir`. Handles ENOENT gracefully (directory doesn't exist -> []).
   * Used by `listPages` and `listDrafts` to support nested slugs (e.g.
   * `blog/my-page.json` -> slug `blog/my-page`).
   */
  const listJsonFiles = async (dir: string): Promise<string[]> => {
    let entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }
    const results: string[] = []
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        results.push(entry.name)
      } else if (entry.isDirectory()) {
        const subDir = path.join(dir, entry.name)
        const subFiles = await listJsonFiles(subDir)
        for (const sub of subFiles) {
          results.push(`${entry.name}/${sub}`)
        }
      }
    }
    return results
  }

  const bucketFor = (mode: PageMode): string =>
    mode === 'published' ? pagesDir : draftsDir

  /**
   * Shared engine for `uniqueHistoryPath` (pages) and
   * `uniqueGlobalHistoryPath` (globals): given an already-validated
   * `key` and the bucket directory it belongs in, build a unique
   * timestamped `.json` path inside `<baseDir>/<key>/`. Same filename
   * convention everywhere — ISO-8601 with `:` replaced by `-`, and a
   * `-N` tie-breaker for the rare same-millisecond collision.
   *
   * Caller must have already validated `key` (e.g. `assertValidSlug`).
   * The traversal guard runs inside via `resolveUnderBucket`.
   */
  const uniqueTimestampedPath = async (
    baseDir: string,
    key: string,
    errorLabel: string,
    at: Date = new Date(),
  ): Promise<string> => {
    const keyDir = resolveUnderBucket(baseDir, key, errorLabel)
    await fs.mkdir(keyDir, { recursive: true })

    // Filename format: replace `:` with `-` so the name is valid on all
    // target filesystems. Keep the rest of the ISO-8601 string intact.
    // `at` defaults to "now" for the common case; the seed-preservation
    // path in `publishDraft`/`publishGlobalDraft` passes an explicit
    // earlier Date so the pre-snapshot for an existing published file
    // sorts strictly before the new draft's snapshot.
    const base = at.toISOString().replace(/:/g, '-')
    let candidate = path.join(keyDir, `${base}.json`)
    let suffix = 0
    // `fs.access` returns ok when the file exists; on ENOENT we're done.
    while (true) {
      try {
        await fs.access(candidate, fsConstants.F_OK)
        suffix += 1
        candidate = path.join(keyDir, `${base}-${suffix}.json`)
      } catch (err) {
        if (isEnoent(err)) return candidate
        throw err
      }
    }
  }

  /**
   * Build a unique history filename for `slug` based on the current time.
   * The happy path is `<ts>.json`; the `-N` suffix only triggers when two
   * publishes land in the exact same millisecond, which we handle by
   * bumping the suffix until `access` reports the name is free.
   */
  const uniqueHistoryPath = async (slug: string, at?: Date): Promise<string> => {
    // `assertValidSlug` is re-checked here (not via `resolveSlugPath`)
    // because the final segment is not `<slug>.json` but a timestamp
    // file inside a slug-named directory.
    assertValidSlug(slug)
    return uniqueTimestampedPath(historyDir, slug, 'slug escapes history bucket', at)
  }

  const readPage = async (
    slug: string,
    mode: PageMode,
  ): Promise<Page | null> => {
    const filePath = resolveSlugPath(bucketFor(mode), slug, '.json')
    return readJsonOrNull<Page>(filePath)
  }

  const saveDraft = async (page: Page): Promise<void> => {
    const filePath = resolveSlugPath(draftsDir, page.slug, '.json')
    await writeAtomic(filePath, JSON.stringify(page, null, 2))
  }

  const listDrafts = async (): Promise<ReadonlyArray<DraftSummary>> => {
    const files = await listJsonFiles(draftsDir)
    const results: DraftSummary[] = []
    for (const relPath of files) {
      // Strip `.json` and use `/`-separated relative path as slug.
      const slug = relPath.slice(0, -'.json'.length)
      const stat = await fs.stat(path.join(draftsDir, relPath))
      results.push({ slug, updatedAt: stat.mtime })
    }
    // The interface explicitly says ordering is unspecified; don't sort.
    return results
  }

  const listPages = async (): Promise<ReadonlyArray<PublishedPageEntry>> => {
    const files = await listJsonFiles(pagesDir)
    const results: PublishedPageEntry[] = []
    for (const relPath of files) {
      // Strip `.json` and use `/`-separated relative path as slug.
      const slug = relPath.slice(0, -'.json'.length)
      const stat = await fs.stat(path.join(pagesDir, relPath))
      results.push({ slug, updatedAt: stat.mtime })
    }
    // The interface explicitly says ordering is unspecified; don't sort.
    return results
  }

  const listPageSummaries = async (): Promise<ReadonlyArray<PageSummaryEntry>> => {
    const files = await listJsonFiles(pagesDir)
    const results: PageSummaryEntry[] = []
    for (const relPath of files) {
      // Strip `.json` and use `/`-separated relative path as slug.
      const slug = relPath.slice(0, -'.json'.length)
      const filePath = path.join(pagesDir, relPath)
      // Sequential reads (matches `listGlobals`): if the file is removed
      // between `readdir` and here, skip rather than crash.
      const page = await readJsonOrNull<Page>(filePath)
      if (page === null) continue
      const stat = await fs.stat(filePath).catch(() => null)
      if (stat === null) continue
      // Build the summary by stripping `sections`. Spread `page` first so
      // every metadata field on disk (including ones added by future
      // ARCHITECTURE.md §4 widenings) flows through automatically. Then
      // overwrite `slug` with the on-disk filename so a hand-renamed file
      // can't desync from its addressable slug. Finally drop `sections`.
      const { sections: _sections, ...meta } = page
      void _sections
      results.push({ ...meta, slug, updatedAt: stat.mtime })
    }
    return results
  }

  /**
   * Shared engine for `readLatestHistorySnapshot` (pages) and
   * `readLatestGlobalHistorySnapshot` (globals): return the parsed
   * most-recent snapshot for `key` under `<baseDir>/<key>/`, or `null`
   * when the directory does not exist or contains no `.json` files.
   * "Most recent" uses lexicographic order on filenames — filenames are
   * ISO-8601-based so that matches chronological order.
   *
   * Generic over the snapshot type (`Page` for page history,
   * `Global` for globals history). Caller must have already validated
   * `key` (e.g. `assertValidSlug`).
   */
  const readLatestSnapshotIn = async <T>(
    baseDir: string,
    key: string,
    errorLabel: string,
  ): Promise<T | null> => {
    const keyDir = resolveUnderBucket(baseDir, key, errorLabel)

    let entries: Array<{ name: string; isFile: () => boolean }>
    try {
      entries = await fs.readdir(keyDir, { withFileTypes: true })
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    let latest: string | null = null
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.json')) continue
      if (latest === null || entry.name > latest) latest = entry.name
    }
    if (latest === null) return null

    return readJsonOrNull<T>(path.join(keyDir, latest))
  }

  /**
   * Return the parsed most-recent history snapshot for `slug`, or null if
   * there is no history directory or no snapshots. Used by `publishDraft`
   * to skip writing a new snapshot when the incoming page is semantically
   * identical to the last one (ARCHITECTURE.md §4: publishes without real
   * changes do not create new history entries).
   */
  const readLatestHistorySnapshot = async (slug: string): Promise<Page | null> => {
    assertValidSlug(slug)
    return readLatestSnapshotIn<Page>(historyDir, slug, 'slug escapes history bucket')
  }

  const publishDraft = async (slug: string): Promise<Page> => {
    const draftPath = resolveSlugPath(draftsDir, slug, '.json')
    const pagePath = resolveSlugPath(pagesDir, slug, '.json')

    const page = await readJsonOrNull<Page>(draftPath)
    if (page === null) {
      throw new Error(`no draft to publish for slug: ${JSON.stringify(slug)}`)
    }

    // Validate at the publish boundary. The agent's native file-edit
    // path can write JSON straight to `drafts/` without going through
    // the HTTP `parseSaveBody` gate, so a draft missing `seo.title`
    // could otherwise be promoted to `pages/`. The next `getContent`
    // read would then throw on the malformed published page — far from
    // the cause. Failing fast here turns "publish a broken draft" into
    // a clean adapter error that the handler surfaces as 500, leaving
    // `pages/` untouched. Defense in depth: the runtime layer also
    // validates before delegating here (see runtime/getContent.ts).
    assertValidPage(page)

    // Serialise once; reuse the same string for history and pages so a
    // future reader of the history snapshot sees the exact bytes that
    // were published, not a re-serialisation with potentially different
    // key order or whitespace.
    const serialised = JSON.stringify(page, null, 2)

    // De-dup guard: if the latest history snapshot is semantically equal
    // to what we are about to publish, skip writing a new history entry.
    // This prevents rollback-to-latest and "publish without edits" from
    // cluttering the history UI. We compare on the parsed JSON (reading
    // via readJsonOrNull) rather than on raw bytes, so whitespace or key
    // ordering differences that round-trip identically are still treated
    // as equal. See ARCHITECTURE.md §4.
    const latestSnapshot = await readLatestHistorySnapshot(slug)
    const skipHistory =
      latestSnapshot !== null && deepEqual(latestSnapshot, page)

    // Seed preservation: a page can exist on disk under `pages/<slug>.json`
    // with NO entries in `history/<slug>/` — most commonly when the
    // template ships a seed page committed straight to the content tree.
    // The first publish that follows that seed would otherwise overwrite
    // `pages/<slug>.json` with no record of the original content. To
    // avoid losing that "entry point", we snapshot the existing published
    // page into history BEFORE writing the new snapshot, with an
    // explicit timestamp strictly earlier than the new one so
    // `listHistory` (lex-descending) returns [new, seed].
    //
    // We only run this branch when there is genuinely no prior history
    // AND a published page exists. If the existing published page is
    // semantically equal to the incoming draft, the pre-snapshot is
    // skipped; the regular history write still fires and produces
    // exactly one entry (the seed/draft content, which are identical).
    // See the matching test case
    // `'seeded page → publish with identical content → exactly 1 history entry'`.
    let newSnapshotAt: Date = new Date()
    if (latestSnapshot === null) {
      const existingPublished = await readJsonOrNull<Page>(pagePath)
      if (existingPublished !== null && !deepEqual(existingPublished, page)) {
        // Compute both timestamps up-front: `new Date(now)` for the
        // pre-snapshot and `new Date(now + 1)` for the new draft. A
        // 1ms gap is enough to guarantee strict lexicographic ordering
        // on filenames (ISO-8601 with `:` → `-`), independent of how
        // the runtime clock happens to tick. Relying on a real
        // millisecond advance would be racy on fast machines.
        const now = Date.now()
        newSnapshotAt = new Date(now + 1)
        const seedSerialised = JSON.stringify(existingPublished, null, 2)
        const seedHistoryPath = await uniqueHistoryPath(slug, new Date(now))
        await writeAtomic(seedHistoryPath, seedSerialised)
      }
    }

    // Order of operations:
    //   1. (When applicable) write the seed pre-snapshot — see above.
    //   2. Write history snapshot for the incoming draft (unless deduped).
    //   3. Write published page (atomically).
    //   4. Delete the draft.
    // Rationale: if we crash between (2) and (3), a reader sees the old
    // published page AND a fresh history entry — odd, but not corrupt.
    // If we crash between (3) and (4), the published page is current but
    // a stale draft lingers; the next `saveDraft` or `publishDraft` will
    // clean it up. If we crash between (0) and (2), nothing changed.
    // Writing history first is the important invariant: an observer that
    // sees the new published page is guaranteed to ALSO see the matching
    // history entry. The de-dup case is safe w.r.t. this invariant because
    // the matching history entry already exists from a prior publish.
    // The seed-preservation case (1) is also safe: a partial state of
    // "seed snapshot exists, no new snapshot, old pages/<slug>.json
    // still live" matches the actual published bytes.
    if (!skipHistory) {
      const historyPath = await uniqueHistoryPath(slug, newSnapshotAt)
      await writeAtomic(historyPath, serialised)
    }
    await writeAtomic(pagePath, serialised)

    try {
      await fs.unlink(draftPath)
    } catch (err) {
      // ENOENT here means someone already removed the draft between our
      // read and unlink — harmless. Propagate anything else.
      if (!isEnoent(err)) throw err
    }

    return page
  }

  const deleteDraft: ContentStorageAdapter['deleteDraft'] = async (slug) => {
    const draftPath = resolveSlugPath(draftsDir, slug, '.json')
    // Match the publishDraft discipline: throw on "nothing to remove" so
    // the handler can surface a distinct error rather than silently 200.
    try {
      await fs.unlink(draftPath)
    } catch (err) {
      if (isEnoent(err)) {
        throw new Error(`no draft to discard for slug: ${JSON.stringify(slug)}`)
      }
      throw err
    }
  }

  const deletePage: ContentStorageAdapter['deletePage'] = async (slug) => {
    const publishedPath = resolveSlugPath(pagesDir, slug, '.json')

    // Verify the published page exists before deleting anything.
    try {
      await fs.access(publishedPath)
    } catch {
      throw new Error(`page not found: ${slug}`)
    }

    // Delete published page.
    await fs.unlink(publishedPath)

    // Delete draft if one exists (best-effort, ignore if missing).
    const draftPath = resolveSlugPath(draftsDir, slug, '.json')
    try {
      await fs.unlink(draftPath)
    } catch {
      // Draft may not exist — that is fine.
    }

    // History directory is intentionally preserved so version history
    // survives page deletion (ARCHITECTURE.md §4).
  }

  const unpublishPage: ContentStorageAdapter['unpublishPage'] = async (slug) => {
    const publishedPath = resolveSlugPath(pagesDir, slug, '.json')
    const draftPath = resolveSlugPath(draftsDir, slug, '.json')

    // Read the published page up-front. This both verifies existence
    // (if the file is missing we throw before mutating anything) and
    // gives us the bytes needed for the "no draft" conversion branch.
    const published = await readJsonOrNull<Page>(publishedPath)
    if (published === null) {
      throw new Error(`page not found: ${slug}`)
    }

    // Order of operations matters here.
    //
    //   Scenario A — published exists, no draft:
    //     1. Write the published page as a draft (atomic).
    //     2. Delete the published file.
    //   We write the draft BEFORE deleting the published file on purpose.
    //   If we crashed between (1) and (2) we would observe "published +
    //   draft", which is benign (publish is idempotent; the user can
    //   retry unpublish). If we reversed the order and crashed between
    //   the delete and the draft write, we would observe neither — the
    //   editable content would be lost. History always survives, so the
    //   user could still rollback, but avoiding the data-loss window is
    //   cheap and worth it.
    //
    //   Scenario B — published + draft: we skip step (1) entirely and
    //   just delete the published file. The existing draft is, by the
    //   publishDraft contract, strictly newer than the published page,
    //   so overwriting it with the published content would be a
    //   regression. Leaving the draft untouched is the correct choice.
    const existingDraft = await readJsonOrNull<Page>(draftPath)
    if (existingDraft === null) {
      await writeAtomic(draftPath, JSON.stringify(published, null, 2))
    }

    await fs.unlink(publishedPath)

    // History directory is intentionally preserved — this operation is
    // a "take it off the live site", not a full delete. The rollback
    // flow remains the way to restore the published version.
  }

  const listHistory = async (slug: string): Promise<ReadonlyArray<HistoryEntry>> => {
    assertValidSlug(slug)
    // Belt-and-suspenders traversal check (defence-in-depth alongside
    // `assertValidSlug`); see `resolveUnderBucket`.
    const slugDir = resolveUnderBucket(historyDir, slug, 'slug escapes history bucket')

    let entries: Array<{ name: string; isFile: () => boolean }>
    try {
      entries = await fs.readdir(slugDir, { withFileTypes: true })
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }

    const results: HistoryEntry[] = []
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.json')) continue
      const timestamp = entry.name.slice(0, -'.json'.length)
      const stat = await fs.stat(path.join(slugDir, entry.name))
      results.push({ slug, timestamp, size: stat.size })
    }

    // Newest first: filenames are ISO-8601-based, so lexicographic
    // descending order matches chronological descending.
    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return results
  }

  const readHistorySnapshot = async (
    slug: string,
    timestamp: string,
  ): Promise<Page | null> => {
    assertValidSlug(slug)
    // Traversal defence for the slug component.
    const slugDir = resolveUnderBucket(historyDir, slug, 'slug escapes history bucket')
    // Traversal defence for the timestamp component: the resolved file
    // must stay within the slug directory. This catches `../../etc/passwd`
    // style attacks in the timestamp parameter. The error label here
    // intentionally differs from the slug-level one ("timestamp escapes
    // history directory") to preserve the existing message contract.
    const filePath = resolveUnderBucket(
      slugDir,
      `${timestamp}.json`,
      'timestamp escapes history directory',
      timestamp,
    )
    return readJsonOrNull<Page>(filePath)
  }

  const renamePage = async (
    fromSlug: string,
    toSlug: string,
  ): Promise<void> => {
    assertValidSlug(fromSlug)
    assertValidSlug(toSlug)

    const fromPublished = resolveSlugPath(pagesDir, fromSlug, '.json')
    const toPublished = resolveSlugPath(pagesDir, toSlug, '.json')

    // Verify source exists.
    try {
      await fs.access(fromPublished)
    } catch {
      throw new Error(`page not found: ${fromSlug}`)
    }

    // Verify target does NOT exist.
    try {
      await fs.access(toPublished)
      throw new Error(`target slug already exists: ${toSlug}`)
    } catch (err) {
      // ENOENT means the target is free — that's what we want.
      if (isEnoent(err)) { /* good */ } else { throw err }
    }

    // Rename published page. fs.rename is atomic on same filesystem.
    await fs.rename(fromPublished, toPublished)

    // Rename draft if exists (ENOENT is fine — there may be no draft).
    const fromDraft = resolveSlugPath(draftsDir, fromSlug, '.json')
    const toDraft = resolveSlugPath(draftsDir, toSlug, '.json')
    try {
      await fs.rename(fromDraft, toDraft)
    } catch (err) {
      if (!isEnoent(err)) throw err
    }

    // Rename history directory if exists.
    const fromHistory = path.resolve(historyDir, fromSlug)
    const toHistory = path.resolve(historyDir, toSlug)
    try {
      await fs.rename(fromHistory, toHistory)
    } catch (err) {
      if (!isEnoent(err)) throw err
    }
  }

  // -- Globals ---------------------------------------------------------------

  // Bucket selector mirroring `bucketFor(mode)` for pages. Keeps the two
  // mode → directory mappings symmetric so a future maintainer reading
  // `readGlobal` sees the same shape as `readPage`.
  const globalBucketFor = (mode: PageMode): string =>
    mode === 'published' ? globalsDir : globalDraftsDir

  const readGlobal = async (
    name: string,
    mode: PageMode,
  ): Promise<Global | null> => {
    const filePath = resolveSlugPath(globalBucketFor(mode), name, '.json')
    return readJsonOrNull<Global>(filePath)
  }

  const saveGlobalDraft = async (global: Global): Promise<void> => {
    // Same write discipline as `saveDraft` for pages: only the draft file
    // is touched, no history snapshot. History is reserved for actual
    // publishes (ARCHITECTURE.md §4 — draft saves can be very chatty,
    // recording each keystroke would balloon history).
    const filePath = resolveSlugPath(globalDraftsDir, global.name, '.json')
    await writeAtomic(filePath, JSON.stringify(global, null, 2))
  }

  const listGlobalDrafts = async (): Promise<ReadonlyArray<GlobalDraftSummary>> => {
    // Globals are flat — no nesting needed, same as `listGlobals`.
    let entries: Array<{ name: string; isFile: () => boolean }>
    try {
      entries = await fs.readdir(globalDraftsDir, { withFileTypes: true })
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }
    const results: GlobalDraftSummary[] = []
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.json')) continue
      const filePath = path.join(globalDraftsDir, entry.name)
      // Trust the on-disk JSON's `name` field (matches `listGlobals`
      // discipline: a hand-renamed file on disk would otherwise produce
      // a name `readGlobal`/`deleteGlobalDraft` couldn't resolve).
      // Sequential reads: if the file is removed between readdir and
      // here, skip gracefully rather than crash on an unguarded stat.
      const json = await readJsonOrNull<Global>(filePath)
      if (json === null) continue
      const stat = await fs.stat(filePath).catch(() => null)
      if (stat === null) continue
      results.push({ name: json.name, updatedAt: stat.mtime })
    }
    return results
  }

  const publishGlobalDraft = async (name: string): Promise<Global> => {
    const draftPath = resolveSlugPath(globalDraftsDir, name, '.json')
    const livePath = resolveSlugPath(globalsDir, name, '.json')

    const global = await readJsonOrNull<Global>(draftPath)
    if (global === null) {
      throw new Error(`no global draft to publish for name: ${JSON.stringify(name)}`)
    }

    // Serialise once; reuse the same string for history and the live
    // file so a future reader of the history snapshot sees the exact
    // bytes that were published, not a re-serialisation. Mirrors
    // `publishDraft` for pages.
    const serialised = JSON.stringify(global, null, 2)

    // Same de-dup rule as pages and `saveGlobal` (ARCHITECTURE.md §4):
    // skip writing a history entry when the incoming content is
    // structurally equal to the latest snapshot.
    const latestSnapshot = await readLatestGlobalHistorySnapshot(name)
    const skipHistory =
      latestSnapshot !== null && deepEqual(latestSnapshot, global)

    // Seed preservation: a global can exist on disk under
    // `globals/<name>.json` with NO entries in `history-globals/<name>/`
    // — e.g. when the template ships a seed global committed straight to
    // the content tree. Without this branch the first publish would
    // overwrite the seed and lose the entry-point content. Symmetric to
    // the page-side fix above; see the long-form comment in
    // `publishDraft` for the timestamp-ordering rationale.
    let newSnapshotAt: Date = new Date()
    if (latestSnapshot === null) {
      const existingLive = await readJsonOrNull<Global>(livePath)
      if (existingLive !== null && !deepEqual(existingLive, global)) {
        const now = Date.now()
        newSnapshotAt = new Date(now + 1)
        const seedSerialised = JSON.stringify(existingLive, null, 2)
        const seedHistoryPath = await uniqueGlobalHistoryPath(name, new Date(now))
        await writeAtomic(seedHistoryPath, seedSerialised)
      }
    }

    // Order: (seed pre-snapshot if any) → new history snapshot (unless
    // deduped) → live file → draft removal. Same crash-safety reasoning
    // as `publishDraft` for pages — an observer that sees the new live
    // file is guaranteed to also see the matching history entry; a crash
    // between live-file write and draft unlink leaves a stale draft that
    // the next save/publish cleans up.
    if (!skipHistory) {
      const historyPath = await uniqueGlobalHistoryPath(name, newSnapshotAt)
      await writeAtomic(historyPath, serialised)
    }
    await writeAtomic(livePath, serialised)

    try {
      await fs.unlink(draftPath)
    } catch (err) {
      // ENOENT here means a concurrent caller already removed the
      // draft — harmless. Anything else bubbles up.
      if (!isEnoent(err)) throw err
    }

    return global
  }

  const deleteGlobalDraft: ContentStorageAdapter['deleteGlobalDraft'] = async (
    name,
  ) => {
    const draftPath = resolveSlugPath(globalDraftsDir, name, '.json')
    // Match the page-draft and `publishGlobalDraft` discipline: throw on
    // "nothing to remove" so the handler can surface a 404 rather than
    // silently 200. The error-message substring is matched by the
    // handler (`global-draft/discard`) to map ENOENT → 404.
    try {
      await fs.unlink(draftPath)
    } catch (err) {
      if (isEnoent(err)) {
        throw new Error(`no global draft to discard for name: ${JSON.stringify(name)}`)
      }
      throw err
    }
  }

  /**
   * Globals-history analogue of `uniqueHistoryPath`. Builds the absolute
   * path for a new snapshot file under `history-globals/<name>/`, with
   * the same ISO-timestamp filename convention and the same `-N` tie
   * breaker for same-millisecond collisions.
   */
  const uniqueGlobalHistoryPath = async (name: string, at?: Date): Promise<string> => {
    assertValidSlug(name)
    return uniqueTimestampedPath(
      globalsHistoryDir,
      name,
      'name escapes globals history bucket',
      at,
    )
  }

  /**
   * Globals-history analogue of `readLatestHistorySnapshot`. Returns the
   * most recent snapshot for `name`, or null if no history directory or
   * no snapshots exist. Used by `saveGlobal` to skip writing a history
   * entry when the incoming global is structurally identical to the
   * last snapshot (same de-dup rule as pages; see ARCHITECTURE.md §4).
   */
  const readLatestGlobalHistorySnapshot = async (
    name: string,
  ): Promise<Global | null> => {
    assertValidSlug(name)
    return readLatestSnapshotIn<Global>(
      globalsHistoryDir,
      name,
      'name escapes globals history bucket',
    )
  }

  const saveGlobal = async (global: Global): Promise<void> => {
    const filePath = resolveSlugPath(globalsDir, global.name, '.json')

    // Serialise once so the history snapshot and the live file carry the
    // exact same bytes (no re-serialisation drift). Mirrors `publishDraft`.
    const serialised = JSON.stringify(global, null, 2)

    // Same de-dup rule as pages (ARCHITECTURE.md §4): a save whose content
    // is structurally equal to the last history snapshot does not produce
    // a new history entry. Reuses the shared `deepEqual` helper.
    const latestSnapshot = await readLatestGlobalHistorySnapshot(global.name)
    const skipHistory =
      latestSnapshot !== null && deepEqual(latestSnapshot, global)

    // Write history first, live file second — same crash-safety ordering
    // as `publishDraft`: an observer that sees the new live file is
    // guaranteed to see the matching history entry.
    if (!skipHistory) {
      const historyPath = await uniqueGlobalHistoryPath(global.name)
      await writeAtomic(historyPath, serialised)
    }
    await writeAtomic(filePath, serialised)

    // Best-effort cleanup of any sibling draft. A direct save (MCP /
    // programmatic caller) makes any pending user draft stale by
    // definition: the live file now holds newer content than the draft
    // was based on. Leaving the draft would surface a stale "draft on
    // top of fresh publish" view on the user's next preview load (the
    // composed `hasDraft` flag would still be true and `?mode=draft`
    // would resolve to the obsolete file). Same discipline as `deleteGlobal`.
    const draftPath = resolveSlugPath(globalDraftsDir, global.name, '.json')
    try {
      await fs.unlink(draftPath)
    } catch (err) {
      // ENOENT means no draft existed — benign. Any other error
      // (permission denied, EBUSY, EROFS) must surface so the caller can
      // fix the underlying issue rather than silently leaving a stale
      // draft on top of the freshly published live file.
      if (!isEnoent(err)) throw err
    }
  }

  const listGlobals = async (): Promise<ReadonlyArray<GlobalSummary>> => {
    // Globals are flat — no nesting needed.
    let entries: Array<{ name: string; isFile: () => boolean }>
    try {
      entries = await fs.readdir(globalsDir, { withFileTypes: true })
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }
    const results: GlobalSummary[] = []
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.json')) continue
      const filePath = path.join(globalsDir, entry.name)
      // Sequential reads: if the file is deleted between `readdir` and here,
      // `readJsonOrNull` returns null and we skip gracefully instead of
      // crashing on an unguarded `fs.stat` ENOENT.
      const json = await readJsonOrNull<Global>(filePath)
      if (json === null) continue
      const stat = await fs.stat(filePath).catch(() => null)
      if (stat === null) continue
      // Use json.name (source of truth from saveGlobal) rather than
      // deriving from the filename, so a hand-renamed file on disk
      // doesn't produce a name that readGlobal/deleteGlobal can't resolve.
      results.push({ name: json.name, type: json.type, updatedAt: stat.mtime })
    }
    return results
  }

  const deleteGlobal = async (name: string): Promise<void> => {
    const filePath = resolveSlugPath(globalsDir, name, '.json')
    // Skip the fs.access pre-check to avoid a TOCTOU race: if a concurrent
    // delete runs between access and unlink, the raw ENOENT from unlink
    // would not contain "global not found", causing the handler to map it
    // to 500 instead of 404. Instead, attempt the unlink directly and
    // translate ENOENT into the expected domain error.
    try {
      await fs.unlink(filePath)
    } catch (err) {
      if (isEnoent(err)) {
        throw new Error(`global not found: ${name}`)
      }
      throw err
    }

    // Best-effort cleanup of any sibling draft. Mirrors `deletePage` for
    // pages: deleting the live record without also removing the draft
    // would leave an orphan that the next `listGlobalDrafts` surfaces
    // even though there is no longer a published global to fall back to.
    const draftPath = resolveSlugPath(globalDraftsDir, name, '.json')
    try {
      await fs.unlink(draftPath)
    } catch (err) {
      // ENOENT means no draft existed — benign. Any other error
      // (permission denied, EBUSY, EROFS) must surface so the caller can
      // fix the underlying issue rather than silently leaving a stale
      // orphan draft pointing at a now-deleted global.
      if (!isEnoent(err)) throw err
    }

    // History directory is intentionally preserved — same discipline as
    // `deletePage`: version history survives the live-file removal.
  }

  const listGlobalHistory = async (
    name: string,
  ): Promise<ReadonlyArray<GlobalHistoryEntry>> => {
    assertValidSlug(name)
    const nameDir = resolveUnderBucket(
      globalsHistoryDir,
      name,
      'name escapes globals history bucket',
    )

    let entries: Array<{ name: string; isFile: () => boolean }>
    try {
      entries = await fs.readdir(nameDir, { withFileTypes: true })
    } catch (err) {
      if (isEnoent(err)) return []
      throw err
    }

    const results: GlobalHistoryEntry[] = []
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.json')) continue
      const timestamp = entry.name.slice(0, -'.json'.length)
      const stat = await fs.stat(path.join(nameDir, entry.name))
      results.push({ name, timestamp, size: stat.size })
    }

    // Newest first — same lexicographic/chronological alignment as pages.
    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return results
  }

  const readGlobalHistorySnapshot = async (
    name: string,
    timestamp: string,
  ): Promise<Global | null> => {
    assertValidSlug(name)
    const nameDir = resolveUnderBucket(
      globalsHistoryDir,
      name,
      'name escapes globals history bucket',
    )
    // Traversal defence for the timestamp component.
    const filePath = resolveUnderBucket(
      nameDir,
      `${timestamp}.json`,
      'timestamp escapes history directory',
      timestamp,
    )
    return readJsonOrNull<Global>(filePath)
  }

  const rollbackGlobal = async (name: string, timestamp: string): Promise<void> => {
    const snapshot = await readGlobalHistorySnapshot(name, timestamp)
    if (snapshot === null) {
      throw new Error(`global history snapshot not found: ${name} @ ${timestamp}`)
    }
    // Re-save through `saveGlobal` so dedupe logic applies: a rollback to
    // content that matches the latest snapshot is a no-op in history,
    // whereas a rollback to something older writes a new history entry.
    // Same cascade as page rollback via `publishDraft`.
    await saveGlobal(snapshot)
  }

  return {
    readPage,
    saveDraft,
    listDrafts,
    listPages,
    listPageSummaries,
    publishDraft,
    deleteDraft,
    deletePage,
    unpublishPage,
    listHistory,
    readHistorySnapshot,
    renamePage,
    readGlobal,
    saveGlobal,
    saveGlobalDraft,
    listGlobalDrafts,
    publishGlobalDraft,
    deleteGlobalDraft,
    listGlobals,
    deleteGlobal,
    listGlobalHistory,
    readGlobalHistorySnapshot,
    rollbackGlobal,
  }
}
