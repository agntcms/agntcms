'use client'

// -----------------------------------------------------------------------
// SectionEditControls — preview-only controls for adding and removing
// sections from a page. Renders insert bars ("+" between sections) and
// delete buttons ("x" per section).
//
// This is a client component because it uses hooks, state, and browser
// APIs (fetch, confirm). It renders the section list itself so it can
// interleave controls between sections.
//
// IMPORT CONSTRAINTS (invariant 2):
//   - runtime import of `react` only.
//   - local imports from PreviewContext (same client module) and SectionRenderer
//     (within react/ — no server deps, only type-only imports from domain/).
//   - NOTHING from storage/, runtime/, mcp/, tasks/, handlers/, config/.
//   - Section/Page types are replicated as minimal local interfaces to avoid
//     importing from domain/ at runtime (the domain barrel may pull server
//     code transitively in some bundlers). DefinitionLike is imported from
//     SectionPickerModal (a sibling client component — safe). We use
//     structural typing — the shapes are identical so any real Page/Section/
//     AnySectionDefinition satisfies them.
// -----------------------------------------------------------------------

import { useState, useCallback, useEffect, useMemo } from 'react'

import { SectionRenderer, type SectionRendererProps } from '../SectionRenderer'
import { SaveProvider } from '../editable/SaveContext'
import { SectionPickerModal } from '../section-replace/SectionPickerModal'
import type { DefinitionLike } from '../section-replace/SectionPickerModal'
import { SectionWrapper } from '../section-replace/SectionWrapper'
import type { PreviewFieldOriginLike } from '../editable/isPreviewField'
import { usePreviewMode } from './PreviewContext'
import type { Page } from '../../domain/index'

// ---------------------------------------------------------------------------
// Local structural types — `SectionLike` mirrors domain/section.ts so we can
// build PreviewField-stripped section copies in this file's helpers without
// reaching back into domain/. The full page is typed as `Page` directly
// (type-only import, erased at runtime) so every save body carries the full
// metadata snapshot — `seo` (required by `assertValidPage` at the
// storage→runtime boundary), plus `tags`, `excerpt`, `coverImage`,
// `publishedAt`. Versioning is snapshot-based (ARCHITECTURE.md §4): every
// POST to `/draft/save` MUST be a complete Page or the handler returns 400.
// ---------------------------------------------------------------------------

interface SectionLike {
  readonly id: string
  readonly type: string
  readonly data: unknown
  readonly globalRef?: string
}

// ---------------------------------------------------------------------------
// PreviewField stripping — prevents double-wrapping on reload.
//
// In preview mode, getContent wraps every field value in a PreviewField
// object: { __agntcmsPreview: true, value: <plain>, origin: {...} }.
// When we POST a page snapshot to /api/agntcms/draft/save, the draft
// endpoint expects plain values. If we save the wrappers to disk, the next
// getContent call wraps them again — producing PreviewField<PreviewField<T>>
// — and React throws "Objects are not valid as a React child".
//
// The check mirrors the pattern in isPreviewField.ts (structural brand test
// on `__agntcmsPreview`) without importing it, to stay consistent with
// this file's local-types approach.
// ---------------------------------------------------------------------------

/** Unwrap a single section's data, replacing PreviewField wrappers with
 *  their inner `.value`. Non-wrapped values pass through unchanged. */
function stripSectionData(data: unknown): Record<string, unknown> {
  const record = data as Record<string, unknown>
  const stripped: Record<string, unknown> = {}
  for (const key of Object.keys(record)) {
    const val = record[key]
    if (typeof val === 'object' && val !== null && '__agntcmsPreview' in val) {
      stripped[key] = (val as unknown as { value: unknown }).value
    } else {
      stripped[key] = val
    }
  }
  return stripped
}

