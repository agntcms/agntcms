'use client'

// -----------------------------------------------------------------------
// AdminModal -- single tabbed modal combining Pages and Globals management.
// Opened from PreviewToolbar via the "M" button. Tabs switch between
// Pages (list, create, rename, delete) and Globals (list, create, delete).
//
// IMPORT CONSTRAINTS (invariants 1 + 2):
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only `react` and the shared Modal.
// -----------------------------------------------------------------------

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactElement,
  type CSSProperties,
} from 'react'

import { Modal } from '../shared/Modal'
import { SectionRenderer } from '../SectionRenderer'
import type { SectionRendererProps } from '../SectionRenderer'
import { SaveProvider } from '../editable/SaveContext'
import type { SaveFieldFn } from '../editable/SaveContext'
import type { PreviewFieldOriginLike } from '../editable/isPreviewField'
import type { DefinitionLike } from '../section-replace/SectionPickerModal'
import { diffSections, type SectionsDiff } from './diffSections'
import {
  sectionDiffStatus,
  type SectionStatus,
  type RemovedSection,
} from './sectionDiffStatus'
import { findCurrentHistoryEntryIndex } from './currentHistoryEntry'
import { fieldDiff, type FieldDiffEntry } from './fieldDiff'
import type { WordDiffOp } from './wordDiff'
import type {
  Global,
  ImageValue,
  Page,
  Section,
  SectionSchema,
} from '../../domain/index'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminModalProps {
  readonly open: boolean
  readonly onClose: () => void
  /**
   * Optional registered section definitions. When provided and a global's
   * `type` matches a definition, the Edit-global modal renders the real
   * section component with inline `EditableText` / `EditableImage`
   * affordances — same experience as editing a page section. When absent
   * (or no matching definition), it falls back to a generic field form.
   */
  readonly definitions?: readonly DefinitionLike[]
}

type ActiveTab = 'pages' | 'globals'

/** Shape returned by GET /api/agntcms/page/list */
interface PageEntry {
  readonly slug: string
  readonly hasPublished: boolean
  readonly hasDraft: boolean
  readonly updatedAt: string
}

/** Shape returned by GET /api/agntcms/global/list */
interface GlobalEntry {
  readonly name: string
  readonly type: string
  readonly updatedAt: string
  /**
   * Server-resolved framework-managed flag (mirrors `SectionDefinition.system`).
   * When `true` the row renders in a separate "Settings" group below user
   * globals and the delete affordance is hidden — Edit and History remain.
   * Optional for forward compatibility with older handlers that don't set
   * the field; treated as `false` when absent.
   */
  readonly system?: boolean
  /**
   * Whether a pending draft exists for this global. Composed client-side
   * from a parallel `/api/agntcms/global-draft/list` fetch — the server
   * `global/list` endpoint stays unchanged so older templates don't see
   * a wire-shape break. When `true`, the row renders a Draft badge plus
   * Publish/Discard actions. Optional + defaulted to `false` so a row
   * that was loaded before the draft fetch completed still renders.
   */
  readonly hasDraft?: boolean
  /**
   * Whether a published live version exists. Mirror of `hasPublished` on
   * `PageEntry`. Composed client-side: any name returned by `global/list`
   * is by definition published. A name that appears ONLY in the
   * `global-draft/list` response (draft-only — a never-published global)
   * has `hasPublished: false`.
   */
  readonly hasPublished?: boolean
}

/**
 * A row in the rendered Globals table. Either a real global entry or a
 * section-header row injected between the user-globals slice and the
 * system-globals "Settings" slice.
 */
type GlobalRow =
  | { readonly kind: 'global'; readonly entry: GlobalEntry }
  | { readonly kind: 'header'; readonly label: string }

/**
 * True when a globals-table row should expose the Delete (×) affordance.
 * Every entry is deletable from the admin UI — system-flagged records
 * are deletable too. The `system: true` flag drives only the "Settings"
 * group rendering; the server-side handler no longer rejects delete on
 * system type. The helper is kept (rather than inlined) so the rendering
 * logic can be unit-tested without mounting the modal and so future
 * per-row policy can land in one place.
 *
 * @internal Exported for unit tests only. Not re-exported through any barrel.
 */
export function isGlobalDeletable(_g: { readonly system?: boolean }): boolean {
  return true
}

/**
 * True when the Delete (×) affordance should actually render for a row.
 * Composed from `isGlobalDeletable` (per-row policy) AND a presence check:
 * delete only makes sense when there's a live published copy to remove.
 *
 * Draft-only rows (`hasPublished: false`, `hasDraft: true`) are typically
 * fresh creations in preview that have never been published — for those,
 * clicking Delete would POST to `/global/delete`, the adapter would throw
 * ENOENT on the missing live file, and the UI would surface a generic
 * "Failed to delete" error. The user's correct recovery is Discard, which
 * is already rendered right next to it. Hiding Delete here removes the
 * misleading affordance entirely.
 *
 * Backward compat: an absent `hasPublished` flag (older list responses
 * before v0.2 composed it client-side) is treated as `true`, so older
 * callers keep the Delete affordance they had.
 *
 * @internal Exported for unit tests only. Not re-exported through any barrel.
 */
export function isGlobalDeleteVisible(g: {
  readonly system?: boolean
  readonly hasPublished?: boolean
}): boolean {
  if (!isGlobalDeletable(g)) return false
  return g.hasPublished !== false
}

/**
 * Drop system-flagged section types from the autocomplete list shown in the
 * "create global" form. This is a UX hint only — the server no longer
 * rejects creation by system type, so a user who types a system-typed name
 * manually can still create one. We omit them from the datalist because
 * surfacing them in autocomplete makes accidental creation of a
 * framework-managed global far too easy: a single Tab on the suggestion is
 * all it takes. Pure helper so the partitioning behaviour can be
 * unit-tested without mounting the modal.
 *
 * @internal Exported for unit tests only. Not re-exported through any barrel.
 */
export function filterCreatableSectionTypes(
  types: readonly string[],
  systemTypes: readonly string[],
): readonly string[] {
  if (systemTypes.length === 0) return types
  const blocked = new Set(systemTypes)
  return types.filter((t) => !blocked.has(t))
}

/**
 * Split a flat globals list into user entries (default) and system entries
 * (framework-managed configuration, `system: true`). User entries come
 * first in the rendered table; the "Settings" group renders below.
 *
 * @internal Exported for unit tests only. Not re-exported through any barrel.
 */
export function partitionGlobalsBySystem(
  globals: readonly GlobalEntry[],
): { readonly user: readonly GlobalEntry[]; readonly system: readonly GlobalEntry[] } {
  const user: GlobalEntry[] = []
  const system: GlobalEntry[] = []
  for (const g of globals) {
    if (g.system === true) {
      system.push(g)
    } else {
      user.push(g)
    }
  }
  return { user, system }
}

/** Segments separated by `/`, each segment: letters, digits, hyphens, underscores. */
const SLUG_PATTERN = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/

/** Single segment: letters, digits, hyphens, underscores. */
const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/

// ---------------------------------------------------------------------------
// Folder navigation types and derivation
// ---------------------------------------------------------------------------

interface FolderItem {
  readonly kind: 'folder'
  readonly name: string
  readonly path: string
  readonly count: number
}

interface PageItem {
  readonly kind: 'page'
  readonly entry: PageEntry
}

type ListItem = FolderItem | PageItem

/**
 * Derives the visible items (folders and pages) at a given path level from a
 * flat page list. Folders are implicit: they exist whenever a slug contains a
 * `/` separator that creates a deeper level beyond the current path.
 */
/** @internal Exported for unit tests only. Not re-exported through any barrel. */
export function deriveFolderContents(
  pages: readonly PageEntry[],
  currentPath: string,
): readonly ListItem[] {
  const prefix = currentPath ? `${currentPath}/` : ''
  const folders = new Map<string, number>()
  const pagesAtLevel: PageItem[] = []

  for (const page of pages) {
    // Only consider pages that live under (or at) the current path.
    if (currentPath && !page.slug.startsWith(prefix)) continue
    if (!currentPath && page.slug === '') continue

    const remaining = currentPath ? page.slug.slice(prefix.length) : page.slug
    const slashIndex = remaining.indexOf('/')

    if (slashIndex === -1) {
      // Page lives directly at this level.
      pagesAtLevel.push({ kind: 'page', entry: page })
    } else {
      // Page is nested deeper — the first segment is a folder.
      const folderName = remaining.slice(0, slashIndex)
      folders.set(folderName, (folders.get(folderName) ?? 0) + 1)
    }
  }

  const folderItems: FolderItem[] = Array.from(folders.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({
      kind: 'folder' as const,
      name,
      path: currentPath ? `${currentPath}/${name}` : name,
      count,
    }))

  pagesAtLevel.sort((a, b) => a.entry.slug.localeCompare(b.entry.slug))

  return [...folderItems, ...pagesAtLevel]
}

/**
 * Returns the display name of a page at the current folder level — just the
 * last segment after the current path prefix.
 */
/** @internal Exported for unit tests only. Not re-exported through any barrel. */
export function localName(slug: string, currentPath: string): string {
  if (!currentPath) return slug
  const prefix = `${currentPath}/`
  return slug.startsWith(prefix) ? slug.slice(prefix.length) : slug
}

/**
 * Formats an ISO date string into a compact display format.
 * Same-year dates show "Apr 15", cross-year dates show "Apr 15, 2025".
 */
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const month = d.toLocaleString('en-US', { month: 'short' })
  const day = d.getDate()
  return sameYear ? `${month} ${day}` : `${month} ${day}, ${d.getFullYear()}`
}

// ---------------------------------------------------------------------------
// Column sorting
// ---------------------------------------------------------------------------

type SortDirection = 'asc' | 'desc'
type PagesSortColumn = 'name' | 'status' | 'updated'
type GlobalsSortColumn = 'name' | 'type' | 'updated'

interface PagesSortState {
  readonly column: PagesSortColumn
  readonly direction: SortDirection
}

interface GlobalsSortState {
  readonly column: GlobalsSortColumn
  readonly direction: SortDirection
}

const PAGES_SORT_KEY = 'agntcms:admin:sort:pages'
const GLOBALS_SORT_KEY = 'agntcms:admin:sort:globals'

const DEFAULT_PAGES_SORT: PagesSortState = { column: 'name', direction: 'asc' }
const DEFAULT_GLOBALS_SORT: GlobalsSortState = { column: 'name', direction: 'asc' }

// why: status rank defines a deterministic ordering for the two-boolean
// (hasDraft, hasPublished) combination. neither(0) < draft-only(1) <
// published-only(2) < both(3), so ascending moves from "least ready" to
// "most ready" which matches the reader's intuition.
function statusRank(p: PageEntry): number {
  if (p.hasDraft && p.hasPublished) return 3
  if (p.hasPublished) return 2
  if (p.hasDraft) return 1
  return 0
}

// Same rank function for globals — kept separate from `statusRank(PageEntry)`
// because the two entry shapes don't share a base type. The lattice is
// identical to pages: a global may be draft-only (created fresh in
// preview, never published), published-only (the common case before
// v0.2), or have both. Used as a stable tiebreaker inside `sortGlobals`.
function globalStatusRank(g: GlobalEntry): number {
  const hasDraft = g.hasDraft === true
  const hasPublished = g.hasPublished === true
  if (hasDraft && hasPublished) return 3
  if (hasPublished) return 2
  if (hasDraft) return 1
  return 0
}

/** @internal Exported for unit tests only. Not re-exported through any barrel. */
export function sortPages(
  pages: readonly PageEntry[],
  sort: PagesSortState,
  currentPath: string,
): readonly PageEntry[] {
  const sign = sort.direction === 'asc' ? 1 : -1
  const copy = pages.slice()
  copy.sort((a, b) => {
    let cmp = 0
    switch (sort.column) {
      case 'name':
        cmp = localName(a.slug, currentPath).localeCompare(
          localName(b.slug, currentPath),
        )
        break
      case 'status':
        cmp = statusRank(a) - statusRank(b)
        break
      case 'updated':
        cmp = (a.updatedAt || '').localeCompare(b.updatedAt || '')
        break
    }
    // why: stable tiebreaker on slug so equal-rank rows keep a deterministic
    // order instead of flickering between renders. Direction multiplication
    // applies to the FULL comparison (primary + tiebreaker), so a descending
    // sort also reverses the slug-tiebreaker order; the ordering within a
    // tied group still stays deterministic across renders, which is what
    // matters.
    if (cmp === 0) cmp = a.slug.localeCompare(b.slug)
    return cmp * sign
  })
  return copy
}

/** @internal Exported for unit tests only. Not re-exported through any barrel. */
export function sortGlobals(
  globals: readonly GlobalEntry[],
  sort: GlobalsSortState,
): readonly GlobalEntry[] {
  const sign = sort.direction === 'asc' ? 1 : -1
  const copy = globals.slice()
  copy.sort((a, b) => {
    let cmp = 0
    switch (sort.column) {
      case 'name':
        cmp = a.name.localeCompare(b.name)
        break
      case 'type':
        cmp = a.type.localeCompare(b.type)
        break
      case 'updated':
        cmp = (a.updatedAt || '').localeCompare(b.updatedAt || '')
        break
    }
    // Tiebreaker chain (applied in order): draft/published status rank,
    // then name. The status rank is added in v0.2 so that within an
    // otherwise-tied group ("same name", "same type", "same updatedAt"
    // — which happens for adjacent imports, batched creates), rows with
    // pending edits and rows with no live version bubble to a
    // deterministic position. Without this, two newly-saved drafts
    // would re-order on every render and confuse the user about which
    // one they just saved.
    //
    // Direction multiplication applies to the FULL comparison
    // (primary + tiebreakers), so a descending sort also reverses the
    // tiebreaker ordering. Deterministic ordering is preserved within
    // a tied group (no flicker between renders), but the rank/name
    // order within that group flips between asc and desc. Same
    // convention as the pages-tab sort.
    if (cmp === 0) cmp = globalStatusRank(a) - globalStatusRank(b)
    if (cmp === 0) cmp = a.name.localeCompare(b.name)
    return cmp * sign
  })
  return copy
}

function isSortDirection(v: unknown): v is SortDirection {
  return v === 'asc' || v === 'desc'
}

function isPagesSortColumn(v: unknown): v is PagesSortColumn {
  return v === 'name' || v === 'status' || v === 'updated'
}

function isGlobalsSortColumn(v: unknown): v is GlobalsSortColumn {
  return v === 'name' || v === 'type' || v === 'updated'
}

/** @internal Exported for unit tests only. Not re-exported through any barrel. */
export function loadPagesSort(): PagesSortState {
  // why: SSR belt-and-braces guard — this is a "use client" component, but
  // lazy `useState` initializers still run in environments where `window`
  // may not exist (test runners, some Next.js prerender paths).
  if (typeof window === 'undefined') return DEFAULT_PAGES_SORT
  try {
    const raw = window.localStorage.getItem(PAGES_SORT_KEY)
    if (!raw) return DEFAULT_PAGES_SORT
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'column' in parsed &&
      'direction' in parsed &&
      isPagesSortColumn((parsed as { column: unknown }).column) &&
      isSortDirection((parsed as { direction: unknown }).direction)
    ) {
      return {
        column: (parsed as { column: PagesSortColumn }).column,
        direction: (parsed as { direction: SortDirection }).direction,
      }
    }
    return DEFAULT_PAGES_SORT
  } catch {
    return DEFAULT_PAGES_SORT
  }
}

