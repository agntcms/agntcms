// `ContentStorageAdapter` — interface the runtime needs to read published
// pages, manage drafts, publish them with full-snapshot versioning
// (ARCHITECTURE.md §4 and §5), browse version history, and rename pages.
//
// Evolution note (v0.3):
//   `listHistory`, `readHistorySnapshot`, and `renamePage` were added in
//   v0.3 to support the history browser, rollback, and slug rename
//   features (F6.2, F6.3, F6.4). They were originally deferred under
//   YAGNI — the additive direction predicted in the original comment
//   worked out exactly as planned.
//
// `readPage(slug, mode)` semantics — the "dual nature of getContent" seam:
//
//   `mode` selects which on-disk file family to read:
//     'published' → the page in content/pages/<slug>.json
//     'draft'     → the draft in content/drafts/<slug>.json
//
//   The adapter returns `null` when the requested mode's file does not
//   exist. It does NOT silently fall back to the other mode. The runtime
//   (T-008, getContent) is responsible for composition: in preview mode it
//   may try 'draft' first and fall back to 'published'; in prod mode it
//   reads 'published' directly. Keeping the fallback out of the adapter
//   preserves a clean contract and keeps each method's behaviour obvious.
//
// `publishDraft` returns the `Page` that was published so the runtime
// (T-009) can feed it into the default-commit git helper without a second
// round-trip to the adapter. A `void` return would force the caller to
// `readPage` immediately after, which is extra IO for no benefit.
//
// Import policy: this file imports ONLY from `../domain/`. It MUST NOT
// import from `runtime/`, `react/`, `handlers/`, `mcp/`, `tasks/`,
// `sections/`, or `config/`. It also MUST NOT import node:* types —
// interfaces stay environment-neutral so both FS and remote adapters can
// implement them.

import type { Global } from '../domain/index'
import type { Page, PageSummary } from '../domain/index'

/** A page's publication mode. Used to select which storage bucket `readPage` reads from. */
export type PageMode = 'published' | 'draft'

/**
 * Lightweight summary of a history snapshot, returned by `listHistory`.
 *
 * `timestamp` is the filename stem (e.g. "2026-04-12T16-00-00.000Z"),
 * not a parsed Date, because it is also used as the key for
 * `readHistorySnapshot`. Keeping it as a string avoids lossy Date
 * round-trips and keeps the API surface small.
 */
export interface HistoryEntry {
  readonly slug: string
  /** The filename stem, e.g. "2026-04-12T16-00-00.000Z". */
  readonly timestamp: string
  /** File size in bytes. */
  readonly size: number
}

/**
 * Lightweight summary of a draft page, returned by `listDrafts`.
 *
 * Kept intentionally small: the UI that lists drafts only needs "which
 * pages have pending edits, and when were they last touched". Anything
 * beyond this (author, diff stats, etc.) is out of scope for v1.
 */
export interface DraftSummary {
  readonly slug: string
  readonly updatedAt: Date
}

/**
 * Lightweight list-entry for a published page, returned by `listPages`.
 *
 * BREAKING (v0.1.x → v0.1.y): renamed from `PageSummary` to
 * `PublishedPageEntry` so the canonical `PageSummary` name can be claimed
 * by the domain-layer metadata projection (`Omit<Page, 'sections'>`)
 * exposed for blog-index-style listings (ARCHITECTURE.md §4). Templates
 * that imported `PageSummary` from `@agntcms/next/server` to type the
 * existing `listPages()` adapter return must rename their import — the
 * shape (slug + updatedAt) is unchanged.
 *
 * Same shape as `DraftSummary` — kept as a separate type because the
 * two collections have different semantic meaning and may diverge.
 */
export interface PublishedPageEntry {
  readonly slug: string
  readonly updatedAt: Date
}

/**
 * Page-metadata-with-mtime tuple, returned by `listPageSummaries`.
 *
 * The adapter widens domain `PageSummary` (Omit<Page, 'sections'>) with
 * an `updatedAt: Date` carrying the storage layer's "last modified"
 * timestamp. The runtime uses this as the sort key when a page has no
 * explicit `publishedAt` (ARCHITECTURE.md §4: mtime fallback). Adapters
 * that don't track mtime (e.g. a remote API) MAY return the unix epoch
 * to mean "unknown" — sorting will then put such pages at the end of a
 * `'newest'` query and at the start of an `'oldest'` query, but never
 * crash.
 */
export interface PageSummaryEntry extends PageSummary {
  readonly updatedAt: Date
}

/**
 * Lightweight summary of a global content block, returned by `listGlobals`.
 */
export interface GlobalSummary {
  readonly name: string
  readonly type: string
  readonly updatedAt: Date
}