/** Strip PreviewField wrappers from all sections in a list. */
function stripSections(sections: readonly SectionLike[]): SectionLike[] {
  return sections.map((s) => ({ ...s, data: stripSectionData(s.data) }))
}

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface SectionEditControlsProps {
  /** The page whose sections are being edited. */
  readonly page: Page
  /** Section definitions — used both to render sections and to populate the
   *  "add section" picker. Replaces the old `renderSection` callback + separate
   *  `sectionTypes` list: passing definitions is RSC-serializable (component
   *  refs are serializable as module references), while a function callback is
   *  not. */
  readonly definitions: readonly DefinitionLike[]
  /** Called after a mutation succeeds. Typically triggers a router refresh. */
  readonly onMutated?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Wraps the section list with add/remove controls visible only in preview
 * mode. In published mode, renders the plain section list with no overhead.
 */
export function SectionEditControls(
  props: SectionEditControlsProps,
): React.ReactElement {
  const { page, definitions, onMutated } = props
  const mode = usePreviewMode()

  // Fall back to a full page reload when no explicit onMutated is provided.
  // Wrapped in useCallback so the reference is stable across renders.
  const effectiveMutated = useCallback(() => {
    if (onMutated) onMutated()
    else window.location.reload()
  }, [onMutated])

  // Optimistic reorder state.
  //
  // `localOrder` is a list of section IDs in the user's current (not yet
  // confirmed) order. When null, we render in `page.sections` order. On a
  // successful reorder POST, `effectiveMutated()` triggers a refresh that
  // re-feeds `page.sections` in the new order, and we clear `localOrder`
  // in an effect-free way by comparing ids against the fresh `page`.
  //
  // On failure the array is reset to null and the UI snaps back to the
  // server-authoritative order.
  const [localOrder, setLocalOrder] = useState<readonly string[] | null>(null)
  const [reorderError, setReorderError] = useState<string | null>(null)

  // Derive the sections list to render. If a local order exists and matches
  // the current page's id set, apply it; otherwise fall through to the
  // server order. The id-set check keeps the UI safe when the server has
  // added or removed a section out-of-band (e.g. the user added a section
  // then attempted a reorder): we revert to the fresh authoritative order
  // rather than rendering against a stale id list.
  const orderedSections = useMemo(() => {
    if (localOrder === null) return page.sections
    const byId = new Map(page.sections.map((s) => [s.id, s]))
    if (localOrder.length !== page.sections.length) return page.sections
    const resolved: SectionLike[] = []
    for (const id of localOrder) {
      const s = byId.get(id)
      if (!s) return page.sections
      resolved.push(s)
    }
    return resolved
  }, [localOrder, page.sections])

  // Clear local order once the server-derived order matches it — this is
  // our signal that the refresh has landed and the optimistic override is
  // now redundant.
  useEffect(() => {
    if (localOrder === null) return
    const serverIds = page.sections.map((s) => s.id)
    if (
      serverIds.length === localOrder.length &&
      serverIds.every((id, i) => id === localOrder[i])
    ) {
      setLocalOrder(null)
    }
  }, [localOrder, page.sections])

  // POST a new full order array to /api/agntcms/draft/reorder. Optimistic:
  // set `localOrder` first, fire the request, revert on failure.
  const performReorder = useCallback(
    (newOrder: readonly string[]): void => {
      // Sanity: must be exactly the same ids as the current page.
      if (newOrder.length !== page.sections.length) return

      setLocalOrder(newOrder)
      setReorderError(null)

      fetch('/api/agntcms/draft/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: page.slug, order: newOrder }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const msg = await res.text().catch(() => 'reorder failed')
            setLocalOrder(null)
            setReorderError(msg || `HTTP ${res.status}`)
            return
          }
          effectiveMutated()
        })
        .catch(() => {
          setLocalOrder(null)
          setReorderError('Failed to reorder sections.')
        })
    },
    [page.slug, page.sections.length, effectiveMutated],
  )

  // Field-level save: finds the section by origin.sectionId, patches the
  // field, then POSTs the full page snapshot (snapshot-based versioning).
  // Defined unconditionally (before the early return) to satisfy the rules
  // of hooks — only used in preview mode.
  //
  // For global-ref sections the save is redirected to the global endpoint
  // so the shared global data is updated instead of the per-page draft.
  //
  // `newValue` is `unknown` to keep the save path lossless — whatever the
  // editable component produced goes verbatim into `section.data`.
  const saveField = useCallback(
    (origin: PreviewFieldOriginLike, newValue: unknown): void => {
      // Check if the section being edited references a global.
      const section = page.sections.find((s) => s.id === origin.sectionId)
      const globalRef = section?.globalRef

      if (globalRef) {
        // Route through the draft endpoint so in-page edits of a global
        // behave like every other editor-side global save (AdminModal,
        // GlobalSaveProvider). The user later publishes via the Globals
        // tab in the admin modal. In preview mode `getGlobal` reads draft
        // first, so the edit is reflected on the next read; on the live
        // site the change is only visible after Publish.
        const currentData = stripSectionData(section.data)
        const updatedData = { ...currentData, [origin.fieldPath]: newValue }

        fetch('/api/agntcms/global-draft/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: globalRef,
            type: section.type,
            data: updatedData,
          }),
        })
          .then((res) => {
            if (!res.ok) {
              // eslint-disable-next-line no-restricted-globals
              void res.text().then((t) => alert(`Failed to save global: ${t}`))
              return
            }
            effectiveMutated()
          })
          .catch(() => {
            // eslint-disable-next-line no-restricted-globals
            alert('Failed to save global.')
          })
        return
      }

      // Non-global section: strip PreviewField wrappers first so the saved
      // draft contains plain values. Then patch the edited field.
      //
      // The save body is the full page snapshot — `{ ...page, sections }`
      // — because the domain validator (`assertValidPage`) requires `seo`
      // and the snapshot-versioning model (ARCHITECTURE.md §4) demands a
      // complete Page on every write. Spread `page` to thread every
      // metadata field (seo, tags, excerpt, coverImage, publishedAt, …)
      // through unchanged.
      const rawSections = stripSections(page.sections)
      const updatedSections = rawSections.map((s) => {
        if (s.id !== origin.sectionId) return s
        return {
          ...s,
          data: { ...(s.data as Record<string, unknown>), [origin.fieldPath]: newValue },
        }
      })
      const updated: Page = { ...page, sections: updatedSections }

      fetch('/api/agntcms/draft/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
        .then((res) => {
          if (!res.ok) {
            // eslint-disable-next-line no-restricted-globals
            void res.text().then((t) => alert(`Failed to save: ${t}`))
            return
          }
          effectiveMutated()
        })
        .catch(() => {
          // eslint-disable-next-line no-restricted-globals
          alert('Failed to save field.')
        })
    },
    [page, effectiveMutated],
  )

  // Replace a section with a global reference. Used by the SectionWrapper
  // replace overlay when the user picks a global instead of a section type.
  // Returns a closure bound to a specific sectionId so each SectionWrapper
  // can receive a stable callback.
  const makeReplaceWithGlobal = useCallback(
    (sectionId: string) =>
      (globalName: string): void => {
        const rawSections = stripSections(page.sections)
        const updatedSections = rawSections.map((s) => {
          if (s.id !== sectionId) return s
          // Convert the section into a global-ref — the runtime resolves
          // type and data from the global at read time.
          return { id: s.id, type: '', data: {}, globalRef: globalName }
        })
        // Full-page snapshot save — see comment on `saveField` above.
        const updated: Page = { ...page, sections: updatedSections }

        fetch('/api/agntcms/draft/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        })
          .then((res) => {
            if (!res.ok) {
              // eslint-disable-next-line no-restricted-globals
              void res.text().then((t) => alert(`Failed to replace with global: ${t}`))
              return
            }
            effectiveMutated()
          })
          .catch(() => {
            // eslint-disable-next-line no-restricted-globals
            alert('Failed to replace section with global.')
          })
      },
    [page, effectiveMutated],
  )

  // Active drag-source id for HTML5 drag-drop reordering. Kept in state so
  // the visual affordance (dragging row opacity) can react to it.
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // Build a move helper: swap the section at `fromIndex` with the neighbour
  // at `toIndex`. No-op if `toIndex` is out of bounds. Used by the up/down
  // arrow buttons. We read from `orderedSections` so consecutive clicks
  // compose on the latest optimistic order.
  const moveSection = useCallback(
    (fromIndex: number, toIndex: number): void => {
      if (toIndex < 0 || toIndex >= orderedSections.length) return
      const ids = orderedSections.map((s) => s.id)
      const next = [...ids]
      const [item] = next.splice(fromIndex, 1)
      if (item === undefined) return
      next.splice(toIndex, 0, item)
      performReorder(next)
    },
    [orderedSections, performReorder],
  )

  // Drop reorder helper for HTML5 DnD: move `sourceId` to the position
  // currently held by `targetId`. If they are equal it is a no-op.
  const dropReorder = useCallback(
    (sourceId: string, targetId: string): void => {
      if (sourceId === targetId) return
      const ids = orderedSections.map((s) => s.id)
      const sourceIdx = ids.indexOf(sourceId)
      const targetIdx = ids.indexOf(targetId)
      if (sourceIdx < 0 || targetIdx < 0) return
      const next = [...ids]
      next.splice(sourceIdx, 1)
      // After removing the source, the target's new index shifts by one
      // if the source used to be before the target.
      const insertAt = sourceIdx < targetIdx ? targetIdx - 1 : targetIdx
      next.splice(insertAt, 0, sourceId)
      performReorder(next)
    },
    [orderedSections, performReorder],
  )

  // SectionRenderer expects AnySectionDefinition[] (with `schema`, `defaults`,
  // and contravariant `component`). At runtime, the definitions passed in are
  // real AnySectionDefinition objects with all fields present — DefinitionLike
  // only requires `name`, `component`, and optionally `defaults`, keeping the
  // client contract minimal. The cast at this rendering boundary is the same
  // pattern as SectionRenderer.tsx line 63 (component cast).
  const rendererDefs = definitions as unknown as SectionRendererProps['definitions']

  if (mode !== 'preview') {
    // Published mode: render sections with zero overhead.
    return (
      <div data-agntcms-page={page.slug}>
        {page.sections.map((section) => (
          <div key={section.id}>
            <SectionRenderer section={section} definitions={rendererDefs} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <SaveProvider saveField={saveField}>
      {/* Cancel anchor navigation but let inner editable widgets receive the click. */}
      <div
        data-agntcms-page={page.slug}
        onClickCapture={(e) => {
          const anchor = (e.target as HTMLElement).closest('a')
          if (anchor === null) return
          if (anchor.closest('[data-agntcms-section-control]') !== null) return
          e.preventDefault()
        }}
      >
        {reorderError !== null && (
          <div style={reorderErrorStyle} role="status">
            {reorderError}
          </div>
        )}

        {/* Insert bar before the first section */}
        <InsertSectionBar
          page={page}
          position={0}
          definitions={definitions}
          onMutated={effectiveMutated}
        />

        {orderedSections.map((section, i) => {
          const isFirst = i === 0
          const isLast = i === orderedSections.length - 1
          const isDragging = draggingId === section.id

          const handleDragStart = (e: React.DragEvent<HTMLDivElement>): void => {
            // dataTransfer must be set to opt into the drag cycle; we put
            // the section id in as an internal payload only — the browser
            // also requires a MIME type.
            e.dataTransfer.setData('text/plain', section.id)
            e.dataTransfer.effectAllowed = 'move'
            setDraggingId(section.id)
          }

          const handleDragEnd = (): void => {
            setDraggingId(null)
          }

          const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
            // Must preventDefault to permit the drop event to fire on this
            // element (standard HTML5 DnD quirk).
            if (draggingId !== null && draggingId !== section.id) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }
          }

          const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
            e.preventDefault()
            const sourceId = e.dataTransfer.getData('text/plain') || draggingId
            setDraggingId(null)
            if (!sourceId) return
            dropReorder(sourceId, section.id)
          }

          return (
            <div
              key={section.id}
              style={{
                ...sectionEditWrapStyle,
                ...(isDragging ? sectionDraggingStyle : null),
              }}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              data-agntcms-section-id={section.id}
            >
              {/* Reorder controls: vertical stack at the top-left of the
                  section (outside the hover cluster on the right). Grip icon
                  is the drag source; arrows swap with the neighbour. Arrows
                  disable at the list boundaries. */}
              <div style={reorderControlsStyle} data-agntcms-section-control="">
                <div
                  role="button"
                  aria-label="Drag to reorder section"
                  title="Drag to reorder"
                  draggable
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  style={dragHandleStyle}
                  data-agntcms-section-drag-handle=""
                >
                  {'\u22EE\u22EE'}
                </div>
                <button
                  type="button"
                  onClick={() => moveSection(i, i - 1)}
                  disabled={isFirst}
                  style={isFirst ? reorderArrowDisabledStyle : reorderArrowStyle}
                  title="Move section up"
                  aria-label="Move section up"
                >
                  {'\u2191'}
                </button>
                <button
                  type="button"
                  onClick={() => moveSection(i, i + 1)}
                  disabled={isLast}
                  style={isLast ? reorderArrowDisabledStyle : reorderArrowStyle}
                  title="Move section down"
                  aria-label="Move section down"
                >
                  {'\u2193'}
                </button>
              </div>

              {/* Global badge + warning — shows when this section references a global.
                  The warning reminds users that edits propagate to all pages
                  referencing this global, preventing accidental broad changes. */}
              {section.globalRef && (
                <div style={globalBannerStyle}>
                  <span style={globalBadgeStyle}>Global</span>
                  <span style={globalWarningStyle}>
                    Changes will apply to all pages using this global
                  </span>
                </div>
              )}


              {/* SectionWrapper adds the replace overlay (⇄ button) in preview
                  mode. The three section-level controls (✨, ⇄, ×) are all
                  hover-gated via a single group-hover rule inside
                  SectionWrapper's HOVER_STYLE — every control carries the
                  `data-agntcms-section-control` attribute. The agent and
                  delete buttons are composed here and passed through slots
                  so SectionWrapper stays agnostic of react/agent/ and of
                  the page-save endpoint. */}
              <SectionWrapper
                sectionId={section.id}
                sectionType={section.type}
                pageSlug={page.slug}
                definitions={definitions}
                isPreview={true}
                onReplaced={effectiveMutated}
                onSelectGlobal={makeReplaceWithGlobal(section.id)}
                deleteAction={
                  <SectionDeleteButton
                    page={page}
                    sectionId={section.id}
                    onMutated={effectiveMutated}
                  />
                }
              >
                <SectionRenderer section={section} definitions={rendererDefs} />
              </SectionWrapper>

              {/* Insert bar after each section */}
              <InsertSectionBar
                page={page}
                position={i + 1}
                definitions={definitions}
                onMutated={effectiveMutated}
              />
            </div>
          )
        })}
      </div>
    </SaveProvider>
  )
}

// ---------------------------------------------------------------------------
// SectionDeleteButton — small "x" button in the top-right corner of each
// section while in preview mode.
// ---------------------------------------------------------------------------

interface SectionDeleteButtonProps {
  readonly page: Page
  readonly sectionId: string
  readonly onMutated: () => void
}

function SectionDeleteButton(
  props: SectionDeleteButtonProps,
): React.ReactElement {
  const { page, sectionId, onMutated } = props
  const [busy, setBusy] = useState(false)

  const handleDelete = useCallback((): void => {
    if (busy) return

    // eslint-disable-next-line no-restricted-globals
    if (!confirm('Remove this section?')) return

    const remaining = stripSections(page.sections.filter((s) => s.id !== sectionId))
    // Full-page snapshot save — see comment on `saveField` above.
    const updated: Page = { ...page, sections: remaining }

    setBusy(true)

    fetch('/api/agntcms/draft/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
      .then((res) => {
        setBusy(false)
        if (!res.ok) {
          // eslint-disable-next-line no-restricted-globals
          void res.text().then((t) => alert(`Failed to remove section: ${t}`))
          return
        }
        onMutated()
      })
      .catch(() => {
        setBusy(false)
        // eslint-disable-next-line no-restricted-globals
        alert('Failed to remove section.')
      })
  }, [busy, page, sectionId, onMutated])

  return (
    <button
      type="button"
      style={deleteButtonStyle}
      className="agntcms-section-delete"
      data-agntcms-section-control=""
      title="Remove section"
      aria-label="Remove section"
      disabled={busy}
      onClick={handleDelete}
    >
      {busy ? '\u2026' : '\u00D7'}
    </button>
  )
}

// Cluster layout (right-anchored, close-button convention puts the
// destructive x nearest the corner):
//   replace : right:48
//   delete  : right:8
// Pre-v0.5 there was also a sparkle agent button at right:88 inserted via
// SectionWrapper's `agentAction` slot; removed when the agent channel
// was dropped (ARCHITECTURE.md sections 6 and 7).

// ---------------------------------------------------------------------------
// InsertSectionBar — thin "+" bar rendered between sections.
// On click it shows a picker of available section types.
// ---------------------------------------------------------------------------

interface InsertSectionBarProps {
  readonly page: Page
  readonly position: number
  readonly definitions: readonly DefinitionLike[]
  readonly onMutated: () => void
}

function InsertSectionBar(
  props: InsertSectionBarProps,
): React.ReactElement {
  const { page, position, definitions, onMutated } = props
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleSelect = useCallback(
    (typeName: string): void => {
      setOpen(false)
      if (busy) return

      // Defaults are pre-computed by `defineSection` — just spread them.
      const definition = definitions.find((d) => d.name === typeName)
      const defaultData: Record<string, unknown> = { ...(definition?.defaults ?? {}) }

      const newSection: SectionLike = {
        id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: typeName,
        data: defaultData,
      }

      // Strip existing wrappers before inserting the new (already plain) section.
      const sections = stripSections([...page.sections])
      sections.splice(position, 0, newSection)
      // Full-page snapshot save — see comment on `saveField` above.
      const updated: Page = { ...page, sections }

      setBusy(true)

      fetch('/api/agntcms/draft/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
        .then((res) => {
          setBusy(false)
          if (!res.ok) {
            // eslint-disable-next-line no-restricted-globals
            void res.text().then((t) => alert(`Failed to add section: ${t}`))
            return
          }
          onMutated()
        })
        .catch(() => {
          setBusy(false)
          // eslint-disable-next-line no-restricted-globals
          alert('Failed to add section.')
        })
    },
    [busy, page, position, definitions, onMutated],
  )

  // Insert a global-ref section — the runtime resolves type + data from the
  // global at read time, so we store only the reference.
  const handleSelectGlobal = useCallback(
    (globalName: string): void => {
      setOpen(false)
      if (busy) return

      const newSection: SectionLike = {
        id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: '',
        data: {},
        globalRef: globalName,
      }

      const sections = stripSections([...page.sections])
      sections.splice(position, 0, newSection)
      // Full-page snapshot save — see comment on `saveField` above.
      const updated: Page = { ...page, sections }

      setBusy(true)

      fetch('/api/agntcms/draft/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
        .then((res) => {
          setBusy(false)
          if (!res.ok) {
            // eslint-disable-next-line no-restricted-globals
            void res.text().then((t) => alert(`Failed to add global section: ${t}`))
            return
          }
          onMutated()
        })
        .catch(() => {
          setBusy(false)
          // eslint-disable-next-line no-restricted-globals
          alert('Failed to add global section.')
        })
    },
    [busy, page, position, onMutated],
  )

  return (
    <div style={insertBarContainerStyle}>
      <div style={insertBarLineStyle} />
      <button
        type="button"
        style={insertButtonStyle}
        className="agntcms-insert-btn"
        title="Add section"
        aria-label="Add section"
        disabled={busy}
        onClick={() => setOpen((prev) => !prev)}
      >
        {busy ? '\u2026' : '+'}
      </button>
      <div style={insertBarLineStyle} />

      <SectionPickerModal
        open={open}
        onClose={() => setOpen(false)}
        onSelect={handleSelect}
        onSelectGlobal={handleSelectGlobal}
        definitions={definitions}
        title="Add section"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline styles (KISS: no CSS modules, no tailwind)
// ---------------------------------------------------------------------------

const sectionEditWrapStyle: React.CSSProperties = {
  position: 'relative',
}

// Reduced opacity while this section is the active drag source — gives the
// user a clear visual that the original position is "floating" until drop.
const sectionDraggingStyle: React.CSSProperties = {
  opacity: 0.4,
}

// Error banner shown at the top of the page body when a reorder POST fails.
// Sits above the first insert bar so it is immediately visible; the user
// can dismiss implicitly by triggering another action that clears state.
const reorderErrorStyle: React.CSSProperties = {
  padding: '8px 12px',
  margin: '4px 0',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'var(--font-body, system-ui, -apple-system, sans-serif)',
  color: 'var(--agntcms-admin-danger)',
  background: 'var(--agntcms-admin-danger-tint)',
  border: '1px solid var(--agntcms-admin-danger-tint-strong)',
}

// Reorder cluster lives at the top-left of each section. Hover-gated via
// the same `data-agntcms-section-control` attribute as the delete/replace
// cluster — SectionWrapper's global CSS rule fades all such controls in
// together on section hover.
const reorderControlsStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 8,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  zIndex: 10,
  opacity: 0,
  transition: 'opacity 0.15s',
}

// Frosted glass shared by the floating inline controls (drag handle, reorder
// arrows, delete, insert). Blur + dark tint + soft elevation keep these small
// controls legible on top of any section background; the faint border crisps
// the edge. The @supports fallback in admin-theme.ts swaps the translucent
// surface for an opaque one where backdrop-filter is unsupported.
const frostedControl: React.CSSProperties = {
  backdropFilter: 'var(--agntcms-admin-backdrop)',
  WebkitBackdropFilter: 'var(--agntcms-admin-backdrop)',
  boxShadow: 'var(--agntcms-admin-elevation)',
}

const dragHandleStyle: React.CSSProperties = {
  ...frostedControl,
  width: 28,
  height: 28,
  borderRadius: 4,
  border: '1px solid var(--agntcms-admin-border)',
  background: 'var(--agntcms-admin-surface)',
  color: 'var(--agntcms-admin-fg-muted)',
  cursor: 'grab',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  lineHeight: 1,
  userSelect: 'none',
  letterSpacing: -4,
}

const reorderArrowStyle: React.CSSProperties = {
  ...frostedControl,
  width: 28,
  height: 28,
  borderRadius: 4,
  border: '1px solid var(--agntcms-admin-border)',
  background: 'var(--agntcms-admin-surface)',
  color: 'var(--agntcms-admin-fg-muted)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1,
  padding: 0,
}

const reorderArrowDisabledStyle: React.CSSProperties = {
  ...reorderArrowStyle,
  opacity: 0.3,
  cursor: 'not-allowed',
}

// Rightmost slot in the top-right cluster (closest to the corner per
// close-button convention). 32×32 matches the ⇄ and ✨ siblings; the red
// color marks the destructive action. Hidden by default; the group-hover
// rule in SectionWrapper.HOVER_STYLE fades all three controls in together.
const deleteButtonStyle: React.CSSProperties = {
  ...frostedControl,
  position: 'absolute',
  top: 8,
  right: 8,
  width: 32,
  height: 32,
  borderRadius: '50%',
  border: '1px solid var(--agntcms-admin-border)',
  background: 'var(--agntcms-admin-surface)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--agntcms-admin-danger)',
  zIndex: 10,
  lineHeight: 1,
  opacity: 0,
  transition: 'opacity 0.15s',
}

// The trailing insert bar lives inside section i's wrapper, but its button's
// downward elevation shadow falls over the *next* sibling section wrapper
// (later in DOM order, opaque background). Without a stacking order the next
// section paints over the shadow and clips it. Raising the bar to zIndex 10 —
// the same value the reorder/delete clusters use — keeps it above neighbouring
// section content. Both wrappers are zIndex:auto, so they share one stacking
// context and this positioned descendant wins against the sibling's static fill.
const insertBarContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  padding: '4px 0',
  position: 'relative',
  zIndex: 10,
}

const insertBarLineStyle: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: 'var(--agntcms-admin-border)',
}

const insertButtonStyle: React.CSSProperties = {
  ...frostedControl,
  // Raise above the flanking 1px lines so the button's own shadow is never
  // clipped by a sibling at the same level; the bar container already lifts
  // the whole group above the neighbouring section.
  position: 'relative',
  zIndex: 10,
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: '1px solid var(--agntcms-admin-border)',
  background: 'var(--agntcms-admin-surface)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--agntcms-admin-fg-muted)',
  flexShrink: 0,
  lineHeight: 1,
}

const globalBannerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  left: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  zIndex: 10,
}

const globalBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'var(--font-body, system-ui, -apple-system, sans-serif)',
  color: 'var(--agntcms-admin-accent)',
  background: 'var(--agntcms-admin-surface)',
  border: '1px solid var(--agntcms-admin-accent)',
  borderRadius: 4,
  padding: '2px 8px',
  lineHeight: 1,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  flexShrink: 0,
}

const globalWarningStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'var(--font-body, system-ui, -apple-system, sans-serif)',
  color: 'var(--agntcms-admin-warning)',
  background: 'var(--agntcms-admin-surface)',
  borderRadius: 4,
  padding: '2px 8px',
  lineHeight: 1,
  whiteSpace: 'nowrap',
}