/** @internal Exported for unit tests only. Not re-exported through any barrel. */
export function loadGlobalsSort(): GlobalsSortState {
  if (typeof window === 'undefined') return DEFAULT_GLOBALS_SORT
  try {
    const raw = window.localStorage.getItem(GLOBALS_SORT_KEY)
    if (!raw) return DEFAULT_GLOBALS_SORT
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'column' in parsed &&
      'direction' in parsed &&
      isGlobalsSortColumn((parsed as { column: unknown }).column) &&
      isSortDirection((parsed as { direction: unknown }).direction)
    ) {
      return {
        column: (parsed as { column: GlobalsSortColumn }).column,
        direction: (parsed as { direction: SortDirection }).direction,
      }
    }
    return DEFAULT_GLOBALS_SORT
  } catch {
    return DEFAULT_GLOBALS_SORT
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminModal(props: AdminModalProps): ReactElement | null {
  const { open, onClose, definitions } = props

  const [activeTab, setActiveTab] = useState<ActiveTab>('pages')

  // ---- Pages state ----
  const [pages, setPages] = useState<readonly PageEntry[]>([])
  const [loadingPages, setLoadingPages] = useState(false)
  const [errorPages, setErrorPages] = useState<string | null>(null)
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null)
  // Tracked separately from `confirmSlug` so the unpublish confirmation
  // (a proper modal dialog with explanatory copy) does not collide with
  // the inline "Are you sure?" used for deletion.
  const [unpublishSlug, setUnpublishSlug] = useState<string | null>(null)
  // When non-null, the Clone modal is open for this source slug. Separate
  // from unpublishSlug/confirmSlug for the same reason — distinct flow,
  // distinct UI, no state crosstalk.
  const [duplicateSourceSlug, setDuplicateSourceSlug] = useState<string | null>(null)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  // The slug whose history sub-modal is currently open, or null.
  const [historySlug, setHistorySlug] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState('')

  // ---- Globals state ----
  const [globals, setGlobals] = useState<readonly GlobalEntry[]>([])
  const [loadingGlobals, setLoadingGlobals] = useState(false)
  const [errorGlobals, setErrorGlobals] = useState<string | null>(null)
  const [confirmName, setConfirmName] = useState<string | null>(null)
  const [editingGlobal, setEditingGlobal] = useState<string | null>(null)
  // The global-name whose history sub-modal is currently open, or null.
  // Analogue of `historySlug` for the pages tab — kept separate so a
  // user can't somehow open both histories at once through state
  // crosstalk. The sub-modal is rendered on top of this modal.
  const [historyGlobalName, setHistoryGlobalName] = useState<string | null>(null)

  // ---- Search state ----
  const [searchQuery, setSearchQuery] = useState('')

  // ---- Sort state (per tab, persisted via localStorage) ----
  // why: lazy initializer reads localStorage exactly once on mount; the
  // reader itself is SSR-safe. State is kept even when the modal is closed
  // so reopening restores the last-used sort without a fetch roundtrip.
  const [pagesSort, setPagesSort] = useState<PagesSortState>(loadPagesSort)
  const [globalsSort, setGlobalsSort] =
    useState<GlobalsSortState>(loadGlobalsSort)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(PAGES_SORT_KEY, JSON.stringify(pagesSort))
    } catch {
      // Quota or disabled storage — best-effort persistence.
    }
  }, [pagesSort])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(GLOBALS_SORT_KEY, JSON.stringify(globalsSort))
    } catch {
      // Quota or disabled storage — best-effort persistence.
    }
  }, [globalsSort])

  const togglePagesSort = useCallback((column: PagesSortColumn) => {
    setPagesSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' },
    )
  }, [])

  const toggleGlobalsSort = useCallback((column: GlobalsSortColumn) => {
    setGlobalsSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' },
    )
  }, [])

  // ---- Pages fetch ----
  const fetchPages = useCallback(() => {
    setLoadingPages(true)
    setErrorPages(null)
    fetch('/api/agntcms/page/list')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((body: unknown) => {
        if (
          body !== null &&
          typeof body === 'object' &&
          'pages' in body &&
          Array.isArray((body as { pages: unknown }).pages)
        ) {
          setPages((body as { pages: PageEntry[] }).pages)
        }
      })
      .catch((err: unknown) => {
        setErrorPages(err instanceof Error ? err.message : 'Failed to load pages')
      })
      .finally(() => {
        setLoadingPages(false)
      })
  }, [])

  // ---- Globals fetch ----
  //
  // Fetches BOTH the published list and the draft list in parallel,
  // then composes the per-row `hasDraft`/`hasPublished` flags. A name
  // that appears in `global-draft/list` but NOT in `global/list` is a
  // "draft-only" global — typically a fresh creation in preview that
  // has never been published. We synthesise a row for it so the Globals
  // tab can show it; otherwise the user could save a draft and never
  // find it again from the admin UI.
  //
  // The two fetches MUST be awaited together (Promise.all) so the
  // composed view doesn't flicker: rendering the published list first
  // and then re-running the draft pass would briefly show a row with
  // no Draft badge before the badge appeared.
  const fetchGlobals = useCallback(() => {
    setLoadingGlobals(true)
    setErrorGlobals(null)
    Promise.all([
      fetch('/api/agntcms/global/list').then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<unknown>
      }),
      // Drafts are an optimisation on top of the published list: they
      // drive the per-row Draft badge and surface draft-only rows. If
      // the draft endpoint is unavailable (404 on an older runtime,
      // transient network error), degrade to "no drafts known" rather
      // than failing the whole Globals tab. The published-list fetch
      // above keeps its fatal error-propagation behaviour.
      fetch('/api/agntcms/global-draft/list')
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json() as Promise<unknown>
        })
        .catch(() => null),
    ])
      .then(([listBody, draftBody]) => {
        // -- Parse the published list -------------------------------------
        let published: readonly GlobalEntry[] = []
        if (
          listBody !== null &&
          typeof listBody === 'object' &&
          'globals' in listBody &&
          Array.isArray((listBody as { globals: unknown }).globals)
        ) {
          published = (listBody as { globals: GlobalEntry[] }).globals
        }
        // -- Parse the draft list ----------------------------------------
        // Shape: { drafts: Array<{ name, updatedAt }> }. Build the
        // hasDraft name-set AND the per-name updatedAt map in a single
        // pass; the two were previously walked separately. Per-draft
        // metadata beyond updatedAt (type, system) lives on the
        // matching published row when one exists, and is fetched
        // lazily by GlobalEditModal for draft-only rows.
        //
        // draftBody may be null when the draft-list fetch failed (see
        // graceful-degrade catch above) — in that case both collections
        // stay empty and no draft rows or badges are rendered.
        const draftNames = new Set<string>()
        const draftUpdatedAt = new Map<string, string>()
        if (
          draftBody !== null &&
          typeof draftBody === 'object' &&
          'drafts' in draftBody &&
          Array.isArray((draftBody as { drafts: unknown }).drafts)
        ) {
          const drafts = (
            draftBody as { drafts: Array<{ name: string; updatedAt: string }> }
          ).drafts
          for (const d of drafts) {
            draftNames.add(d.name)
            draftUpdatedAt.set(d.name, d.updatedAt)
          }
        }

        // -- Compose ------------------------------------------------------
        // Pass 1: enrich every published row with hasDraft/hasPublished.
        const composed: GlobalEntry[] = published.map((g) => ({
          ...g,
          hasPublished: true,
          hasDraft: draftNames.has(g.name),
        }))
        // Pass 2: synthesise rows for draft-only globals. These are
        // typically fresh creates in preview that have never been
        // published. We don't know the section's type from the draft
        // list response (it doesn't carry it), so the row's `type`
        // shows as empty and the History/Edit actions still work via
        // the global-draft endpoint.
        const publishedNames = new Set(published.map((g) => g.name))
        for (const name of draftNames) {
          if (publishedNames.has(name)) continue
          composed.push({
            name,
            // No section type known until the Edit modal fetches the
            // draft body. Render an empty string — the row's columns
            // are still useful for navigation (Edit, Publish, Discard).
            type: '',
            updatedAt: draftUpdatedAt.get(name) ?? '',
            hasPublished: false,
            hasDraft: true,
          })
        }
        setGlobals(composed)
      })
      .catch((err: unknown) => {
        setErrorGlobals(
          err instanceof Error ? err.message : 'Failed to load globals',
        )
      })
      .finally(() => {
        setLoadingGlobals(false)
      })
  }, [])

  // Fetch data when modal opens or when the active tab changes.
  useEffect(() => {
    if (!open) return
    setSearchQuery('')
    if (activeTab === 'pages') {
      fetchPages()
      setConfirmSlug(null)
      setUnpublishSlug(null)
      setDuplicateSourceSlug(null)
      setEditingSlug(null)
      setHistorySlug(null)
      setCurrentPath('')
    } else if (activeTab === 'globals') {
      fetchGlobals()
      setConfirmName(null)
      setHistoryGlobalName(null)
    }
  }, [open, activeTab, fetchPages, fetchGlobals])


  // ---- Pages handlers ----

  const handleNavigate = useCallback(
    (slug: string) => {
      onClose()
      window.location.href = `/${slug === 'home' ? '' : slug}`
    },
    [onClose],
  )

  const handleDeleteClick = useCallback((slug: string) => {
    setConfirmSlug(slug)
  }, [])

  const handleDeleteCancel = useCallback(() => {
    setConfirmSlug(null)
  }, [])

  const handleDeleteConfirm = useCallback(
    (slug: string) => {
      setConfirmSlug(null)
      fetch('/api/agntcms/page/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Delete failed: HTTP ${res.status}`)
          fetchPages()
        })
        .catch(() => {
          setErrorPages(`Failed to delete "${slug}"`)
        })
    },
    [fetchPages],
  )

  const handleUnpublishClick = useCallback((slug: string) => {
    setUnpublishSlug(slug)
  }, [])

  const handleUnpublishCancel = useCallback(() => {
    setUnpublishSlug(null)
  }, [])

  const handleUnpublishConfirm = useCallback(
    (slug: string) => {
      setUnpublishSlug(null)
      fetch('/api/agntcms/page/unpublish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Unpublish failed: HTTP ${res.status}`)
          // Same refetch pattern as delete/rename: the row will now show
          // only the "Draft" badge — either because a draft already
          // existed, or because unpublish converted the published page
          // into one.
          fetchPages()
        })
        .catch(() => {
          setErrorPages(`Failed to unpublish "${slug}"`)
        })
    },
    [fetchPages],
  )

  const handleDuplicateClick = useCallback((slug: string) => {
    setDuplicateSourceSlug(slug)
  }, [])

  const handleDuplicateClose = useCallback(() => {
    setDuplicateSourceSlug(null)
  }, [])

  const handleDuplicateDone = useCallback(
    (newSlug: string) => {
      setDuplicateSourceSlug(null)
      // Refresh the list so the new draft shows up; then open the new
      // page so the user can see/edit the clone. Route to the new slug
      // the same way handleNavigate does after close.
      fetchPages()
      onClose()
      window.location.href = `/${newSlug === 'home' ? '' : newSlug}`
    },
    [fetchPages, onClose],
  )

  // ---- Globals handlers ----

  const handleGlobalDeleteClick = useCallback((name: string) => {
    setConfirmName(name)
  }, [])

  const handleGlobalDeleteCancel = useCallback(() => {
    setConfirmName(null)
  }, [])

  const handleGlobalDeleteConfirm = useCallback(
    (name: string) => {
      setConfirmName(null)
      // Method MUST be DELETE — dispatcher route `global/delete` is DELETE-only
      // (see handlers/dispatcher.ts). POST returns 405. Body is preserved
      // because the handler reads `name` via `await req.json()`.
      fetch('/api/agntcms/global/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Delete failed: HTTP ${res.status}`)
          fetchGlobals()
        })
        .catch(() => {
          setErrorGlobals(`Failed to delete "${name}"`)
        })
    },
    [fetchGlobals],
  )

  // -- Draft lifecycle handlers --
  //
  // Both Publish and Discard are no-confirmation actions. Publish is
  // additive (writes a new history snapshot, leaves the draft removed),
  // and Discard is the user's explicit choice to throw work away — they
  // already had to think twice before clicking it. If the user accidentally
  // discards a draft they care about, the previous published version is
  // still live and they can redo the edit. (Pages have the same Discard
  // semantics via `/draft/discard`.)
  const handlePublishGlobalDraft = useCallback(
    (name: string) => {
      fetch('/api/agntcms/global-draft/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Publish failed: HTTP ${res.status}`)
          fetchGlobals()
        })
        .catch(() => {
          setErrorGlobals(`Failed to publish "${name}"`)
        })
    },
    [fetchGlobals],
  )

  const handleDiscardGlobalDraft = useCallback(
    (name: string) => {
      fetch('/api/agntcms/global-draft/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Discard failed: HTTP ${res.status}`)
          fetchGlobals()
        })
        .catch(() => {
          setErrorGlobals(`Failed to discard draft "${name}"`)
        })
    },
    [fetchGlobals],
  )

  // ---- Filtered lists for search ----

  const isSearchActive = searchQuery.trim().length > 0

  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return pages
    return pages.filter((p) => p.slug.toLowerCase().includes(q))
  }, [pages, searchQuery])

  const filteredGlobals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return globals
    return globals.filter(
      (g) =>
        g.name.toLowerCase().includes(q) || g.type.toLowerCase().includes(q),
    )
  }, [globals, searchQuery])

  // ---- Derived folder contents ----
  // When a search is active, show results flat (from root) regardless of
  // the current folder path. Otherwise, use normal folder navigation.
  //
  // why: folders stay pinned to the top in their built-in alphabetical order
  // (see deriveFolderContents). Only the page rows below them are re-sorted
  // by the active Pages sort. We rebuild the page slice from scratch so the
  // active sort can use the current folder path for the "name" column.
  const folderContents = useMemo(() => {
    const effectivePath = isSearchActive ? '' : currentPath
    const items = deriveFolderContents(filteredPages, effectivePath)
    const folders = items.filter((i): i is FolderItem => i.kind === 'folder')
    const pageEntries = items
      .filter((i): i is PageItem => i.kind === 'page')
      .map((i) => i.entry)
    const sortedPages = sortPages(pageEntries, pagesSort, effectivePath)
    const sortedPageItems: PageItem[] = sortedPages.map((entry) => ({
      kind: 'page',
      entry,
    }))
    return [...folders, ...sortedPageItems]
  }, [filteredPages, isSearchActive, currentPath, pagesSort])

  // why: framework-managed globals (`system: true`) are rendered in a
  // separate "Settings" group BELOW user globals using a header <tr>
  // injected between the two sorted slices. We keep one <table> (least
  // churn vs. the previous single-list shape) and apply the active sort
  // per group so user entries never interleave with system entries.
  const globalRows = useMemo<readonly GlobalRow[]>(() => {
    const { user, system } = partitionGlobalsBySystem(filteredGlobals)
    const sortedUser = sortGlobals(user, globalsSort)
    const sortedSystem = sortGlobals(system, globalsSort)
    const rows: GlobalRow[] = sortedUser.map((entry) => ({ kind: 'global', entry }))
    if (sortedSystem.length > 0) {
      rows.push({ kind: 'header', label: 'Settings' })
      for (const entry of sortedSystem) {
        rows.push({ kind: 'global', entry })
      }
    }
    return rows
  }, [filteredGlobals, globalsSort])

  // ---- Tab bar (rendered as the Modal title) ----
  const tabBar = (
    <div style={tabBarContainerStyle}>
      <button
        type="button"
        style={activeTab === 'pages' ? activeTabStyle : inactiveTabStyle}
        onClick={() => setActiveTab('pages')}
        data-testid="agntcms-admin-tab-pages"
      >
        Pages
      </button>
      <button
        type="button"
        style={activeTab === 'globals' ? activeTabStyle : inactiveTabStyle}
        onClick={() => setActiveTab('globals')}
        data-testid="agntcms-admin-tab-globals"
      >
        Globals
      </button>
    </div>
  )

  // ---- Breadcrumb for folder navigation ----
  const breadcrumb = currentPath ? (
    <div style={breadcrumbStyle}>
      <button
        type="button"
        style={breadcrumbSegmentStyle}
        onClick={() => setCurrentPath('')}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.color =
            'var(--agntcms-admin-accent)'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.color =
            'var(--agntcms-admin-fg-dim)'
        }}
      >
        /
      </button>
      {currentPath.split('/').map((segment, i, arr) => {
        const segmentPath = arr.slice(0, i + 1).join('/')
        const isLast = i === arr.length - 1
        return (
          <span key={segmentPath} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={breadcrumbSeparatorStyle}>/</span>
            {isLast ? (
              <span style={breadcrumbCurrentStyle}>{segment}</span>
            ) : (
              <button
                type="button"
                style={breadcrumbSegmentStyle}
                onClick={() => setCurrentPath(segmentPath)}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.color =
                    'var(--agntcms-admin-accent)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.color =
                    'var(--agntcms-admin-fg-dim)'
                }}
              >
                {segment}
              </button>
            )}
          </span>
        )
      })}
    </div>
  ) : null

  // ---- Search input (shared between both tabs) ----
  const searchInput = (
    <div style={searchContainerStyle}>
      <input
        type="text"
        placeholder={
          activeTab === 'pages' ? 'Search pages...' : 'Search globals...'
        }
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={searchInputStyle}
        data-testid="agntcms-admin-search"
      />
    </div>
  )

  // ---- Pages content ----
  const pagesContent = (
    <>
      {searchInput}
      {!isSearchActive && breadcrumb}
      {loadingPages && pages.length === 0 ? (
        <div style={emptyStyle}>Loading...</div>
      ) : errorPages ? (
        <div style={errorStyle}>{errorPages}</div>
      ) : pages.length === 0 ? (
        <div style={emptyStyle}>No pages yet. Create one below.</div>
      ) : folderContents.length === 0 ? (
        <div style={emptyStyle}>
          {isSearchActive
            ? 'No matching pages.'
            : 'This folder is empty. Create a page below.'}
        </div>
      ) : (
        <>
          {currentPath && !isSearchActive && (
            <div style={rowStyle}>
              <button
                type="button"
                style={backButtonStyle}
                onClick={() => {
                  const parentPath = currentPath.includes('/')
                    ? currentPath.slice(0, currentPath.lastIndexOf('/'))
                    : ''
                  setCurrentPath(parentPath)
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.color =
                    'var(--agntcms-admin-accent)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.color =
                    'var(--agntcms-admin-fg-dim)'
                }}
              >
                ..
              </button>
            </div>
          )}
          <table style={tableStyle}>
            <colgroup>
              <col />
              <col style={colStatusStyle} />
              <col style={colUpdatedStyle} />
              <col style={colActionsStyle} />
            </colgroup>
            <thead>
              <tr>
                <th style={thSortableStyle} scope="col">
                  <button
                    type="button"
                    style={thButtonStyle}
                    onClick={() => togglePagesSort('name')}
                    data-testid="agntcms-pages-sort-name"
                  >
                    Name
                    {pagesSort.column === 'name' && (
                      <span style={sortArrowStyle} aria-hidden="true">
                        {pagesSort.direction === 'asc' ? '\u2191' : '\u2193'}
                      </span>
                    )}
                  </button>
                </th>
                <th style={thSortableStyle} scope="col">
                  <button
                    type="button"
                    style={thButtonStyle}
                    onClick={() => togglePagesSort('status')}
                    data-testid="agntcms-pages-sort-status"
                  >
                    Status
                    {pagesSort.column === 'status' && (
                      <span style={sortArrowStyle} aria-hidden="true">
                        {pagesSort.direction === 'asc' ? '\u2191' : '\u2193'}
                      </span>
                    )}
                  </button>
                </th>
                <th style={thSortableStyle} scope="col">
                  <button
                    type="button"
                    style={thButtonStyle}
                    onClick={() => togglePagesSort('updated')}
                    data-testid="agntcms-pages-sort-updated"
                  >
                    Updated
                    {pagesSort.column === 'updated' && (
                      <span style={sortArrowStyle} aria-hidden="true">
                        {pagesSort.direction === 'asc' ? '\u2191' : '\u2193'}
                      </span>
                    )}
                  </button>
                </th>
                <th style={{ ...thStyle, textAlign: 'right' }} scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {folderContents.map((item) => {
                if (item.kind === 'folder') {
                  return (
                    <tr key={`folder:${item.path}`}>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          style={folderButtonStyle}
                          onClick={() => setCurrentPath(item.path)}
                          onMouseEnter={(e) => {
                            ;(e.currentTarget as HTMLButtonElement).style.color =
                              'var(--agntcms-admin-accent)'
                          }}
                          onMouseLeave={(e) => {
                            ;(e.currentTarget as HTMLButtonElement).style.color =
                              'var(--agntcms-admin-fg)'
                          }}
                        >
                          {item.name}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <span style={folderCountStyle}>
                          {item.count} {item.count === 1 ? 'page' : 'pages'}
                        </span>
                      </td>
                      <td style={tdStyle} />
                      <td style={tdActionsStyle} />
                    </tr>
                  )
                }

                const page = item.entry

                return (
                  <tr key={page.slug}>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        style={slugButtonStyle}
                        onClick={() => handleNavigate(page.slug)}
                        onMouseEnter={(e) => {
                          ;(e.currentTarget as HTMLButtonElement).style.color =
                            'var(--agntcms-admin-accent)'
                        }}
                        onMouseLeave={(e) => {
                          ;(e.currentTarget as HTMLButtonElement).style.color =
                            'var(--agntcms-admin-fg)'
                        }}
                      >
                        {localName(page.slug, currentPath)}
                      </button>
                    </td>
                    <td style={tdStyle}>
                      <div style={badgeContainerStyle}>
                        {page.hasPublished && (
                          <span style={publishedBadgeStyle}>Published</span>
                        )}
                        {page.hasDraft && (
                          <span style={draftBadgeStyle}>Draft</span>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {page.updatedAt && (
                        <span style={dateStyle}>
                          {formatDate(page.updatedAt)}
                        </span>
                      )}
                    </td>
                    <td style={tdActionsStyle}>
                      <div style={actionsEndStyle}>
                        {confirmSlug === page.slug ? (
                          <>
                            <span style={confirmTextStyle}>Are you sure?</span>
                            <button
                              type="button"
                              style={confirmYesStyle}
                              onClick={() => handleDeleteConfirm(page.slug)}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              style={confirmNoStyle}
                              onClick={handleDeleteCancel}
                            >
                              No
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              style={editButtonStyle}
                              onClick={() => setEditingSlug(page.slug)}
                              onMouseEnter={(e) => {
                                ;(e.currentTarget as HTMLButtonElement).style.color =
                                  'var(--agntcms-admin-fg)'
                              }}
                              onMouseLeave={(e) => {
                                ;(e.currentTarget as HTMLButtonElement).style.color =
                                  'var(--agntcms-admin-fg-dim)'
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              style={editButtonStyle}
                              onClick={() => setHistorySlug(page.slug)}
                              title="Page history"
                              aria-label="Page history"
                              data-testid={`agntcms-page-history-${page.slug}`}
                              onMouseEnter={(e) => {
                                ;(e.currentTarget as HTMLButtonElement).style.color =
                                  'var(--agntcms-admin-fg)'
                              }}
                              onMouseLeave={(e) => {
                                ;(e.currentTarget as HTMLButtonElement).style.color =
                                  'var(--agntcms-admin-fg-dim)'
                              }}
                            >
                              History
                            </button>
                            {page.hasPublished && (
                              <button
                                type="button"
                                style={editButtonStyle}
                                onClick={() => handleUnpublishClick(page.slug)}
                                title="Unpublish page"
                                aria-label="Unpublish page"
                                data-testid={`agntcms-page-unpublish-${page.slug}`}
                                onMouseEnter={(e) => {
                                  ;(e.currentTarget as HTMLButtonElement).style.color =
                                    'var(--agntcms-admin-fg)'
                                }}
                                onMouseLeave={(e) => {
                                  ;(e.currentTarget as HTMLButtonElement).style.color =
                                    'var(--agntcms-admin-fg-dim)'
                                }}
                              >
                                Unpublish
                              </button>
                            )}
                            <button
                              type="button"
                              style={editButtonStyle}
                              onClick={() => handleDuplicateClick(page.slug)}
                              title="Clone page"
                              aria-label="Clone page"
                              data-testid={`agntcms-page-clone-${page.slug}`}
                              onMouseEnter={(e) => {
                                ;(e.currentTarget as HTMLButtonElement).style.color =
                                  'var(--agntcms-admin-fg)'
                              }}
                              onMouseLeave={(e) => {
                                ;(e.currentTarget as HTMLButtonElement).style.color =
                                  'var(--agntcms-admin-fg-dim)'
                              }}
                            >
                              Clone
                            </button>
                            <button
                              type="button"
                              style={xDeleteButtonStyle}
                              onClick={() => handleDeleteClick(page.slug)}
                              title="Delete page"
                              aria-label="Delete page"
                              onMouseEnter={(e) => {
                                ;(e.currentTarget as HTMLButtonElement).style.color =
                                  'var(--agntcms-admin-danger)'
                              }}
                              onMouseLeave={(e) => {
                                ;(e.currentTarget as HTMLButtonElement).style.color =
                                  'var(--agntcms-admin-fg-dim)'
                              }}
                            >
                              {'\u00D7'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  )

  // ---- Globals content ----
  const globalsContent = (
    <>
      {searchInput}
      {loadingGlobals && globals.length === 0 ? (
        <div style={emptyStyle}>Loading...</div>
      ) : errorGlobals ? (
        <div style={errorStyle}>{errorGlobals}</div>
      ) : globals.length === 0 ? (
        <div style={emptyStyle}>No globals yet. Create one below.</div>
      ) : filteredGlobals.length === 0 ? (
        <div style={emptyStyle}>No matching globals.</div>
      ) : (
        <table style={tableStyle}>
          <colgroup>
            <col />
            <col style={colTypeStyle} />
            <col style={colUpdatedStyle} />
            <col style={colActionsStyle} />
          </colgroup>
          <thead>
            <tr>
              <th style={thSortableStyle} scope="col">
                <button
                  type="button"
                  style={thButtonStyle}
                  onClick={() => toggleGlobalsSort('name')}
                  data-testid="agntcms-globals-sort-name"
                >
                  Name
                  {globalsSort.column === 'name' && (
                    <span style={sortArrowStyle} aria-hidden="true">
                      {globalsSort.direction === 'asc' ? '\u2191' : '\u2193'}
                    </span>
                  )}
                </button>
              </th>
              <th style={thSortableStyle} scope="col">
                <button
                  type="button"
                  style={thButtonStyle}
                  onClick={() => toggleGlobalsSort('type')}
                  data-testid="agntcms-globals-sort-type"
                >
                  Type
                  {globalsSort.column === 'type' && (
                    <span style={sortArrowStyle} aria-hidden="true">
                      {globalsSort.direction === 'asc' ? '\u2191' : '\u2193'}
                    </span>
                  )}
                </button>
              </th>
              <th style={thSortableStyle} scope="col">
                <button
                  type="button"
                  style={thButtonStyle}
                  onClick={() => toggleGlobalsSort('updated')}
                  data-testid="agntcms-globals-sort-updated"
                >
                  Updated
                  {globalsSort.column === 'updated' && (
                    <span style={sortArrowStyle} aria-hidden="true">
                      {globalsSort.direction === 'asc' ? '\u2191' : '\u2193'}
                    </span>
                  )}
                </button>
              </th>
              <th style={{ ...thStyle, textAlign: 'right' }} scope="col">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {globalRows.map((row) => {
              if (row.kind === 'header') {
                // why: a single <table> with a header <tr> spanning all
                // columns is less churn than splitting into two <table>s,
                // and keeps the sortable column widths aligned across both
                // groups. The header is non-interactive (purely visual).
                return (
                  <tr key={`__header__:${row.label}`}>
                    <td colSpan={4} style={settingsHeaderStyle}>
                      {row.label}
                    </td>
                  </tr>
                )
              }
              const g = row.entry
              const deletable = isGlobalDeleteVisible(g)
              return (
                <tr key={g.name}>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      style={slugButtonStyle}
                      onClick={() => setEditingGlobal(g.name)}
                      data-testid={`agntcms-global-name-${g.name}`}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLButtonElement).style.color =
                          'var(--agntcms-admin-accent)'
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLButtonElement).style.color =
                          'var(--agntcms-admin-fg)'
                      }}
                    >
                      {g.name}
                    </button>
                  </td>
                  <td style={tdStyle}>
                    <div style={badgeContainerStyle}>
                      {g.type !== '' && (
                        <span style={typeBadgeStyle}>{g.type}</span>
                      )}
                      {g.hasDraft === true && (
                        <span style={draftBadgeStyle}>Draft</span>
                      )}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {g.updatedAt && (
                      <span style={dateStyle}>{formatDate(g.updatedAt)}</span>
                    )}
                  </td>
                  <td style={tdActionsStyle}>
                    <div style={actionsEndStyle}>
                      {confirmName === g.name ? (
                        <>
                          <span style={confirmTextStyle}>Are you sure?</span>
                          <button
                            type="button"
                            style={confirmYesStyle}
                            onClick={() => handleGlobalDeleteConfirm(g.name)}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            style={confirmNoStyle}
                            onClick={handleGlobalDeleteCancel}
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            style={editButtonStyle}
                            onClick={() => setEditingGlobal(g.name)}
                            data-testid={`agntcms-global-edit-${g.name}`}
                            onMouseEnter={(e) => {
                              ;(e.currentTarget as HTMLButtonElement).style.color =
                                'var(--agntcms-admin-fg)'
                            }}
                            onMouseLeave={(e) => {
                              ;(e.currentTarget as HTMLButtonElement).style.color =
                                'var(--agntcms-admin-fg-dim)'
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            style={editButtonStyle}
                            onClick={() => setHistoryGlobalName(g.name)}
                            title="Global history"
                            aria-label="Global history"
                            data-testid={`agntcms-global-history-${g.name}`}
                            onMouseEnter={(e) => {
                              ;(e.currentTarget as HTMLButtonElement).style.color =
                                'var(--agntcms-admin-fg)'
                            }}
                            onMouseLeave={(e) => {
                              ;(e.currentTarget as HTMLButtonElement).style.color =
                                'var(--agntcms-admin-fg-dim)'
                            }}
                          >
                            History
                          </button>
                          {/* Publish / Discard appear only when this row
                              has a pending draft. Mirror of the page-tab
                              affordances (page draft Publish/Discard
                              flow through /draft/publish + /draft/discard);
                              the only UX difference is that page
                              Publish/Discard are surfaced from the in-page
                              preview toolbar today, whereas globals carry
                              the action here because the Globals tab is
                              the user's main entry point to global rows. */}
                          {g.hasDraft === true && (
                            <>
                              <button
                                type="button"
                                style={editButtonStyle}
                                onClick={() => handlePublishGlobalDraft(g.name)}
                                title="Publish draft"
                                aria-label="Publish draft"
                                data-testid={`agntcms-global-publish-${g.name}`}
                                onMouseEnter={(e) => {
                                  ;(e.currentTarget as HTMLButtonElement).style.color =
                                    'var(--agntcms-admin-fg)'
                                }}
                                onMouseLeave={(e) => {
                                  ;(e.currentTarget as HTMLButtonElement).style.color =
                                    'var(--agntcms-admin-fg-dim)'
                                }}
                              >
                                Publish
                              </button>
                              <button
                                type="button"
                                style={editButtonStyle}
                                onClick={() => handleDiscardGlobalDraft(g.name)}
                                title="Discard draft"
                                aria-label="Discard draft"
                                data-testid={`agntcms-global-discard-${g.name}`}
                                onMouseEnter={(e) => {
                                  ;(e.currentTarget as HTMLButtonElement).style.color =
                                    'var(--agntcms-admin-fg)'
                                }}
                                onMouseLeave={(e) => {
                                  ;(e.currentTarget as HTMLButtonElement).style.color =
                                    'var(--agntcms-admin-fg-dim)'
                                }}
                              >
                                Discard
                              </button>
                            </>
                          )}
                          {/* Every globals row gets the Delete (x)
                              affordance, including system-flagged rows
                              (the server now allows deletion). The
                              `deletable` gate stays as the single
                              source of truth in case future policy
                              wants to hide it per row. Hidden for
                              draft-only rows (hasPublished: false) —
                              Discard is the right action there; Delete
                              would 404 on the missing live file. */}
                          {deletable && (
                            <button
                              type="button"
                              style={xDeleteButtonStyle}
                              onClick={() => handleGlobalDeleteClick(g.name)}
                              title="Delete global"
                              aria-label="Delete global"
                              data-testid={`agntcms-global-delete-${g.name}`}
                              onMouseEnter={(e) => {
                                ;(e.currentTarget as HTMLButtonElement).style.color =
                                  'var(--agntcms-admin-danger)'
                              }}
                              onMouseLeave={(e) => {
                                ;(e.currentTarget as HTMLButtonElement).style.color =
                                  'var(--agntcms-admin-fg-dim)'
                              }}
                            >
                              {'\u00D7'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={tabBar}
        ariaLabel="Admin"
        zIndex={100000}
        contentPadding={0}
      >
        {activeTab === 'pages' ? pagesContent : globalsContent}
      </Modal>
      {editingSlug !== null && (
        <PageMetadataModal
          slug={editingSlug}
          open={true}
          onClose={() => setEditingSlug(null)}
          onSaved={() => {
            setEditingSlug(null)
            fetchPages()
          }}
        />
      )}
      {historySlug !== null && (
        <PageHistoryModal
          slug={historySlug}
          open={true}
          onClose={() => setHistorySlug(null)}
          onRollbackDone={() => {
            // Rollback creates a new history entry and a new published
            // version; refresh the pages list so the parent table picks
            // up the new updatedAt + status, then close.
            setHistorySlug(null)
            fetchPages()
          }}
          {...(definitions !== undefined ? { definitions } : {})}
        />
      )}
      {unpublishSlug !== null && (
        <Modal
          open={true}
          onClose={handleUnpublishCancel}
          title={<span style={unpublishTitleStyle}>Unpublish page</span>}
          ariaLabel="Unpublish page"
          zIndex={100001}
          maxWidth={480}
          maxHeight="auto"
          footer={
            <>
              <button
                type="button"
                style={metaCancelButtonStyle}
                onClick={handleUnpublishCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                style={unpublishConfirmButtonStyle}
                onClick={() => handleUnpublishConfirm(unpublishSlug)}
                data-testid={`agntcms-page-unpublish-confirm-${unpublishSlug}`}
              >
                Unpublish
              </button>
            </>
          }
        >
          <div style={unpublishBodyStyle}>
            <p style={unpublishParagraphStyle}>
              Unpublish &ldquo;{unpublishSlug}&rdquo;?
            </p>
            <p style={unpublishParagraphStyle}>
              The live page will be removed. Your draft (if any) is kept;
              you can restore the published version from history.
            </p>
          </div>
        </Modal>
      )}
      {duplicateSourceSlug !== null && (
        <DuplicatePageModal
          sourceSlug={duplicateSourceSlug}
          existingSlugs={pages.map((p) => p.slug)}
          onClose={handleDuplicateClose}
          onDone={handleDuplicateDone}
        />
      )}
      {editingGlobal !== null && (() => {
        // Look up the already-fetched type for this global so the sub-modal
        // can render at the correct width on first paint. If the entry isn't
        // in the list (shouldn't happen — the caller always opens from the
        // same list), omit the prop and the sub-modal falls back to its
        // pre-fetch behaviour.
        const entry = globals.find((g) => g.name === editingGlobal)
        return (
          <GlobalEditModal
            name={editingGlobal}
            open={true}
            onClose={() => setEditingGlobal(null)}
            onSaved={() => {
              setEditingGlobal(null)
              fetchGlobals()
            }}
            {...(definitions !== undefined ? { definitions } : {})}
            {...(entry !== undefined ? { initialType: entry.type } : {})}
            {...(entry?.hasDraft === true ? { initialHasDraft: true } : {})}
          />
        )
      })()}
      {historyGlobalName !== null && (
        <GlobalHistoryModal
          name={historyGlobalName}
          open={true}
          onClose={() => setHistoryGlobalName(null)}
          onRollbackDone={() => {
            // Rollback re-saves the snapshot as the current global (and
            // appends a new history entry unless dedupe kicks in); refresh
            // the globals list so the outer table picks up the new
            // updatedAt, then close.
            setHistoryGlobalName(null)
            fetchGlobals()
          }}
          {...(definitions !== undefined ? { definitions } : {})}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Inline styles
// ---------------------------------------------------------------------------

const tabBarContainerStyle: CSSProperties = {
  display: 'flex',
  gap: 0,
}

const tabStyle: CSSProperties = {
  padding: '8px 16px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  borderBottom: '2px solid transparent',
}

const activeTabStyle: CSSProperties = {
  ...tabStyle,
  color: 'var(--agntcms-admin-accent)',
  borderBottom: '2px solid var(--agntcms-admin-accent)',
}

const inactiveTabStyle: CSSProperties = {
  ...tabStyle,
  color: 'var(--agntcms-admin-fg-dim)',
}

const searchContainerStyle: CSSProperties = {
  padding: '8px 24px',
  borderBottom: '1px solid var(--agntcms-admin-border)',
}

const searchInputStyle: CSSProperties = {
  width: '100%',
  padding: '6px 12px',
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
  background: 'var(--agntcms-admin-surface-raised)',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 4,
  outline: 'none',
  boxSizing: 'border-box' as const,
}

const emptyStyle: CSSProperties = {
  padding: '48px 24px',
  textAlign: 'center',
  fontSize: 14,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
}

const errorStyle: CSSProperties = {
  padding: '24px',
  textAlign: 'center',
  fontSize: 14,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-danger)',
}

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

// --- Table styles (Pages + Globals lists) -------------------------------
// We render the two lists as semantic tables so the columns (Name / Status
// or Type / Updated / Actions) are visually aligned and scannable. Styles
// match the surrounding row/cell aesthetic of the modal.

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 24px',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid var(--agntcms-admin-border)',
  background: 'transparent',
}

// Sortable header cell: zero padding so the inner <button> owns the
// clickable area and keeps the visual padding consistent with `thStyle`.
const thSortableStyle: CSSProperties = {
  textAlign: 'left',
  padding: 0,
  borderBottom: '1px solid var(--agntcms-admin-border)',
  background: 'transparent',
}

const thButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  width: '100%',
  padding: '8px 24px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const sortArrowStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: 1,
  color: 'var(--agntcms-admin-accent)',
}

const tdStyle: CSSProperties = {
  padding: '10px 24px',
  borderBottom: '1px solid var(--agntcms-admin-border)',
  verticalAlign: 'middle',
  overflow: 'hidden',
}

// Actions cell: right-aligned controls, no overflow hiding (confirm flow
// temporarily renders inline text + two buttons that should stay visible).
const tdActionsStyle: CSSProperties = {
  padding: '10px 24px',
  borderBottom: '1px solid var(--agntcms-admin-border)',
  verticalAlign: 'middle',
  textAlign: 'right',
}

// Column width hints. `Name` column is left unconstrained (takes the rest
// of the width). Status / Type / Updated / Actions are sized to their
// content so the Name column is the one that absorbs extra space.
const colStatusStyle: CSSProperties = { width: 160 }
const colTypeStyle: CSSProperties = { width: 160 }
const colUpdatedStyle: CSSProperties = { width: 140 }
// Wide enough to hold the full action row (Edit + History + Unpublish +
// Clone + ×) without overflowing leftward into the Updated cell. The
// actions cell intentionally has no overflow:hidden (so the inline
// "Are you sure?" confirm stays visible), so the column itself must be
// the constraint that keeps the buttons inside.
const colActionsStyle: CSSProperties = { width: 300 }

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '10px 24px',
  borderBottom: '1px solid var(--agntcms-admin-border)',
  gap: 12,
}

const slugButtonStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 14,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
  textAlign: 'left',
  padding: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const badgeContainerStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexShrink: 0,
}

const publishedBadgeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-success)',
  background: 'var(--agntcms-admin-success-tint)',
}

const draftBadgeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-warning)',
  background: 'var(--agntcms-admin-warning-tint)',
}

const typeBadgeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-accent)',
  background: 'var(--agntcms-admin-accent-tint)',
}

// "Settings" group separator inside the Globals table. Matches the
// visual weight of the column headers (same uppercase + tertiary color)
// so the eye reads it as a group label rather than a data row.
const settingsHeaderStyle: CSSProperties = {
  padding: '14px 24px 6px',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderTop: '1px solid var(--agntcms-admin-border)',
  background: 'transparent',
}

const dateStyle: CSSProperties = {
  fontSize: 12,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  whiteSpace: 'nowrap',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
}

// Same as actionsStyle but right-aligned. Used inside the Actions <td> of
// the Pages and Globals tables so buttons stick to the right edge of the
// cell rather than crowding against the Updated column.
const actionsEndStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 6,
  flexShrink: 0,
}

const editButtonStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  padding: '2px 6px',
}

const xDeleteButtonStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  border: '1px solid var(--agntcms-admin-border)',
  background: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--agntcms-admin-fg-dim)',
  lineHeight: 1,
  padding: 0,
  flexShrink: 0,
}

const confirmTextStyle: CSSProperties = {
  fontSize: 12,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-muted)',
}

const confirmYesStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-danger)',
  padding: '2px 6px',
}

const confirmNoStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-muted)',
  padding: '2px 6px',
}

const footerContainerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
}

const inputStyle: CSSProperties = {
  flex: 1,
  padding: '6px 12px',
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
  background: 'var(--agntcms-admin-surface-raised)',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 4,
  outline: 'none',
}

const createButtonStyle: CSSProperties = {
  padding: '6px 16px',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-accent-fg)',
  background: 'var(--agntcms-admin-accent)',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
}

// -- Breadcrumb styles --

const breadcrumbStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '8px 24px',
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  borderBottom: '1px solid var(--agntcms-admin-border)',
}

const breadcrumbSegmentStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  padding: 0,
}

const breadcrumbSeparatorStyle: CSSProperties = {
  color: 'var(--agntcms-admin-fg-dim)',
  userSelect: 'none',
}

const breadcrumbCurrentStyle: CSSProperties = {
  color: 'var(--agntcms-admin-fg)',
  fontWeight: 600,
}

// -- Folder row styles --

const backButtonStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  textAlign: 'left',
  padding: 0,
}

const folderButtonStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
  textAlign: 'left',
  padding: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const folderCountStyle: CSSProperties = {
  fontSize: 12,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
}

// -- Pages footer wrapper --

const pagesFooterWrapperStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  width: '100%',
}

