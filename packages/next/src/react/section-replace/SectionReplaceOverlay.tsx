'use client'

// -----------------------------------------------------------------------
// SectionReplaceOverlay — preview-only overlay that lets the user swap a
// section's type. On select, it POSTs to /api/agntcms/draft/replace-section
// and refreshes the page. The previous v0.4 implementation dispatched a
// section_replace MCP task to the local agent; the channel was removed
// in v0.5 (ARCHITECTURE.md sections 6 and 7), so the swap is now a
// direct server call that resets `data` to the new type's defaults.
//
// IMPORT CONSTRAINTS (invariant 2):
//   - Only `react`, `next/navigation`, and local sibling files.
//   - No server-side imports. API calls via fetch only.
// -----------------------------------------------------------------------

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

import { SectionPickerModal } from './SectionPickerModal'
import type { DefinitionLike } from './SectionPickerModal'

export type { DefinitionLike }

export interface SectionReplaceOverlayProps {
  /** The section being replaced (id + current type). */
  readonly sectionId: string
  readonly currentType: string
  readonly pageSlug: string
  /** Section definitions with live preview components. */
  readonly definitions: readonly DefinitionLike[]
  /** Whether we're in preview mode (only show in preview). */
  readonly isPreview: boolean
  /** Callback after the replacement completes successfully. */
  readonly onReplaced?: () => void
  /** Called when a global is selected as the replacement.
   *  When provided, the picker shows globals alongside section types. */
  readonly onSelectGlobal?: (globalName: string) => void
}

// -- Inline styles. KISS: no animation libraries, no CSS modules. --

// Middle slot in the top-right cluster (replace at right:48, delete at
// right:8). See SectionEditControls.tsx for the full cluster layout.
const buttonStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 48,
  width: 32,
  height: 32,
  borderRadius: '50%',
  border: '1px solid var(--agntcms-admin-border)',
  background: 'var(--agntcms-admin-surface)',
  // Frosted glass so the control reads on top of any section background.
  backdropFilter: 'var(--agntcms-admin-backdrop)',
  WebkitBackdropFilter: 'var(--agntcms-admin-backdrop)',
  boxShadow: 'var(--agntcms-admin-elevation)',
  color: 'var(--agntcms-admin-fg)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 16,
  zIndex: 10,
  opacity: 0,
  transition: 'opacity 0.15s',
  pointerEvents: 'auto',
}

export function SectionReplaceOverlay(
  props: SectionReplaceOverlayProps,
): React.ReactElement | null {
  const {
    sectionId,
    currentType,
    pageSlug,
    definitions,
    isPreview,
    onReplaced,
    onSelectGlobal,
  } = props

  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  // `isReplacing` keeps the trigger button disabled while the POST is
  // in flight so a double-click cannot fire two requests in a row.
  const [isReplacing, setIsReplacing] = useState(false)

  const handleSelect = useCallback(
    (newType: string) => {
      setModalOpen(false)
      setIsReplacing(true)
      void fetch('/api/agntcms/draft/replace-section', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pageSlug, sectionId, newType }),
      })
        .then(async (res) => {
          if (!res.ok) {
            // Best-effort error surface — the section-replace path is
            // not a hot path and a missing toast system isn't worth
            // adding for it. Other editable components use the same
            // `alert(...)` pattern (see SectionEditControls' delete /
            // insert flows).
            const msg = await res.text().catch(() => '')
            // eslint-disable-next-line no-restricted-globals
            alert(`Failed to replace section: ${msg || res.status}`)
            return
          }
          // Refresh the server tree so the preview tree picks up the
          // new section type immediately. The handler preserved the
          // section id, so React reconciles the same slot in place.
          router.refresh()
          onReplaced?.()
        })
        .catch(() => {
          // eslint-disable-next-line no-restricted-globals
          alert('Failed to replace section.')
        })
        .finally(() => {
          setIsReplacing(false)
        })
    },
    [pageSlug, sectionId, router, onReplaced],
  )

  // Only render in preview mode.
  if (!isPreview) return null

  // The Replace grid should show only alternative types — the current type
  // is redundant in that list.
  const pickerDefinitions = definitions.filter((d) => d.name !== currentType)

  // Defensive narrow on `currentType` — keep the lint clean since the prop
  // is destructured above but unused after the filter call below.
  void currentType

  return (
    <>
      {/* Replace button — visible on parent hover via the parent's CSS class. */}
      <button
        type="button"
        style={buttonStyle}
        className="agntcms-replace-btn"
        data-agntcms-section-control=""
        title="Replace section"
        onClick={() => setModalOpen(true)}
        aria-label="Replace section"
        disabled={isReplacing}
      >
        &#x21C4;{/* swap arrows */}
      </button>

      {/* Section picker modal — rendered outside the trigger guard so it
          stays open even when the trigger is disabled during the in-flight
          replacement (the modal closes itself on select / cancel). */}
      <SectionPickerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleSelect}
        definitions={pickerDefinitions}
        title="Replace section"
        {...(onSelectGlobal ? { onSelectGlobal } : {})}
      />
    </>
  )
}
