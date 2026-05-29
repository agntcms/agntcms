'use client'

// -----------------------------------------------------------------------
// SectionWrapper — wraps a rendered section with the replace overlay in
// preview mode. In published mode, renders children with zero overhead.
//
// IMPORT CONSTRAINTS (invariant 2):
//   - Only `react` and local files.
//   - No server-side imports.
// -----------------------------------------------------------------------

import { SectionReplaceOverlay } from './SectionReplaceOverlay'
import type { DefinitionLike } from './SectionPickerModal'

export interface SectionWrapperProps {
  readonly sectionId: string
  readonly sectionType: string
  readonly pageSlug: string
  readonly definitions: readonly DefinitionLike[]
  readonly isPreview: boolean
  readonly onReplaced?: () => void
  /** Forwarded to the picker to allow replacing a section with a global. */
  readonly onSelectGlobal?: (globalName: string) => void
  /**
   * Optional slot for the delete (x) button. Rendered INSIDE the
   * .agntcms-section-wrap div so the single group-hover rule in
   * HOVER_STYLE reveals it together with the replace control. The caller
   * owns the button's appearance and behavior (confirm, fetch, etc.);
   * SectionWrapper just places it in the hover scope.
   */
  readonly deleteAction?: React.ReactNode
  readonly children: React.ReactNode
}

// The hover effect for the section-level controls (replace, delete) is a
// single group-hover rule: anything tagged with the
// `data-agntcms-section-control` attribute fades in when the wrapper is
// hovered. Using one generic marker lets any child button opt into the
// cluster without SectionWrapper knowing about it.
const HOVER_STYLE = `
.agntcms-section-wrap:hover [data-agntcms-section-control] {
  opacity: 1 !important;
}
`

const wrapperStyle: React.CSSProperties = {
  position: 'relative',
}

/**
 * Wraps a rendered section with a hover overlay showing the replace
 * button. In published mode, renders children with no wrapper.
 */
export function SectionWrapper(props: SectionWrapperProps): React.ReactElement {
  const {
    sectionId,
    sectionType,
    pageSlug,
    definitions,
    isPreview,
    onReplaced,
    onSelectGlobal,
    deleteAction,
    children,
  } = props

  // Published mode: zero overhead — no wrapper div, no overlay.
  if (!isPreview) {
    return <>{children}</>
  }

  return (
    <div
      style={wrapperStyle}
      className="agntcms-section-wrap"
      data-agntcms-section={sectionId}
    >
      <style>{HOVER_STYLE}</style>
      <SectionReplaceOverlay
        sectionId={sectionId}
        currentType={sectionType}
        pageSlug={pageSlug}
        definitions={definitions}
        isPreview={isPreview}
        // Spread conditionally to satisfy exactOptionalPropertyTypes — passing
        // `undefined` directly to an optional prop is not allowed.
        {...(onReplaced !== undefined ? { onReplaced } : {})}
        {...(onSelectGlobal !== undefined ? { onSelectGlobal } : {})}
      />
      {deleteAction}
      {children}
    </div>
  )
}