// -- Path prefix in create footer --

const pathPrefixStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

// ---------------------------------------------------------------------------
// PageMetadataModal — sub-modal for editing an existing page's slug + SEO
// metadata. Private to this file. Uses the shared Modal shell layered above
// AdminModal. Page creation is not an admin-UI flow in v0.5 (the agent
// channel that previously drove it was removed — ARCHITECTURE.md sections
// 6 and 7); new pages are scaffolded by the developer via skills.
// ---------------------------------------------------------------------------

/** Segments separated by `/`, each segment: letters, digits, hyphens, underscores. */
const META_SLUG_PATTERN = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/

/** Section snapshot round-tripped on Save so unrelated sections stay intact. */
interface MetadataSection {
  readonly id: string
  readonly type: string
  readonly data: Readonly<Record<string, unknown>>
}

interface PageMetadataModalProps {
  readonly slug: string
  readonly open: boolean
  readonly onClose: () => void
  /** Fired after a successful save (and rename, if any). */
  readonly onSaved: () => void
}

/**
 * Shape returned by GET /api/agntcms/page/read.
 *
 * `seo` is required at the domain layer (`assertValidPage` rejects pages
 * without it) and the runtime read path enforces the same. We mirror that
 * contract here: title and description are guaranteed non-empty strings on
 * the server side, so the client treats them as guaranteed too. The
 * optional `ogImage` and `canonical` fields ride through unchanged.
 *
 * The optional top-level metadata fields (`tags`, `excerpt`, `coverImage`,
 * `publishedAt`) mirror the domain `Page` type so the metadata-edit flow
 * round-trips them on Save. Without these declarations they would be
 * silently discarded — the previous shape only listed slug/seo/sections,
 * so a blog post's `tags` + `publishedAt` would vanish the moment an
 * editor opened "Page metadata" and clicked Save.
 */