/**
 * Lightweight summary of a global draft, returned by `listGlobalDrafts`.
 *
 * Mirrors `DraftSummary` for pages but keyed by global `name` instead of
 * `slug`. The UI that lists pending global drafts only needs "which
 * globals have pending edits, and when were they last touched" — keep
 * the shape minimal for the same reason as DraftSummary.
 */
export interface GlobalDraftSummary {
  readonly name: string
  readonly updatedAt: Date
}

/**
 * Lightweight summary of a global history snapshot, returned by
 * `listGlobalHistory`. Mirrors `HistoryEntry` for pages but keyed by
 * global `name` instead of `slug`; the shape is kept symmetric so UI
 * code that handles history listings can stay shape-agnostic.
 */
export interface GlobalHistoryEntry {
  readonly name: string
  /** The filename stem, e.g. "2026-04-12T16-00-00.000Z". */
  readonly timestamp: string
  /** File size in bytes. */
  readonly size: number
}

/**
 * Content storage adapter — the seam between the runtime and whatever
 * persists pages and drafts. See the file header for the rationale
 * behind this exact method set.
 *
 * All methods are async because a real implementation (FS, remote) is
 * always IO-bound. Implementations MUST NOT throw for "not found"; they
 * MUST return `null` from `readPage`.
 */
export interface ContentStorageAdapter {
  /**
   * Read a page in the requested publication mode.
   *
   * Returns `null` when no file exists for `(slug, mode)`. Does NOT fall
   * back across modes; composition is the runtime's responsibility.
   */
  readPage(slug: string, mode: PageMode): Promise<Page | null>

  /**
   * Persist a draft of `page`. Overwrites any existing draft for the
   * same slug. The draft storage bucket is distinct from the published
   * bucket — `saveDraft` MUST NOT touch the published page.
   */
  saveDraft(page: Page): Promise<void>

  /**
   * List all drafts currently on disk. Ordering is not specified by the
   * contract; callers that need a particular order sort the result
   * themselves.
   */
  listDrafts(): Promise<ReadonlyArray<DraftSummary>>

  /**
   * List all published pages with minimal info (slug + mtime). Used by
   * the admin pages list. Ordering is not specified by the contract;
   * callers that need a particular order sort the result themselves.
   */
  listPages(): Promise<ReadonlyArray<PublishedPageEntry>>

  /**
   * List published pages with metadata (slug + seo + tags + excerpt +
   * coverImage + publishedAt + mtime). Used by the runtime's `listPages`
   * (ARCHITECTURE.md §4) for blog-index-style queries.
   *
   * Distinct from the lighter `listPages()` because reading every page
   * just to drop sections is wasteful for large sites; a dedicated
   * summary read lets implementations parse only the metadata block.
   * The default FS adapter still parses the whole file (small saving),
   * but a remote adapter could expose a real summary endpoint.
   *
   * Ordering is not specified — the runtime sorts after the read.
   */
  listPageSummaries(): Promise<ReadonlyArray<PageSummaryEntry>>

  /**
   * Promote the draft for `slug` to published, and write a new full
   * snapshot into history (ARCHITECTURE.md §4: versioning is full
   * snapshots, not patches). Returns the `Page` that was published so
   * the runtime can thread it into its git-commit helper without an
   * extra round-trip.
   *
   * Implementations MUST reject (throw) when no draft exists for the
   * given slug — publishing nothing is meaningless and silent no-ops
   * hide bugs in the edit flow.
   */
  publishDraft(slug: string): Promise<Page>

  /**
   * Delete ONLY the draft for `slug`. Used by the "discard draft" flow.
   *
   * The published page and history are untouched — this operation is
   * reversible in the sense that the live page remains, and the user can
   * always reconstruct the discarded draft by editing again. Throws if no
   * draft exists for the given slug (silent success would mask a caller
   * bug, same discipline as `publishDraft`).
   */
  deleteDraft(slug: string): Promise<void>

  /** Delete a published page. Also removes its draft if one exists. History is preserved. */
  readonly deletePage: (slug: string) => Promise<void>

  /**
   * Unpublish a page: remove it from the live site while preserving
   * editable content and version history. Behaviour depends on the
   * current state of `slug`:
   *
   *   - No published page exists → throws. There is nothing to unpublish,
   *     and silently succeeding would mask a caller bug.
   *   - Published exists, no draft → the published page is converted
   *     into a draft (so the editor still has something to work with),
   *     and the published file is removed. Net: live URL 404s, draft
   *     retained with the last-published content.
   *   - Published exists, draft exists → only the published file is
   *     removed. The draft is already the newer version (publishDraft
   *     deletes the draft on publish, so any coexisting draft is by
   *     definition post-publish) and is left untouched.
   *
   * History is NEVER touched by this method — the last publish already
   * wrote a snapshot, and restore-from-history remains the recovery
   * path if the user changes their mind.
   */
  unpublishPage(slug: string): Promise<void>