interface ReadPageResponse {
  readonly page: {
    readonly slug: string
    readonly seo: {
      readonly title: string
      readonly description: string
      readonly ogImage?: ImageValue
      readonly canonical?: string
    }
    readonly tags?: readonly string[]
    readonly excerpt?: string
    readonly coverImage?: ImageValue
    readonly publishedAt?: string
    readonly sections: ReadonlyArray<MetadataSection>
  }
}

/**
 * Best-effort extraction of an error message from a non-2xx Response.
 * Handler payloads have shape `{ error, message }` (see `jsonResponse` and
 * `parseSaveBody` in `handlers/draft/draft-handler.ts`); the validator's
 * message is forwarded verbatim so we can surface "seo.title must be a
 * non-empty string" rather than the generic HTTP code.
 */
async function extractErrorMessage(res: Response): Promise<string> {
  const body = await res
    .json()
    .catch(() => null) as { error?: unknown; message?: unknown } | null
  if (body !== null) {
    const message = typeof body.message === 'string' ? body.message : ''
    const code = typeof body.error === 'string' ? body.error : ''
    if (message && code) return `${code}: ${message}`
    if (message) return message
    if (code) return code
  }
  return `HTTP ${res.status}`
}

function PageMetadataModal(props: PageMetadataModalProps): ReactElement | null {
  const { slug, open, onClose, onSaved } = props

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form fields
  const [newSlugValue, setNewSlugValue] = useState(slug)
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [sectionCount, setSectionCount] = useState(0)

  // Original page data, captured from the read response so we can POST a
  // full Page on Save (the storage adapter overwrites the whole draft on
  // `saveDraft`, so we MUST send back every section we didn't touch).
  const [originalSections, setOriginalSections] = useState<
    ReadonlyArray<MetadataSection>
  >([])

  // Optional top-level Page metadata fields (`tags`, `excerpt`,
  // `coverImage`, `publishedAt`). This modal does not expose UI for editing
  // them directly, but it MUST round-trip them on Save — otherwise opening
  // the modal on a blog post and clicking Save wipes `tags` and
  // `publishedAt` from the persisted draft (whole-page overwrite again).
  const [originalMetadata, setOriginalMetadata] = useState<{
    readonly tags?: readonly string[]
    readonly excerpt?: string
    readonly coverImage?: ImageValue
    readonly publishedAt?: string
  }>({})

  // Fetch page data when the modal opens.
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)

    fetch(`/api/agntcms/page/read?slug=${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<unknown>
      })
      .then((body: unknown) => {
        const data = body as ReadPageResponse
        setNewSlugValue(data.page.slug)
        // `seo` is required at the domain layer. Defensive `?? ''` only
        // protects against a malformed on-disk page that slipped past the
        // validator (e.g. legacy content authored before the basic-SEO
        // contract); in healthy data both strings are non-empty.
        setSeoTitle(data.page.seo.title ?? '')
        setSeoDescription(data.page.seo.description ?? '')
        setSectionCount(data.page.sections.length)
        setOriginalSections(data.page.sections)
        // Capture the optional top-level metadata so the Save POST can
        // round-trip them. Build the snapshot via conditional assignment
        // (not `data.page.tags ?? []`) so an absent field stays absent —
        // `exactOptionalPropertyTypes` distinguishes `{ tags: [] }` from
        // `{}`, and we want the latter when there were no tags on disk.
        const meta: {
          tags?: readonly string[]
          excerpt?: string
          coverImage?: ImageValue
          publishedAt?: string
        } = {}
        if (data.page.tags !== undefined) meta.tags = data.page.tags
        if (data.page.excerpt !== undefined) meta.excerpt = data.page.excerpt
        if (data.page.coverImage !== undefined) meta.coverImage = data.page.coverImage
        if (data.page.publishedAt !== undefined) meta.publishedAt = data.page.publishedAt
        setOriginalMetadata(meta)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load page')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [open, slug])

  const handleSave = useCallback(() => {
    const trimmedSlug = newSlugValue.trim()
    if (!trimmedSlug) {
      setError('Slug cannot be empty.')
      return
    }
    if (!META_SLUG_PATTERN.test(trimmedSlug)) {
      setError('Invalid slug. Use only letters, numbers, hyphens, underscores, and forward slashes.')
      return
    }

    setSaving(true)
    setError(null)

    // Save SEO changes by POSTing the full page as a draft. SEO is
    // required at the domain layer (`assertValidPage`), so we always send
    // actual strings — the SEO-incomplete gate below blocks empty values
    // before we get here. On non-2xx, parse the handler's `{error,message}`
    // body so the user sees the validator's message ("seo.title must be a
    // non-empty string") instead of a bare HTTP code.
    //
    // The slug we POST is always the original `slug` (the slug the modal
    // opened with). If the user changed `newSlugValue` we issue a
    // follow-up `page/rename` after the save lands.
    //
    // Conditional spread keeps optional Page metadata fields
    // (`tags`/`publishedAt`/`excerpt`/`coverImage`) intact: without this,
    // the Save POST overwrites the draft with a slug+seo+sections-only
    // object and wipes them from the persisted page — round-trip data
    // loss in the editor's primary metadata flow.
    const saveBody = {
      slug,
      seo: { title: seoTitle, description: seoDescription },
      sections: originalSections,
      ...(originalMetadata.tags !== undefined ? { tags: originalMetadata.tags } : {}),
      ...(originalMetadata.excerpt !== undefined ? { excerpt: originalMetadata.excerpt } : {}),
      ...(originalMetadata.coverImage !== undefined ? { coverImage: originalMetadata.coverImage } : {}),
      ...(originalMetadata.publishedAt !== undefined ? { publishedAt: originalMetadata.publishedAt } : {}),
    }
    const saveDraft = fetch('/api/agntcms/draft/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saveBody),
    }).then(async (res) => {
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res))
      }
    })

    saveDraft
      .then(() => {
        if (trimmedSlug !== slug) {
          return fetch('/api/agntcms/page/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fromSlug: slug, toSlug: trimmedSlug }),
          }).then(async (res) => {
            if (!res.ok) throw new Error(await extractErrorMessage(res))
          })
        }
        return undefined
      })
      .then(() => {
        onSaved()
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Save failed')
      })
      .finally(() => {
        setSaving(false)
      })
  }, [
    slug,
    newSlugValue,
    seoTitle,
    seoDescription,
    originalSections,
    originalMetadata,
    onSaved,
  ])

  // Mirror the server-side basic-SEO contract: `seo.title` and
  // `seo.description` must be non-empty after trimming. Without this
  // gate, clearing both fields and clicking Save returns a 400 with no
  // user-visible explanation; gating client-side surfaces the rule
  // before the round-trip.
  const seoTitleEmpty = seoTitle.trim() === ''
  const seoDescriptionEmpty = seoDescription.trim() === ''
  const seoIncomplete = seoTitleEmpty || seoDescriptionEmpty
  const saveDisabled = saving || loading || seoIncomplete

  const saveLabel = saving ? 'Saving...' : 'Save'

  const footer = (
    <div style={metaFooterStyle}>
      <button
        type="button"
        style={metaCancelButtonStyle}
        onClick={onClose}
      >
        Cancel
      </button>
      <button
        type="button"
        style={
          saveDisabled
            ? { ...metaSaveButtonStyle, opacity: 0.5, cursor: 'not-allowed' }
            : metaSaveButtonStyle
        }
        disabled={saveDisabled}
        onClick={handleSave}
        // Conditional spread because `title={undefined}` trips
        // `exactOptionalPropertyTypes` — DOM `title` is `string`, not
        // `string | undefined`.
        {...(seoIncomplete
          ? { title: 'SEO title and description are required before saving.' }
          : {})}
        data-testid="agntcms-meta-save"
      >
        {saveLabel}
      </button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span style={metaTitleStyle}>Page metadata</span>}
      footer={footer}
      ariaLabel="Page metadata"
      zIndex={100001}
      maxWidth={520}
    >
      {loading ? (
        <div style={metaLoadingStyle}>Loading...</div>
      ) : error && !seoTitle && !seoDescription && sectionCount === 0 ? (
        <div style={metaErrorStyle}>{error}</div>
      ) : (
        <div style={metaFormStyle}>
          {error && <div style={metaInlineErrorStyle}>{error}</div>}

          <div style={metaFieldGroupStyle}>
            <label style={metaLabelStyle}>Slug</label>
            <input
              type="text"
              value={newSlugValue}
              onChange={(e) => setNewSlugValue(e.target.value)}
              style={metaInputStyle}
              data-testid="agntcms-meta-slug"
            />
          </div>

          <div style={metaFieldGroupStyle}>
            <label style={metaLabelStyle}>SEO Title</label>
            <input
              type="text"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              style={metaInputStyle}
              data-testid="agntcms-meta-seo-title"
            />
          </div>

          <div style={metaFieldGroupStyle}>
            <label style={metaLabelStyle}>SEO Description</label>
            <textarea
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              style={metaTextareaStyle}
              rows={3}
              data-testid="agntcms-meta-seo-description"
            />
          </div>

          <div style={metaInfoStyle}>
            {sectionCount} {sectionCount === 1 ? 'section' : 'sections'}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// DuplicatePageModal — prompt for a new slug, POST to /page/duplicate, then
// navigate to the clone (handled by the parent via onDone).
// ---------------------------------------------------------------------------

interface DuplicatePageModalProps {
  readonly sourceSlug: string
  /** Current list of slugs (published + draft) for quick client-side
   *  collision detection; server performs the authoritative check. */
  readonly existingSlugs: readonly string[]
  readonly onClose: () => void
  readonly onDone: (newSlug: string) => void
}

function DuplicatePageModal(props: DuplicatePageModalProps): ReactElement {
  const { sourceSlug, existingSlugs, onClose, onDone } = props

  // Prefill with `<slug>-copy`; most users will want to adjust but a sensible
  // default avoids making them type the original slug back in.
  const [newSlug, setNewSlug] = useState(() => `${sourceSlug}-copy`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = newSlug.trim()

  // Client-side validation mirrors server-side rules. The server re-checks,
  // so any drift is not a correctness bug — only a UX issue.
  const clientError = ((): string | null => {
    if (trimmed === '') return 'Slug cannot be empty.'
    if (!META_SLUG_PATTERN.test(trimmed)) {
      return 'Use only letters, numbers, hyphens, underscores, and forward slashes.'
    }
    if (trimmed === sourceSlug) return 'New slug must differ from the source.'
    if (existingSlugs.includes(trimmed)) return `Slug "${trimmed}" is already in use.`
    return null
  })()

  const disabled = busy || clientError !== null

  const handleSubmit = useCallback(() => {
    if (disabled) return
    setBusy(true)
    setError(null)
    fetch('/api/agntcms/page/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: sourceSlug, newSlug: trimmed }),
    })
      .then(async (res) => {
        if (res.status === 409) {
          setBusy(false)
          setError(`Slug "${trimmed}" is already in use. Try a different one.`)
          return
        }
        if (!res.ok) {
          const msg = await res.text().catch(() => '')
          setBusy(false)
          setError(msg || `Clone failed: HTTP ${res.status}`)
          return
        }
        // Success — parent decides what to do next (refresh + navigate).
        onDone(trimmed)
      })
      .catch((err: unknown) => {
        setBusy(false)
        setError(err instanceof Error ? err.message : 'Clone failed')
      })
  }, [disabled, sourceSlug, trimmed, onDone])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const footer = (
    <div style={metaFooterStyle}>
      <button
        type="button"
        style={metaCancelButtonStyle}
        onClick={onClose}
        disabled={busy}
      >
        Cancel
      </button>
      <button
        type="button"
        style={
          disabled
            ? { ...metaSaveButtonStyle, opacity: 0.5, cursor: 'not-allowed' }
            : metaSaveButtonStyle
        }
        disabled={disabled}
        onClick={handleSubmit}
        data-testid="agntcms-page-clone-confirm"
      >
        {busy ? 'Cloning...' : 'Clone'}
      </button>
    </div>
  )

  return (
    <Modal
      open={true}
      onClose={busy ? () => {} : onClose}
      title={<span style={metaTitleStyle}>Clone page</span>}
      footer={footer}
      ariaLabel="Clone page"
      zIndex={100001}
      maxWidth={480}
      maxHeight="auto"
    >
      <div style={metaFormStyle}>
        <div style={metaFieldGroupStyle}>
          <label style={metaLabelStyle}>
            New slug (source: &ldquo;{sourceSlug}&rdquo;)
          </label>
          <input
            type="text"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            onKeyDown={handleKeyDown}
            style={metaInputStyle}
            autoFocus
            data-testid="agntcms-page-clone-slug"
          />
          {clientError !== null && (
            <div style={metaInlineErrorStyle}>{clientError}</div>
          )}
        </div>
        {error !== null && <div style={metaInlineErrorStyle}>{error}</div>}
      </div>
    </Modal>
  )
}

// -- PageMetadataModal styles --

const metaTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
}

const metaLoadingStyle: CSSProperties = {
  padding: '32px 0',
  textAlign: 'center',
  fontSize: 14,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
}

const metaErrorStyle: CSSProperties = {
  padding: '32px 0',
  textAlign: 'center',
  fontSize: 14,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-danger)',
}

const metaInlineErrorStyle: CSSProperties = {
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-danger)',
  marginBottom: 12,
}

const metaFormStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

const metaFieldGroupStyle: CSSProperties = {
  marginBottom: 16,
}

const metaLabelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-muted)',
  marginBottom: 4,
}

const metaInputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
  background: 'var(--agntcms-admin-surface-raised)',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 6,
  outline: 'none',
  boxSizing: 'border-box',
}

const metaTextareaStyle: CSSProperties = {
  ...metaInputStyle,
  resize: 'vertical',
}

const metaInfoStyle: CSSProperties = {
  fontSize: 12,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
}

const metaFooterStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  width: '100%',
}

const metaCancelButtonStyle: CSSProperties = {
  padding: '6px 16px',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-muted)',
  background: 'none',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 4,
  cursor: 'pointer',
}

const metaSaveButtonStyle: CSSProperties = {
  padding: '6px 16px',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-accent-fg)',
  background: 'var(--agntcms-admin-accent)',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
}

// Unpublish confirmation dialog styles. Kept separate from the delete-red
// variants because unpublish is a reversible, non-destructive action.
const unpublishTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--agntcms-admin-fg)',
  fontFamily: 'var(--font-body, sans-serif)',
}

const unpublishBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const unpublishParagraphStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--agntcms-admin-fg-muted)',
  fontFamily: 'var(--font-body, sans-serif)',
}

const unpublishConfirmButtonStyle: CSSProperties = {
  padding: '6px 16px',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-accent-fg)',
  background: 'var(--agntcms-admin-accent)',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
}

// ---------------------------------------------------------------------------
// GlobalEditModal — sub-modal for viewing and editing a global's data.
// Private to this file. Uses the shared Modal shell layered above AdminModal.
// ---------------------------------------------------------------------------

interface GlobalEditModalProps {
  readonly name: string
  readonly open: boolean
  readonly onClose: () => void
  readonly onSaved: () => void
  /**
   * When provided and the global's `type` matches a registered definition,
   * the modal renders the actual section component with inline editable
   * fields — identical UX to editing a page section. When missing (or no
   * matching definition), the modal falls back to a generic field form.
   */
  readonly definitions?: readonly DefinitionLike[]
  /**
   * Optional pre-known global type. When the caller already has the type
   * (from a previously fetched list), passing it in lets us compute
   * `inlineMode` — and therefore the Modal's `maxWidth` — correctly on the
   * very first render, avoiding a visible width snap once the `read` fetch
   * resolves. The fetch still runs and is still the source of truth: on
   * success it overwrites `globalType`.
   */
  readonly initialType?: string
  /**
   * Hint from the caller that a draft exists for this name. When true,
   * the modal fetches `?mode=draft` so the user picks up where they
   * last saved; when false (or absent) it fetches the live published
   * global. This is a hint only — when `?mode=draft` is sent but no
   * draft exists on disk (e.g. another tab discarded it), the read
   * endpoint transparently falls back to the published bucket, so a
   * stale hint is graceful, not destructive.
   */
  readonly initialHasDraft?: boolean
}

/** Shape returned by GET /api/agntcms/global/read */
interface ReadGlobalResponse {
  readonly global: {
    readonly name: string
    readonly type: string
    readonly data: Readonly<Record<string, unknown>>
  }
}

/** Detect image-like objects (have a `src` key). */
function isImageValue(val: unknown): val is { src: string; alt?: string } {
  return (
    typeof val === 'object' &&
    val !== null &&
    'src' in val &&
    typeof (val as Record<string, unknown>)['src'] === 'string'
  )
}

// ---------------------------------------------------------------------------
// PreviewField wrapping for inline editing.
//
// In the page flow, `getContent` wraps every field value in a PreviewField
// so `EditableText` / `EditableImage` detect preview mode via the
// `__agntcmsPreview` brand (see runtime/getContent.ts:wrapSectionData and
// react/editable/isPreviewField.ts).
//
// The Edit-global flow bypasses `getContent` — we fetch the global directly
// over HTTP — so we replicate the wrapping here, structurally and
// client-side, so the editable components behave the same. The shape
// matches `PreviewFieldLike<T>` by construction; react/editable uses a
// structural brand check, not nominal typing.
//
// `pageSlug` is not meaningful for globals — we use a sentinel that makes
// it obvious in any debug output. `source` is 'draft' because globals in
// v1 have no draft/publish cycle (they save directly), but every in-memory
// copy a user might edit is conceptually unpublished work. `revision` is
// the global's name — globals don't carry revision hashes, and the origin
// is only consumed by the save callback we control below, which ignores
// revision.
// ---------------------------------------------------------------------------

/** @internal Exported for unit tests only. Not re-exported through any barrel. */
export function wrapGlobalData(
  globalName: string,
  data: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const wrapped: Record<string, unknown> = {}
  for (const key of Object.keys(data)) {
    const origin: PreviewFieldOriginLike = {
      pageSlug: `__global__:${globalName}`,
      sectionId: globalName,
      fieldPath: key,
      source: 'draft',
      revision: globalName,
    }
    wrapped[key] = {
      __agntcmsPreview: true,
      value: data[key],
      origin,
    }
  }
  return wrapped
}

function GlobalEditModal(props: GlobalEditModalProps): ReactElement | null {
  const { name, open, onClose, onSaved, definitions, initialType, initialHasDraft } = props

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Seed `globalType` with the caller-provided value so `inlineMode`
  // resolves to its final boolean on the very first render. Without this,
  // the Modal's `maxWidth` would render at the fallback 520, then snap to
  // 960 after the read fetch resolves — a visible horizontal jump.
  const [globalType, setGlobalType] = useState(initialType ?? '')
  const [fields, setFields] = useState<Record<string, unknown>>({})

  // Fetch global data when the modal opens. When the caller hinted that a
  // draft exists for this name, request the draft bucket so the user sees
  // their last-saved edits (the read endpoint falls back to published if
  // the hint is stale and no draft is present).
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)

    const modeQuery = initialHasDraft === true ? '&mode=draft' : ''
    fetch(`/api/agntcms/global/read?name=${encodeURIComponent(name)}${modeQuery}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<unknown>
      })
      .then((body: unknown) => {
        const data = body as ReadGlobalResponse
        setGlobalType(data.global.type)
        setFields({ ...data.global.data })
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load global')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [open, name, initialHasDraft])

  const updateField = useCallback((key: string, value: unknown) => {
    setFields((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = useCallback(() => {
    setSaving(true)
    setError(null)

    // Editor saves go to the draft bucket; the user later promotes the
    // draft from the Globals tab's Publish button (or from the in-page
    // PreviewToolbar when v0.2 adds the global publish surface there).
    fetch('/api/agntcms/global-draft/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type: globalType, data: fields }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`)
        onSaved()
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Save failed')
      })
      .finally(() => {
        setSaving(false)
      })
  }, [name, globalType, fields, onSaved])

  // Inline-field save for the section-component render path. Mirrors the
  // `globalRef` branch in preview/SectionEditControls.tsx: patch the named
  // field locally, POST the full global, then call onSaved so the outer
  // list refreshes and the modal closes. Edits happen per-field, matching
  // page-section UX — no explicit Save button needed.
  const saveFieldInline = useCallback<SaveFieldFn>(
    (origin, newValue) => {
      const updated = { ...fields, [origin.fieldPath]: newValue }
      // Optimistic local update so the modal re-renders the new value
      // immediately. The POST fires in parallel — onSaved on success.
      // Same draft-routing rule as the bottom-Save button: editor edits
      // write to the draft bucket, never directly to the live global.
      setFields(updated)

      fetch('/api/agntcms/global-draft/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: globalType, data: updated }),
      })
        .then((res) => {
          if (!res.ok) {
            // eslint-disable-next-line no-restricted-globals
            void res.text().then((t) => alert(`Failed to save global: ${t}`))
            return
          }
          onSaved()
        })
        .catch(() => {
          // eslint-disable-next-line no-restricted-globals
          alert('Failed to save global.')
        })
    },
    [fields, name, globalType, onSaved],
  )

  // Decide rendering mode: inline section-component editing requires
  // a registered definition for the global's `type`. Absent that, we fall
  // back to the legacy generic field form so nothing regresses for globals
  // whose type is unknown or for callers that don't plumb `definitions`
  // through PreviewToolbar yet.
  const matchingDefinition = useMemo(() => {
    if (!definitions || globalType === '') return null
    return definitions.find((d) => d.name === globalType) ?? null
  }, [definitions, globalType])

  const fieldKeys = Object.keys(fields)
  const inlineMode = matchingDefinition !== null

  // Inline mode has no bottom Save button (saves happen per-field).
  // The fallback form keeps its Save+Cancel footer.
  const footer = inlineMode ? (
    <div style={metaFooterStyle}>
      <button type="button" style={metaCancelButtonStyle} onClick={onClose}>
        Close
      </button>
    </div>
  ) : (
    <div style={metaFooterStyle}>
      <button type="button" style={metaCancelButtonStyle} onClick={onClose}>
        Cancel
      </button>
      <button
        type="button"
        style={
          saving || loading
            ? { ...metaSaveButtonStyle, opacity: 0.5, cursor: 'not-allowed' }
            : metaSaveButtonStyle
        }
        disabled={saving || loading}
        onClick={handleSave}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span style={metaTitleStyle}>Edit global</span>}
      footer={footer}
      ariaLabel="Edit global"
      zIndex={100001}
      maxWidth={inlineMode ? 960 : 520}
    >
      {loading ? (
        <div style={metaLoadingStyle}>Loading...</div>
      ) : error && fieldKeys.length === 0 ? (
        <div style={metaErrorStyle}>{error}</div>
      ) : (
        <div style={metaFormStyle}>
          {error && <div style={metaInlineErrorStyle}>{error}</div>}

          <div style={metaFieldGroupStyle}>
            <label style={metaLabelStyle}>Name</label>
            <div style={geReadOnlyStyle}>{name}</div>
          </div>

          <div style={metaFieldGroupStyle}>
            <label style={metaLabelStyle}>Type</label>
            <div style={geReadOnlyStyle}>{globalType}</div>
          </div>

          {inlineMode && matchingDefinition !== null ? (
            <GlobalSectionPreview
              globalName={name}
              globalType={globalType}
              data={fields}
              definitions={definitions as readonly DefinitionLike[]}
              saveField={saveFieldInline}
            />
          ) : fieldKeys.length === 0 ? (
            <div style={metaInfoStyle}>No fields. Save the global with data to see fields here.</div>
          ) : (
            fieldKeys.map((key) => {
              const val = fields[key]

              if (typeof val === 'string') {
                return (
                  <div key={key} style={metaFieldGroupStyle}>
                    <label style={metaLabelStyle}>{key}</label>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => updateField(key, e.target.value)}
                      style={metaInputStyle}
                      data-testid={`agntcms-global-field-${key}`}
                    />
                  </div>
                )
              }

              if (isImageValue(val)) {
                return (
                  <div key={key} style={metaFieldGroupStyle}>
                    <label style={metaLabelStyle}>{key}</label>
                    <input
                      type="text"
                      placeholder="src"
                      value={val.src}
                      onChange={(e) =>
                        updateField(key, { ...val, src: e.target.value })
                      }
                      style={{ ...metaInputStyle, marginBottom: 4 }}
                      data-testid={`agntcms-global-field-${key}-src`}
                    />
                    <input
                      type="text"
                      placeholder="alt"
                      value={val.alt ?? ''}
                      onChange={(e) =>
                        updateField(key, { ...val, alt: e.target.value })
                      }
                      style={metaInputStyle}
                      data-testid={`agntcms-global-field-${key}-alt`}
                    />
                  </div>
                )
              }

              // Fallback: JSON textarea for complex or unknown values.
              return (
                <div key={key} style={metaFieldGroupStyle}>
                  <label style={metaLabelStyle}>{key}</label>
                  <textarea
                    value={JSON.stringify(val, null, 2)}
                    onChange={(e) => {
                      try {
                        updateField(key, JSON.parse(e.target.value) as unknown)
                      } catch {
                        // Keep the raw text while the user is typing invalid JSON.
                        // The field will remain at its last valid parsed value.
                      }
                    }}
                    style={metaTextareaStyle}
                    rows={4}
                    data-testid={`agntcms-global-field-${key}-json`}
                  />
                </div>
              )
            })
          )}
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// GlobalSectionPreview — renders the real section component with inline
// editable fields, wrapped in a SaveProvider that routes saves to the
// global endpoint. Pulled out of GlobalEditModal to keep the latter focused
// on loading/form state; this component does the actual render.
//
// The section's `id` is set to the global's name and `type` to the global's
// type. We wrap each data field as PreviewField so EditableText /
// EditableImage descendants detect preview mode structurally — exactly the
// same mechanism as a page in preview mode (see runtime/getContent.ts).
// ---------------------------------------------------------------------------

interface GlobalSectionPreviewProps {
  readonly globalName: string
  readonly globalType: string
  readonly data: Readonly<Record<string, unknown>>
  readonly definitions: readonly DefinitionLike[]
  readonly saveField: SaveFieldFn
}

function GlobalSectionPreview(
  props: GlobalSectionPreviewProps,
): ReactElement {
  const { globalName, globalType, data, definitions, saveField } = props

  // Wrap every field as PreviewField so EditableText / EditableImage inside
  // the section component see preview-mode values. Memoized on `data` so
  // typing inside a field doesn't recreate every wrapper on every keystroke.
  const wrappedData = useMemo(
    () => wrapGlobalData(globalName, data),
    [globalName, data],
  )

  const section = useMemo(
    () => ({
      id: globalName,
      type: globalType,
      data: wrappedData,
    }),
    [globalName, globalType, wrappedData],
  )

  // SectionRenderer expects AnySectionDefinition[] (full shape with schema +
  // defaults). At runtime the definitions passed in are real definitions;
  // only the DefinitionLike subset is part of the client contract. Same
  // cast pattern as preview/SectionEditControls.tsx line 252.
  const rendererDefs = definitions as unknown as SectionRendererProps['definitions']

  return (
    <SaveProvider saveField={saveField}>
      {/* Cancel anchor navigation but let inner editable widgets receive the
          click — matches the page-editing path in
          preview/SectionEditControls.tsx so editing a global behaves the same
          as editing a section on a page (clicking a link opens its inline
          editor instead of navigating away). */}
      <div
        style={previewContainerStyle}
        onClickCapture={(e) => {
          const anchor = (e.target as HTMLElement).closest('a')
          if (anchor === null) return
          if (anchor.closest('[data-agntcms-section-control]') !== null) return
          e.preventDefault()
        }}
      >
        <SectionRenderer section={section} definitions={rendererDefs} />
      </div>
    </SaveProvider>
  )
}

// -- GlobalEditModal styles --

const geReadOnlyStyle: CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  background: 'var(--agntcms-admin-surface-raised)',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 6,
  boxSizing: 'border-box',
}

// Box around the rendered section component in inline mode. The bordered
// container visually separates the live preview from the metadata rows
// above it and gives the section a contained render surface at the modal's
// width (without it, wide sections could visually bleed into the chrome).
const previewContainerStyle: CSSProperties = {
  marginTop: 8,
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 8,
  overflow: 'auto',
  background: 'var(--agntcms-admin-surface)',
}

// ---------------------------------------------------------------------------
// PageHistoryModal — sub-modal that lists a page's version history with
// diff badges, previews the selected snapshot, and offers restore (rollback).
//
// Data flow:
//   1. GET /api/agntcms/page/history?slug=<slug>  → entries list (newest-first)
//   2. For each entry: GET /api/agntcms/page/history?slug=<slug>&ts=<timestamp>
//      → full Page body (used for diff + preview).
//   3. GET /api/agntcms/page/read?slug=<slug>     → currently-published page,
//      used as the "next" side of the diff for the newest history entry.
//
// We fetch all snapshot bodies up front on open. History is per-page and in
// practice short — typically a handful to a few dozen entries for a v1
// single-editor workflow. If this becomes a hotspot we can switch to
// on-demand + streaming; for now the simpler code path wins.
//
// Diff semantics: each entry is diffed against the NEXT-OLDER entry (i.e.
// "what changed to produce this snapshot"). The newest entry is diffed
// against the currently-published page ("what changed after this snapshot",
// negated). This matches how a reader skims history: each row answers
// "what was different here vs. the previous version".
// ---------------------------------------------------------------------------

interface PageHistoryModalProps {
  readonly slug: string
  readonly open: boolean
  readonly onClose: () => void
  readonly onRollbackDone: () => void
  readonly definitions?: readonly DefinitionLike[]
}

interface HistoryEntrySummary {
  readonly slug: string
  readonly timestamp: string
  readonly size: number
}

/** @internal Exported for unit tests only. Not re-exported through any barrel. */
export function formatTimestampLabel(timestamp: string): string {
  // History filenames use '-' instead of ':' for filesystem safety, so
  // they don't parse as valid Dates directly. Reverse the substitution in
  // the time portion to recover an ISO string.
  //
  // e.g. "2026-04-12T16-00-00.000Z" → "2026-04-12T16:00:00.000Z"
  const recovered = timestamp.replace(
    /T(\d{2})-(\d{2})-(\d{2})/,
    'T$1:$2:$3',
  )
  const d = new Date(recovered)
  if (isNaN(d.getTime())) return timestamp
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function PageHistoryModal(props: PageHistoryModalProps): ReactElement | null {
  const { slug, open, onClose, onRollbackDone, definitions } = props

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<readonly HistoryEntrySummary[]>([])
  // Snapshot bodies keyed by timestamp. Plus the currently-published page
  // at the sentinel key '' (empty string) — used as the "next" side of the
  // diff for the newest history entry.
  const [bodies, setBodies] = useState<Readonly<Record<string, Page>>>({})
  // Selected timestamp for the preview pane; defaults to the newest entry
  // once the data lands.
  const [selected, setSelected] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  // Guards the confirmation inline row: user clicks "Restore", sees the
  // confirm, then "Yes" to actually POST rollback. Prevents a double-click
  // from reverting a page by accident.
  const [confirmTs, setConfirmTs] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setEntries([])
    setBodies({})
    setSelected(null)
    setConfirmTs(null)

    let cancelled = false

    async function load(): Promise<void> {
      try {
        const listRes = await fetch(
          `/api/agntcms/page/history?slug=${encodeURIComponent(slug)}`,
        )
        if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`)
        const listBody = (await listRes.json()) as {
          entries: readonly HistoryEntrySummary[]
        }
        if (cancelled) return

        const list = listBody.entries
        setEntries(list)
        if (list.length > 0) {
          const first = list[0]
          if (first) setSelected(first.timestamp)
        }

        // Fetch the currently-published page body, best-effort. A missing
        // page (404) is valid: the page may have been unpublished after
        // the last history snapshot, or it may only exist as a draft. We
        // represent that by omitting the '' key from `bodies`; the
        // newest-entry diff gracefully falls back to "[]" as the next
        // side (see computeEntryDiff).
        const currentPromise = fetch(
          `/api/agntcms/page/read?slug=${encodeURIComponent(slug)}`,
        )
          .then(async (res) => (res.ok ? ((await res.json()) as { page: Page }).page : null))
          .catch(() => null)

        // Fetch all snapshot bodies in parallel. For v1 history sizes this
        // is fine; switch to on-demand if usage grows.
        const bodyPromises = list.map(async (e) => {
          const res = await fetch(
            `/api/agntcms/page/history?slug=${encodeURIComponent(slug)}&ts=${encodeURIComponent(e.timestamp)}`,
          )
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${e.timestamp}`)
          const body = (await res.json()) as { page: Page }
          return [e.timestamp, body.page] as const
        })

        const [current, ...pairs] = await Promise.all([
          currentPromise,
          ...bodyPromises,
        ])
        if (cancelled) return

        const next: Record<string, Page> = {}
        for (const [ts, page] of pairs) next[ts] = page
        if (current !== null) next[''] = current
        setBodies(next)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load history')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [open, slug])

  // Compute the diff for an entry against the next-older entry, or — for
  // the newest entry (index 0) — against the currently-published page.
  // Returns null while bodies are still loading.
  const computeEntryDiff = useCallback(
    (index: number): SectionsDiff | null => {
      const entry = entries[index]
      if (!entry) return null
      const thisBody = bodies[entry.timestamp]
      if (!thisBody) return null

      if (index === 0) {
        // Newest entry: compare against the currently-published page.
        // Semantic: "what's different about this snapshot vs. what's live
        // right now". If there's no published page, treat the "next" side
        // as empty — the snapshot is the thing that got removed.
        const current = bodies['']
        const nextSections = current?.sections ?? []
        // prev=this (snapshot), next=current (live): flipping the perspective
        // here so the badges answer "what changed since this snapshot". That
        // matches the older-entries reading below, where the older snapshot
        // is `prev` and the newer is `next`.
        return diffSections(thisBody.sections, nextSections)
      }

      const olderEntry = entries[index + 1]
      if (!olderEntry) {
        // Oldest entry — nothing to compare against. Show "initial" as zeros.
        return { added: 0, removed: 0, modified: 0, moved: 0 }
      }
      const olderBody = bodies[olderEntry.timestamp]
      if (!olderBody) return null
      return diffSections(olderBody.sections, thisBody.sections)
    },
    [entries, bodies],
  )

  const handleRestoreClick = useCallback((ts: string) => {
    setConfirmTs(ts)
  }, [])

  const handleRestoreCancel = useCallback(() => {
    setConfirmTs(null)
  }, [])

  const handleRestoreConfirm = useCallback(
    (ts: string) => {
      setConfirmTs(null)
      setRestoring(true)
      setError(null)
      fetch('/api/agntcms/page/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, timestamp: ts }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Rollback failed: HTTP ${res.status}`)
          onRollbackDone()
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Rollback failed')
        })
        .finally(() => {
          setRestoring(false)
        })
    },
    [slug, onRollbackDone],
  )

  const selectedPage: Page | null =
    selected !== null ? bodies[selected] ?? null : null

  // Per-section diff status of the selected snapshot vs the currently-
  // published page. Drives the border/badge decoration in the preview
  // pane — this is strictly a presentation layer on top of what
  // `sectionDiffStatus` already computes. Baseline is the published page
  // (`bodies['']`); when it is absent (page unpublished or load pending),
  // we degrade to an empty baseline: the snapshot reads as entirely
  // "Added", which is the honest answer for "what would change if
  // restored from nothing".
  const { statusById, removedInTarget } = useMemo(() => {
    if (selectedPage === null) {
      return {
        statusById: new Map<string, SectionStatus>(),
        removedInTarget: [] as readonly RemovedSection[],
      }
    }
    const currentSections = bodies['']?.sections ?? []
    return sectionDiffStatus(currentSections, selectedPage.sections)
  }, [selectedPage, bodies])

  // Index of the history entry that corresponds to the currently-
  // published page, or -1 if none matches. Drives the "Current" badge
  // and hides the Restore button on that row — restoring the already-
  // live version is a no-op. Recomputes when entries or bodies change
  // (bodies stream in asynchronously on open).
  const currentEntryIndex = useMemo(
    () => findCurrentHistoryEntryIndex(entries, bodies, bodies[''] ?? null),
    [entries, bodies],
  )

  // Dismissible "sections not present in this snapshot" callout. Resets
  // whenever the selected snapshot changes so the user sees it again for
  // each distinct snapshot they inspect.
  const [removedDismissed, setRemovedDismissed] = useState(false)
  useEffect(() => {
    setRemovedDismissed(false)
  }, [selected])

  const inlineDefinitions = definitions
  // SectionRenderer expects AnySectionDefinition[]. At runtime the caller
  // passes real definitions; same cast pattern as GlobalSectionPreview above.
  const rendererDefs =
    inlineDefinitions !== undefined
      ? (inlineDefinitions as unknown as SectionRendererProps['definitions'])
      : undefined

  // Look up each section's schema by `type`. DefinitionLike is the
  // public (narrow) shape for the client API, but the objects passed in
  // at runtime are real SectionDefinitions that carry `schema`. Same
  // cast rationale as `rendererDefs` above: the narrower client type
  // doesn't expose it, but the runtime value has it. When the caller
  // omits `definitions` we leave the map empty and field-level diffs
  // degrade gracefully to the section-level "Modified" stripe only.
  const schemaByType = useMemo(() => {
    const map = new Map<string, SectionSchema>()
    if (!inlineDefinitions) return map
    type DefWithSchema = { name: string; schema?: SectionSchema }
    for (const d of inlineDefinitions as readonly DefWithSchema[]) {
      if (d.schema !== undefined) map.set(d.name, d.schema)
    }
    return map
  }, [inlineDefinitions])

  // Baseline sections indexed by id — the "currently-published" side of
  // the field diff. The baseline may be absent (page unpublished or load
  // pending), in which case every modified section still shows at the
  // section level; without a baseline there is nothing to diff against.
  const baselineSectionById = useMemo(() => {
    const map = new Map<string, Section>()
    const baseline = bodies['']?.sections ?? []
    for (const s of baseline) map.set(s.id, s)
    return map
  }, [bodies])

  const footer = (
    <div style={metaFooterStyle}>
      <button type="button" style={metaCancelButtonStyle} onClick={onClose}>
        Close
      </button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span style={historyTitleStyle}>Page history — {slug}</span>}
      footer={footer}
      ariaLabel="Page history"
      zIndex={100001}
      maxWidth={960}
    >
      {loading ? (
        <div style={metaLoadingStyle}>Loading...</div>
      ) : error && entries.length === 0 ? (
        <div style={metaErrorStyle}>{error}</div>
      ) : entries.length === 0 ? (
        <div style={metaInfoStyle}>
          No history yet. Publishing the page for the first time will create
          the first snapshot.
        </div>
      ) : (
        <div style={historyLayoutStyle}>
          <div style={historyListStyle} data-testid="agntcms-history-list">
            {error && <div style={metaInlineErrorStyle}>{error}</div>}
            {entries.map((entry, index) => {
              const diff = computeEntryDiff(index)
              const isSelected = selected === entry.timestamp
              const isCurrent = index === currentEntryIndex
              return (
                <div
                  key={entry.timestamp}
                  style={
                    isSelected ? historyEntrySelectedStyle : historyEntryStyle
                  }
                  data-testid={`agntcms-history-entry-${entry.timestamp}`}
                >
                  <button
                    type="button"
                    style={historyEntryButtonStyle}
                    onClick={() => setSelected(entry.timestamp)}
                  >
                    <span style={historyEntryLabelRowStyle}>
                      <span style={historyEntryLabelStyle}>
                        {formatTimestampLabel(entry.timestamp)}
                      </span>
                      {isCurrent ? (
                        <span
                          style={historyEntryCurrentBadgeStyle}
                          data-testid={`agntcms-history-current-${entry.timestamp}`}
                        >
                          Current
                        </span>
                      ) : null}
                    </span>
                    {isCurrent ? null : <HistoryDiffBadges diff={diff} />}
                  </button>
                  <div style={historyEntryActionsStyle}>
                    {isCurrent ? null : confirmTs === entry.timestamp ? (
                      <>
                        <span style={confirmTextStyle}>Restore?</span>
                        <button
                          type="button"
                          style={confirmYesStyle}
                          disabled={restoring}
                          onClick={() => handleRestoreConfirm(entry.timestamp)}
                          data-testid={`agntcms-history-restore-confirm-${entry.timestamp}`}
                        >
                          {restoring ? '...' : 'Yes'}
                        </button>
                        <button
                          type="button"
                          style={confirmNoStyle}
                          onClick={handleRestoreCancel}
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        style={editButtonStyle}
                        onClick={() => handleRestoreClick(entry.timestamp)}
                        data-testid={`agntcms-history-restore-${entry.timestamp}`}
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={historyPreviewStyle}>
            {selectedPage === null ? (
              <div style={metaInfoStyle}>Select a snapshot to preview.</div>
            ) : (
              <>
                {removedInTarget.length > 0 && !removedDismissed && (
                  <RemovedInSnapshotCallout
                    removed={removedInTarget}
                    onDismiss={() => setRemovedDismissed(true)}
                  />
                )}
                {rendererDefs === undefined ? (
                  // Without section definitions we can't render real
                  // components. Fall back to a compact list so the user
                  // still sees what's in the snapshot — decorate the same
                  // way as the real preview so both modes agree.
                  <div style={historyPreviewFallbackStyle}>
                    {selectedPage.sections.map((s) => {
                      const status = statusById.get(s.id) ?? 'unchanged'
                      return (
                        <SectionDiffDecorator
                          key={s.id}
                          status={status}
                          data-testid={`agntcms-history-section-${s.id}`}
                        >
                          <div style={historyPreviewFallbackRowStyle}>
                            <span style={typeBadgeStyle}>{s.type}</span>
                            <span style={historyPreviewFallbackIdStyle}>
                              {s.id}
                            </span>
                          </div>
                        </SectionDiffDecorator>
                      )
                    })}
                  </div>
                ) : (
                  // Read-only snapshot preview: cancel anchor navigation so
                  // clicking a link inside a rendered section can't navigate
                  // the window away from the open history modal. There are no
                  // inline editors here, so we simply suppress the click.
                  <div
                    style={previewContainerStyle}
                    onClickCapture={(e) => {
                      const anchor = (e.target as HTMLElement).closest('a')
                      if (anchor === null) return
                      e.preventDefault()
                    }}
                  >
                    {selectedPage.sections.map((section) => {
                      const status = statusById.get(section.id) ?? 'unchanged'
                      // Only compute field-level diff entries for modified
                      // sections with a matching schema AND a baseline
                      // section to compare against. Every guard below is a
                      // "silently degrade to section-level only" case.
                      let fieldDiffs: readonly FieldDiffEntry[] | undefined
                      if (status === 'modified') {
                        const baselineSection = baselineSectionById.get(section.id)
                        const schema = schemaByType.get(section.type)
                        if (baselineSection !== undefined && schema !== undefined) {
                          fieldDiffs = fieldDiff(
                            schema,
                            baselineSection.data as Readonly<
                              Record<string, unknown>
                            >,
                            section.data as Readonly<Record<string, unknown>>,
                          )
                        }
                      }
                      return (
                        <SectionDiffDecorator
                          key={section.id}
                          status={status}
                          {...(fieldDiffs !== undefined ? { fieldDiffs } : {})}
                          data-testid={`agntcms-history-section-${section.id}`}
                        >
                          <SectionRenderer
                            section={section}
                            definitions={rendererDefs}
                          />
                        </SectionDiffDecorator>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

// Diff badges for a single history entry. Dash when the diff is not yet
// computable (bodies still loading).
function HistoryDiffBadges(props: { readonly diff: SectionsDiff | null }): ReactElement {
  const { diff } = props
  if (diff === null) {
    return <span style={historyDiffMutedStyle}>—</span>
  }
  const parts: ReactElement[] = []
  if (diff.added > 0) {
    parts.push(
      <span key="added" style={historyDiffAddedStyle}>
        {'+'}{diff.added} added
      </span>,
    )
  }
  if (diff.removed > 0) {
    parts.push(
      <span key="removed" style={historyDiffRemovedStyle}>
        {'\u2212'}{diff.removed} removed
      </span>,
    )
  }
  if (diff.modified > 0) {
    parts.push(
      <span key="modified" style={historyDiffModifiedStyle}>
        {'~'}{diff.modified} modified
      </span>,
    )
  }
  if (diff.moved > 0) {
    parts.push(
      <span key="moved" style={historyDiffMovedStyle}>
        {'\u2195'}{diff.moved} moved
      </span>,
    )
  }
  if (parts.length === 0) {
    return <span style={historyDiffMutedStyle}>no changes</span>
  }
  return <span style={historyDiffContainerStyle}>{parts}</span>
}

// Wrapper placed around each rendered section in the preview pane. Adds
// a colored left border and a small status badge in the top-right. We
// never modify `SectionRenderer` or the registry — the decoration lives
// only in this modal. "Unchanged" renders with zero visual noise.
//
// For `modified` sections the caller can optionally pass a field-diff
// list; when present, we render a FieldDiffPanel BELOW the section so
// the reader first sees the snapshot, then what specifically changed.
// When the list is empty or omitted (e.g. schema not available), the
// section-level "Modified" stripe is the only signal.
function SectionDiffDecorator(props: {
  readonly status: SectionStatus
  readonly children: ReactElement
  readonly fieldDiffs?: readonly FieldDiffEntry[]
  readonly 'data-testid'?: string
}): ReactElement {
  const { status, children, fieldDiffs } = props
  const testId = props['data-testid']
  if (status === 'unchanged') {
    return (
      <div
        style={sectionDecoratorUnchangedStyle}
        data-testid={testId}
        data-agntcms-diff-status={status}
      >
        {children}
      </div>
    )
  }
  const containerStyle =
    status === 'added'
      ? sectionDecoratorAddedStyle
      : status === 'modified'
      ? sectionDecoratorModifiedStyle
      : sectionDecoratorMovedStyle
  const labelStyle =
    status === 'added'
      ? sectionDecoratorAddedLabelStyle
      : status === 'modified'
      ? sectionDecoratorModifiedLabelStyle
      : sectionDecoratorMovedLabelStyle
  const label =
    status === 'added' ? 'Added' : status === 'modified' ? 'Modified' : 'Moved'
  return (
    <div
      style={containerStyle}
      data-testid={testId}
      data-agntcms-diff-status={status}
    >
      <span style={labelStyle}>{label}</span>
      {children}
      {status === 'modified' && fieldDiffs && fieldDiffs.length > 0 ? (
        <FieldDiffPanel entries={fieldDiffs} />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FieldDiffPanel — renders the per-field word-level diff list below a
// modified section in the history preview pane. Invoked only by
// SectionDiffDecorator; kept next to it so layout + styles live in one
// place. See fieldDiff.ts for how entries are produced.
//
// Image fields split into two sub-rows (filename, alt). When the
// filename changed we also show before/after thumbnails via the
// canonical `/assets/<filename>` URL — same pipeline the editable
// image component uses (react/editable/EditableImage.tsx). There is
// no runtime admin-context lookup to do, so this cannot degrade
// below the filename-only path; an image that no longer exists on
// disk will render as a broken thumbnail, which is the honest
// signal.
// ---------------------------------------------------------------------------

function FieldDiffPanel(props: {
  readonly entries: readonly FieldDiffEntry[]
}): ReactElement {
  const { entries } = props
  return (
    <div
      style={fieldDiffPanelStyle}
      data-testid="agntcms-history-field-diff"
    >
      {entries.map((entry) => (
        <FieldDiffRow key={entry.fieldName} entry={entry} />
      ))}
    </div>
  )
}

function FieldDiffRow(props: { readonly entry: FieldDiffEntry }): ReactElement {
  const { entry } = props
  if (entry.kind === 'image') {
    // Two sub-rows: filename (with optional thumbnails) and alt.
    // A sub-row is omitted when its ops list is empty — one side of
    // the image can legitimately be unchanged while the other flips.
    return (
      <div
        style={fieldDiffRowStyle}
        data-field-name={entry.fieldName}
        data-field-kind="image"
      >
        <span style={fieldDiffNameStyle}>{entry.fieldName}:</span>
        <div style={fieldDiffImageBodyStyle}>
          {entry.filenameOps.length > 0 ? (
            <div style={fieldDiffImageSubRowStyle}>
              <span style={fieldDiffSubLabelStyle}>filename:</span>
              <span style={fieldDiffOpsStyle}>
                <WordDiffOps ops={entry.filenameOps} />
              </span>
              <span style={fieldDiffThumbRowStyle}>
                {entry.beforeFilename !== '' ? (
                  <img
                    src={`/assets/${entry.beforeFilename}`}
                    alt=""
                    style={fieldDiffThumbBeforeStyle}
                  />
                ) : null}
                {entry.afterFilename !== '' ? (
                  <img
                    src={`/assets/${entry.afterFilename}`}
                    alt=""
                    style={fieldDiffThumbAfterStyle}
                  />
                ) : null}
              </span>
            </div>
          ) : null}
          {entry.altOps.length > 0 ? (
            <div style={fieldDiffImageSubRowStyle}>
              <span style={fieldDiffSubLabelStyle}>alt:</span>
              <span style={fieldDiffOpsStyle}>
                <WordDiffOps ops={entry.altOps} />
              </span>
            </div>
          ) : null}
        </div>
      </div>
    )
  }
  // text / richText / reference — all render as a single word-diff line.
  return (
    <div
      style={fieldDiffRowStyle}
      data-field-name={entry.fieldName}
      data-field-kind={entry.kind}
    >
      <span style={fieldDiffNameStyle}>{entry.fieldName}:</span>
      <span style={fieldDiffOpsStyle}>
        <WordDiffOps ops={entry.ops} />
      </span>
    </div>
  )
}

function WordDiffOps(props: { readonly ops: readonly WordDiffOp[] }): ReactElement {
  const { ops } = props
  return (
    <>
      {ops.map((op, i) => {
        const style =
          op.kind === 'add'
            ? wordDiffAddStyle
            : op.kind === 'remove'
            ? wordDiffRemoveStyle
            : wordDiffEqualStyle
        return (
          <span key={i} style={style}>
            {op.text}
          </span>
        )
      })}
    </>
  )
}

// Compact callout shown above the preview list when the snapshot omits
// sections that exist in the currently-published page. Dismissible per
// snapshot selection. Type + id pairs only — any more detail belongs in
// a dedicated diff view.
function RemovedInSnapshotCallout(props: {
  readonly removed: readonly RemovedSection[]
  readonly onDismiss: () => void
}): ReactElement {
  const { removed, onDismiss } = props
  return (
    <div
      style={removedCalloutStyle}
      data-testid="agntcms-history-removed-callout"
    >
      <span style={removedCalloutLabelStyle}>Not in this snapshot:</span>
      <span style={removedCalloutListStyle}>
        {removed.map((r, i) => (
          <span key={r.id} style={removedCalloutItemStyle}>
            <span style={typeBadgeStyle}>{r.type}</span>
            <span style={historyPreviewFallbackIdStyle}>{r.id}</span>
            {i < removed.length - 1 ? (
              <span style={removedCalloutSeparatorStyle}>,</span>
            ) : null}
          </span>
        ))}
      </span>
      <button
        type="button"
        style={removedCalloutDismissStyle}
        onClick={onDismiss}
        aria-label="Dismiss removed-sections callout"
        data-testid="agntcms-history-removed-dismiss"
      >
        {'\u00D7'}
      </button>
    </div>
  )
}

// -- PageHistoryModal styles --

const historyTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
}

const historyLayoutStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(280px, 1fr) 2fr',
  gap: 16,
  minHeight: 320,
}

const historyListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  maxHeight: '60vh',
  overflowY: 'auto',
  paddingRight: 4,
}

const historyEntryStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 6,
  background: 'var(--agntcms-admin-surface-raised)',
}

const historyEntrySelectedStyle: CSSProperties = {
  ...historyEntryStyle,
  borderColor: 'var(--agntcms-admin-accent)',
}

const historyEntryButtonStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  textAlign: 'left',
}

const historyEntryLabelStyle: CSSProperties = {
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
}

// Row containing the timestamp label and the optional "Current" badge.
// Keeps them aligned on the same baseline without stretching the badge.
const historyEntryLabelRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  maxWidth: '100%',
}

// "Current" badge — same visual weight as the diff badges
// (`historyDiffAddedStyle` et al.) but painted in the brand/primary
// color to make the "this is the live version" signal unmistakable.
const historyEntryCurrentBadgeStyle: CSSProperties = {
  color: 'var(--agntcms-admin-accent)',
  background: 'var(--agntcms-admin-accent-tint)',
  padding: '1px 6px',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: 'var(--font-body, sans-serif)',
  fontWeight: 600,
  flexShrink: 0,
}

const historyEntryActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
}

const historyDiffContainerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  fontSize: 11,
  fontFamily: 'var(--font-body, sans-serif)',
}

const historyDiffAddedStyle: CSSProperties = {
  color: 'var(--agntcms-admin-success)',
  background: 'var(--agntcms-admin-success-tint)',
  padding: '1px 6px',
  borderRadius: 4,
  fontWeight: 600,
}

const historyDiffRemovedStyle: CSSProperties = {
  color: 'var(--agntcms-admin-danger)',
  background: 'var(--agntcms-admin-danger-tint)',
  padding: '1px 6px',
  borderRadius: 4,
  fontWeight: 600,
}

const historyDiffModifiedStyle: CSSProperties = {
  color: 'var(--agntcms-admin-warning)',
  background: 'var(--agntcms-admin-warning-tint)',
  padding: '1px 6px',
  borderRadius: 4,
  fontWeight: 600,
}

const historyDiffMovedStyle: CSSProperties = {
  color: 'var(--agntcms-admin-accent)',
  background: 'var(--agntcms-admin-accent-tint)',
  padding: '1px 6px',
  borderRadius: 4,
  fontWeight: 600,
}

const historyDiffMutedStyle: CSSProperties = {
  color: 'var(--agntcms-admin-fg-dim)',
  fontSize: 11,
  fontFamily: 'var(--font-body, sans-serif)',
}

const historyPreviewStyle: CSSProperties = {
  minHeight: 0,
  overflow: 'auto',
  maxHeight: '60vh',
}

const historyPreviewFallbackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const historyPreviewFallbackRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 4,
}

const historyPreviewFallbackIdStyle: CSSProperties = {
  fontSize: 12,
  fontFamily: 'var(--font-body, monospace)',
  color: 'var(--agntcms-admin-fg-dim)',
}

// -- Section decorator (per-section diff status in the preview pane) --
//
// Colors mirror the history-entry badges: success for "added", warning
// for "modified", brand/info for "moved". A thick left border is cheaper
// visually than a full outline and still reads as a status stripe.

const sectionDecoratorBaseStyle: CSSProperties = {
  position: 'relative',
  // Offset the label so it doesn't overlap the border stripe below.
  paddingLeft: 8,
}

const sectionDecoratorUnchangedStyle: CSSProperties = {
  ...sectionDecoratorBaseStyle,
  // Keep unchanged sections visually flush — no stripe, no label. Still
  // reserve the same left padding so the layout doesn't shift when the
  // user flips between snapshots with mixed statuses.
}

const sectionDecoratorAddedStyle: CSSProperties = {
  ...sectionDecoratorBaseStyle,
  borderLeft: '4px solid var(--agntcms-admin-success)',
  background: 'var(--agntcms-admin-success-tint)',
}

const sectionDecoratorModifiedStyle: CSSProperties = {
  ...sectionDecoratorBaseStyle,
  borderLeft: '4px solid var(--agntcms-admin-warning)',
  background: 'var(--agntcms-admin-warning-tint)',
}

const sectionDecoratorMovedStyle: CSSProperties = {
  ...sectionDecoratorBaseStyle,
  borderLeft: '4px solid var(--agntcms-admin-accent)',
  background: 'var(--agntcms-admin-accent-tint)',
}

const sectionDecoratorLabelBaseStyle: CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 4,
  fontSize: 10,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  padding: '1px 6px',
  borderRadius: 4,
  // Raise above the rendered section content.
  zIndex: 1,
  pointerEvents: 'none',
}

const sectionDecoratorAddedLabelStyle: CSSProperties = {
  ...sectionDecoratorLabelBaseStyle,
  color: 'var(--agntcms-admin-success)',
  background: 'var(--agntcms-admin-success-tint)',
}

const sectionDecoratorModifiedLabelStyle: CSSProperties = {
  ...sectionDecoratorLabelBaseStyle,
  color: 'var(--agntcms-admin-warning)',
  background: 'var(--agntcms-admin-warning-tint)',
}

const sectionDecoratorMovedLabelStyle: CSSProperties = {
  ...sectionDecoratorLabelBaseStyle,
  color: 'var(--agntcms-admin-accent)',
  background: 'var(--agntcms-admin-accent-tint)',
}

// -- Field-diff panel (rendered under a Modified section) --

const fieldDiffPanelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginTop: 8,
  padding: '6px 8px',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 4,
  background: 'var(--agntcms-admin-surface-raised)',
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--agntcms-admin-fg-muted)',
}

const fieldDiffRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  flexWrap: 'wrap',
}

const fieldDiffNameStyle: CSSProperties = {
  fontWeight: 600,
  color: 'var(--agntcms-admin-fg)',
  flexShrink: 0,
}

const fieldDiffOpsStyle: CSSProperties = {
  // `pre-wrap` so whitespace tokens render verbatim and long strings wrap.
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  flex: 1,
  minWidth: 0,
}

const fieldDiffImageBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  flex: 1,
  minWidth: 0,
}

const fieldDiffImageSubRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
}

const fieldDiffSubLabelStyle: CSSProperties = {
  color: 'var(--agntcms-admin-fg-dim)',
  flexShrink: 0,
}

const fieldDiffThumbRowStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
}

const fieldDiffThumbBeforeStyle: CSSProperties = {
  width: 32,
  height: 32,
  objectFit: 'cover',
  borderRadius: 3,
  border: '1px solid var(--agntcms-admin-danger-tint-strong)',
  opacity: 0.9,
}

const fieldDiffThumbAfterStyle: CSSProperties = {
  width: 32,
  height: 32,
  objectFit: 'cover',
  borderRadius: 3,
  border: '1px solid var(--agntcms-admin-success-tint-strong)',
}

// Word-diff span styles: red strikethrough for removes, green
// highlight for adds, muted foreground for unchanged runs.
const wordDiffEqualStyle: CSSProperties = {
  color: 'var(--agntcms-admin-fg-muted)',
}

const wordDiffAddStyle: CSSProperties = {
  color: 'var(--agntcms-admin-success)',
  background: 'var(--agntcms-admin-success-tint-strong)',
  borderRadius: 2,
}

const wordDiffRemoveStyle: CSSProperties = {
  color: 'var(--agntcms-admin-danger)',
  background: 'var(--agntcms-admin-danger-tint-strong)',
  textDecoration: 'line-through',
  borderRadius: 2,
}

// -- "Not in this snapshot" callout --

const removedCalloutStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  padding: '6px 10px',
  marginBottom: 8,
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 6,
  background: 'var(--agntcms-admin-surface-raised)',
}

const removedCalloutLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-muted)',
  flexShrink: 0,
}

const removedCalloutListStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  flex: 1,
  minWidth: 0,
}

const removedCalloutItemStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
}

const removedCalloutSeparatorStyle: CSSProperties = {
  color: 'var(--agntcms-admin-fg-dim)',
  fontSize: 12,
}

const removedCalloutDismissStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--agntcms-admin-fg-dim)',
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
  width: 20,
  height: 20,
  flexShrink: 0,
}

// ---------------------------------------------------------------------------
// GlobalHistoryModal — sub-modal that lists a global's version history with
// per-field diff highlighting, previews the selected snapshot, and offers
// restore (rollback).
//
// Shape mirrors PageHistoryModal but simpler: globals have no section array,
// so there is no section-level diff. The only diff is per-field on `data`,
// driven by the schema resolved via the global's `type` (same definitions
// registry threaded through AdminModal).
//
// Data flow:
//   1. GET /api/agntcms/global/history?name=<name>         → entries list
//      (newest-first).
//   2. For each entry: GET /api/agntcms/global/history?name=<name>&ts=<ts>
//      → full Global body { name, type, data }.
//   3. GET /api/agntcms/global/read?name=<name>            → currently-live
//      global, used as the diff baseline.
//
// Edge case — schema changed between versions:
//   If a snapshot's `type` differs from the currently-live `type`, no single
//   schema describes both sides. We degrade gracefully: the entry is tagged
//   "Schema changed <oldType> → <newType>" in the list, and the preview pane
//   shows the raw JSON before/after pair instead of a schema-driven diff.
// ---------------------------------------------------------------------------

interface GlobalHistoryModalProps {
  readonly name: string
  readonly open: boolean
  readonly onClose: () => void
  readonly onRollbackDone: () => void
  readonly definitions?: readonly DefinitionLike[]
}

interface GlobalHistoryEntrySummary {
  readonly timestamp: string
}

function GlobalHistoryModal(
  props: GlobalHistoryModalProps,
): ReactElement | null {
  const { name, open, onClose, onRollbackDone, definitions } = props

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<
    readonly GlobalHistoryEntrySummary[]
  >([])
  // Snapshot bodies keyed by timestamp, plus the currently-live global at
  // the sentinel key '' — same layout as PageHistoryModal.bodies.
  const [bodies, setBodies] = useState<Readonly<Record<string, Global>>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [confirmTs, setConfirmTs] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setEntries([])
    setBodies({})
    setSelected(null)
    setConfirmTs(null)

    let cancelled = false

    async function load(): Promise<void> {
      try {
        const listRes = await fetch(
          `/api/agntcms/global/history?name=${encodeURIComponent(name)}`,
        )
        if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`)
        const listBody = (await listRes.json()) as {
          entries: readonly GlobalHistoryEntrySummary[]
        }
        if (cancelled) return

        const list = listBody.entries
        setEntries(list)
        if (list.length > 0) {
          const first = list[0]
          if (first) setSelected(first.timestamp)
        }

        // Fetch the currently-live global, best-effort. A missing global
        // (404) is valid — the user may be viewing history for a global
        // that was deleted. We represent that by omitting '' from bodies;
        // the diff degrades to "everything is new" (no baseline).
        const currentPromise = fetch(
          `/api/agntcms/global/read?name=${encodeURIComponent(name)}`,
        )
          .then(async (res) =>
            res.ok ? ((await res.json()) as { global: Global }).global : null,
          )
          .catch(() => null)

        const bodyPromises = list.map(async (e) => {
          const res = await fetch(
            `/api/agntcms/global/history?name=${encodeURIComponent(name)}&ts=${encodeURIComponent(e.timestamp)}`,
          )
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${e.timestamp}`)
          const body = (await res.json()) as { global: Global }
          return [e.timestamp, body.global] as const
        })

        const [current, ...pairs] = await Promise.all([
          currentPromise,
          ...bodyPromises,
        ])
        if (cancelled) return

        const next: Record<string, Global> = {}
        for (const [ts, g] of pairs) next[ts] = g
        if (current !== null) next[''] = current
        setBodies(next)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load history',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [open, name])

  // Resolve schema by global type from the registered definitions. Same
  // cast rationale as PageHistoryModal's `schemaByType`: the client-
  // public `DefinitionLike` doesn't expose `schema`, but every real
  // definition passed in at runtime does.
  const schemaByType = useMemo(() => {
    const map = new Map<string, SectionSchema>()
    if (!definitions) return map
    type DefWithSchema = { name: string; schema?: SectionSchema }
    for (const d of definitions as readonly DefWithSchema[]) {
      if (d.schema !== undefined) map.set(d.name, d.schema)
    }
    return map
  }, [definitions])

  // Per-entry field-diff, computed against the currently-live global.
  // Returns null when bodies are not yet loaded for this entry.
  // Returns a discriminated result so the list can render both the
  // "n fields changed" summary AND an actual result in the preview pane
  // without recomputing.
  type EntryDiff =
    | { readonly kind: 'loading' }
    | { readonly kind: 'no-baseline' }
    | { readonly kind: 'schema-changed'; readonly fromType: string; readonly toType: string }
    | { readonly kind: 'no-schema' }
    | { readonly kind: 'fields'; readonly entries: readonly FieldDiffEntry[] }

  const computeEntryDiff = useCallback(
    (index: number): EntryDiff => {
      const entry = entries[index]
      if (!entry) return { kind: 'loading' }
      const snapshot = bodies[entry.timestamp]
      if (!snapshot) return { kind: 'loading' }
      const current = bodies['']
      if (!current) return { kind: 'no-baseline' }

      if (current.type !== snapshot.type) {
        return {
          kind: 'schema-changed',
          fromType: snapshot.type,
          toType: current.type,
        }
      }

      const schema = schemaByType.get(current.type)
      if (schema === undefined) return { kind: 'no-schema' }

      return {
        kind: 'fields',
        entries: fieldDiff(
          schema,
          current.data as Readonly<Record<string, unknown>>,
          snapshot.data as Readonly<Record<string, unknown>>,
        ),
      }
    },
    [entries, bodies, schemaByType],
  )

  const handleRestoreClick = useCallback((ts: string) => {
    setConfirmTs(ts)
  }, [])

  const handleRestoreCancel = useCallback(() => {
    setConfirmTs(null)
  }, [])

  const handleRestoreConfirm = useCallback(
    (ts: string) => {
      setConfirmTs(null)
      setRestoring(true)
      setError(null)
      fetch('/api/agntcms/global/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, timestamp: ts }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Rollback failed: HTTP ${res.status}`)
          onRollbackDone()
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Rollback failed')
        })
        .finally(() => {
          setRestoring(false)
        })
    },
    [name, onRollbackDone],
  )

  const currentEntryIndex = useMemo(
    () => findCurrentHistoryEntryIndex(entries, bodies, bodies[''] ?? null),
    [entries, bodies],
  )

  const selectedGlobal: Global | null =
    selected !== null ? bodies[selected] ?? null : null
  const selectedIndex =
    selected !== null ? entries.findIndex((e) => e.timestamp === selected) : -1
  const selectedDiff: EntryDiff | null =
    selectedIndex >= 0 ? computeEntryDiff(selectedIndex) : null

  const footer = (
    <div style={metaFooterStyle}>
      <button type="button" style={metaCancelButtonStyle} onClick={onClose}>
        Close
      </button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<span style={historyTitleStyle}>Global history — {name}</span>}
      footer={footer}
      ariaLabel="Global history"
      zIndex={100001}
      maxWidth={960}
    >
      {loading ? (
        <div style={metaLoadingStyle}>Loading...</div>
      ) : error && entries.length === 0 ? (
        <div style={metaErrorStyle}>{error}</div>
      ) : entries.length === 0 ? (
        <div style={metaInfoStyle}>
          No history yet. Saving the global will create the first snapshot.
        </div>
      ) : (
        <div style={historyLayoutStyle}>
          <div style={historyListStyle} data-testid="agntcms-history-list">
            {error && <div style={metaInlineErrorStyle}>{error}</div>}
            {entries.map((entry, index) => {
              const diff = computeEntryDiff(index)
              const isSelected = selected === entry.timestamp
              const isCurrent = index === currentEntryIndex
              return (
                <div
                  key={entry.timestamp}
                  style={
                    isSelected ? historyEntrySelectedStyle : historyEntryStyle
                  }
                  data-testid={`agntcms-history-entry-${entry.timestamp}`}
                >
                  <button
                    type="button"
                    style={historyEntryButtonStyle}
                    onClick={() => setSelected(entry.timestamp)}
                  >
                    <span style={historyEntryLabelRowStyle}>
                      <span style={historyEntryLabelStyle}>
                        {formatTimestampLabel(entry.timestamp)}
                      </span>
                      {isCurrent ? (
                        <span
                          style={historyEntryCurrentBadgeStyle}
                          data-testid={`agntcms-history-current-${entry.timestamp}`}
                        >
                          Current
                        </span>
                      ) : null}
                    </span>
                    {isCurrent ? null : <GlobalHistoryDiffBadge diff={diff} />}
                  </button>
                  <div style={historyEntryActionsStyle}>
                    {isCurrent ? null : confirmTs === entry.timestamp ? (
                      <>
                        <span style={confirmTextStyle}>Restore?</span>
                        <button
                          type="button"
                          style={confirmYesStyle}
                          disabled={restoring}
                          onClick={() => handleRestoreConfirm(entry.timestamp)}
                          data-testid={`agntcms-history-restore-confirm-${entry.timestamp}`}
                        >
                          {restoring ? '...' : 'Yes'}
                        </button>
                        <button
                          type="button"
                          style={confirmNoStyle}
                          onClick={handleRestoreCancel}
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        style={editButtonStyle}
                        onClick={() => handleRestoreClick(entry.timestamp)}
                        data-testid={`agntcms-history-restore-${entry.timestamp}`}
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={historyPreviewStyle}>
            {selectedGlobal === null || selectedDiff === null ? (
              <div style={metaInfoStyle}>Select a snapshot to preview.</div>
            ) : (
              <GlobalHistoryPreview
                snapshot={selectedGlobal}
                diff={selectedDiff}
                isCurrent={selectedIndex === currentEntryIndex}
              />
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

// Single-line summary badge for a global history entry. Mirrors
// HistoryDiffBadges for pages but with only four possible states,
// matching the simpler global diff semantics.
function GlobalHistoryDiffBadge(props: {
  readonly diff:
    | { readonly kind: 'loading' }
    | { readonly kind: 'no-baseline' }
    | { readonly kind: 'schema-changed'; readonly fromType: string; readonly toType: string }
    | { readonly kind: 'no-schema' }
    | { readonly kind: 'fields'; readonly entries: readonly FieldDiffEntry[] }
}): ReactElement {
  const { diff } = props
  if (diff.kind === 'loading') {
    return <span style={historyDiffMutedStyle}>—</span>
  }
  if (diff.kind === 'no-baseline') {
    return <span style={historyDiffMutedStyle}>no current version</span>
  }
  if (diff.kind === 'schema-changed') {
    return (
      <span
        style={historyDiffModifiedStyle}
        title={`type: ${diff.fromType} \u2192 ${diff.toType}`}
      >
        schema changed
      </span>
    )
  }
  if (diff.kind === 'no-schema') {
    return <span style={historyDiffMutedStyle}>schema unavailable</span>
  }
  const count = diff.entries.length
  if (count === 0) {
    return <span style={historyDiffMutedStyle}>no changes</span>
  }
  return (
    <span style={historyDiffModifiedStyle}>
      {'~'}{count} {count === 1 ? 'field' : 'fields'} changed
    </span>
  )
}

// Preview pane for the selected global history entry. Globals do not
// have sections, so we render the FieldDiffPanel directly rather than
// layering it under a SectionRenderer.
function GlobalHistoryPreview(props: {
  readonly snapshot: Global
  readonly diff:
    | { readonly kind: 'loading' }
    | { readonly kind: 'no-baseline' }
    | { readonly kind: 'schema-changed'; readonly fromType: string; readonly toType: string }
    | { readonly kind: 'no-schema' }
    | { readonly kind: 'fields'; readonly entries: readonly FieldDiffEntry[] }
  readonly isCurrent: boolean
}): ReactElement {
  const { snapshot, diff, isCurrent } = props

  // Terminal "nothing to diff" states degrade to a short placeholder. We
  // still show the snapshot's raw JSON below so the user can inspect the
  // snapshot content even when no diff is renderable (schema changed,
  // baseline missing, schema not registered).
  if (isCurrent) {
    return (
      <div style={metaInfoStyle} data-testid="agntcms-history-global-current">
        No changes vs current.
      </div>
    )
  }
  if (diff.kind === 'no-baseline') {
    return (
      <div style={globalPreviewPanelStyle}>
        <div style={metaInfoStyle}>No current version to compare against.</div>
        <GlobalRawJsonBlock
          label="Snapshot"
          value={snapshot.data as Readonly<Record<string, unknown>>}
        />
      </div>
    )
  }
  if (diff.kind === 'schema-changed') {
    return (
      <div style={globalPreviewPanelStyle}>
        <div style={metaInfoStyle}>
          Global type changed since this snapshot (
          <code>{diff.fromType}</code>
          {' \u2192 '}
          <code>{diff.toType}</code>
          ). Showing raw snapshot data.
        </div>
        <GlobalRawJsonBlock
          label="Snapshot data"
          value={snapshot.data as Readonly<Record<string, unknown>>}
        />
      </div>
    )
  }
  if (diff.kind === 'no-schema') {
    return (
      <div style={globalPreviewPanelStyle}>
        <div style={metaInfoStyle}>
          Schema for type <code>{snapshot.type}</code> is not registered.
          Showing raw snapshot data.
        </div>
        <GlobalRawJsonBlock
          label="Snapshot data"
          value={snapshot.data as Readonly<Record<string, unknown>>}
        />
      </div>
    )
  }
  if (diff.kind === 'loading') {
    return <div style={metaInfoStyle}>Loading diff...</div>
  }
  // diff.kind === 'fields'
  if (diff.entries.length === 0) {
    return (
      <div style={metaInfoStyle} data-testid="agntcms-history-global-no-diff">
        No changes vs current.
      </div>
    )
  }
  return <FieldDiffPanel entries={diff.entries} />
}

// Renders a read-only JSON pretty-printed block. Used only by the
// schema-changed / no-baseline / no-schema fallbacks above. Kept private
// to this file; there is no other consumer of this shape.
function GlobalRawJsonBlock(props: {
  readonly label: string
  readonly value: Readonly<Record<string, unknown>>
}): ReactElement {
  const { label, value } = props
  return (
    <div
      style={globalRawJsonBlockStyle}
      data-testid={`agntcms-history-global-raw-${label.replace(/\s+/g, '-').toLowerCase()}`}
    >
      <div style={globalRawJsonLabelStyle}>{label}</div>
      <pre style={globalRawJsonPreStyle}>{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}

// -- GlobalHistoryModal styles --

const globalPreviewPanelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const globalRawJsonBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '6px 8px',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 4,
  background: 'var(--agntcms-admin-surface-raised)',
}

const globalRawJsonLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

const globalRawJsonPreStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--agntcms-admin-fg-muted)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}