  /** List history snapshots for a page, newest first. Returns [] if no history exists. */
  listHistory(slug: string): Promise<ReadonlyArray<HistoryEntry>>

  /** Read a specific history snapshot by slug and timestamp. Returns null if not found. */
  readHistorySnapshot(slug: string, timestamp: string): Promise<Page | null>

  /**
   * Atomically rename a page slug. Renames the published page, draft
   * (if any), and history directory (if any). Throws if the source
   * slug does not exist or the target slug already exists.
   */
  renamePage(fromSlug: string, toSlug: string): Promise<void>

  // -- Globals ---------------------------------------------------------------
  //
  // Globals support a full draft → publish → discard lifecycle, mirroring
  // pages (see the `readPage(slug, mode)` section above). `readGlobal`
  // takes the same `PageMode` parameter pages use: 'published' reads
  // `content/globals/<name>.json`, 'draft' reads
  // `content/global-drafts/<name>.json`. The adapter NEVER falls back
  // across modes — composition is the runtime's job (getGlobal), same
  // discipline as pages.

  /**
   * Read a global in the requested publication mode.
   *
   * Returns `null` when no file exists for `(name, mode)`. Does NOT fall
   * back across modes; the runtime composes preview→draft→published.
   */
  readGlobal(name: string, mode: PageMode): Promise<Global | null>

  /**
   * Save (create or overwrite) the LIVE published global, plus its history
   * snapshot. Used by direct-save flows (e.g. the agent's MCP-style edits)
   * that bypass the draft cycle.
   *
   * Implementations MUST write a full-snapshot history entry on every
   * save (same "full snapshot" rule as pages, ARCHITECTURE.md §4), with
   * the same semantic de-dup: a save whose content deep-equals the most
   * recent history snapshot does NOT create a new history entry.
   *
   * Editor-driven saves should go through `saveGlobalDraft` +
   * `publishGlobalDraft` instead so the user can review changes before
   * promoting them.
   */
  saveGlobal(global: Global): Promise<void>

  /**
   * Persist a draft of `global`. Overwrites any existing draft for the
   * same name. The draft bucket is distinct from the published bucket —
   * `saveGlobalDraft` MUST NOT touch the published global. It also MUST
   * NOT write a history snapshot: history is reserved for actual
   * publishes (ARCHITECTURE.md §4), same discipline as `saveDraft` for
   * pages.
   */
  saveGlobalDraft(global: Global): Promise<void>

  /**
   * List all global drafts currently on disk. Ordering is not specified
   * by the contract; callers that need a particular order sort the
   * result themselves. Mirrors `listDrafts` for pages.
   */
  listGlobalDrafts(): Promise<ReadonlyArray<GlobalDraftSummary>>

  /**
   * Promote the draft for `name` to published, and write a new full
   * snapshot into history (ARCHITECTURE.md §4: versioning is full
   * snapshots, not patches). Returns the `Global` that was published so
   * a caller can thread it forward without an extra read.
   *
   * Implementations MUST reject (throw) when no draft exists for the
   * given name — publishing nothing is meaningless and silent no-ops
   * hide bugs in the edit flow. Same discipline as `publishDraft` for
   * pages.
   */
  publishGlobalDraft(name: string): Promise<Global>

  /**
   * Delete ONLY the draft for `name`. Used by the "discard draft" flow.
   *
   * The published global and history are untouched — this operation is
   * reversible in the sense that the live global remains. Throws if no
   * draft exists for `name` (silent success would mask a caller bug,
   * same discipline as `deleteDraft` for pages).
   */
  deleteGlobalDraft(name: string): Promise<void>

  /** List all globals. Ordering is not specified by the contract. */
  listGlobals(): Promise<ReadonlyArray<GlobalSummary>>

  /** Delete a global by name. Throws if not found. */
  deleteGlobal(name: string): Promise<void>

  /**
   * List history snapshots for a global, newest first. Returns [] if
   * no history exists for `name`. Mirrors `listHistory` for pages.
   */
  listGlobalHistory(name: string): Promise<ReadonlyArray<GlobalHistoryEntry>>

  /**
   * Read a specific history snapshot by global name and timestamp.
   * Returns null if not found. Mirrors `readHistorySnapshot` for pages.
   */
  readGlobalHistorySnapshot(name: string, timestamp: string): Promise<Global | null>

  /**
   * Roll a global back to a specific history snapshot. Reads the
   * snapshot and re-saves it via `saveGlobal`, which will decide
   * whether a new history entry is written based on de-dup.
   *
   * Throws if the snapshot does not exist — there is nothing to roll
   * back to in that case, and silent success would mask caller bugs
   * (same discipline as `publishDraft` for pages).
   */
  rollbackGlobal(name: string, timestamp: string): Promise<void>
}
