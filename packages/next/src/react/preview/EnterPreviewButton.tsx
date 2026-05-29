'use client'

// EnterPreviewButton — small floating affordance fixed to the
// bottom-right of the viewport that lets a developer flip from a
// published page into preview mode without hunting for /admin or
// remembering a keyboard chord. Replaces the Ctrl/Cmd+\ hotkey that
// previously lived in usePreviewHotkey.
//
// Visibility rules:
//   - Dev builds only. `process.env.NODE_ENV !== 'production'` short-
//     circuits BEFORE any state/effect runs so Next.js can statically
//     eliminate the branch in `next build` and the button's code does
//     not ship to production.
//   - Only when `mode === 'published'`. In preview mode PreviewToolbar
//     already owns the exit affordance, so showing the button there
//     would duplicate the UI and the call (in the dispatch) is to keep
//     the toolbar as the single exit point.
//
// Styling:
//   - Inline styles only, hard-coded palette values. The admin token
//     stylesheet (AdminThemeBoot) is gated to preview mode — so on a
//     published page where this button lives, `--agntcms-admin-*` CSS
//     variables are not defined. We mirror the same accent colour
//     (#2DD4BF on #0A0A0A) the admin chrome uses so the button stays
//     visually coherent without taking a runtime dependency on the
//     stylesheet. Keep in sync with admin-theme.ts's accent tokens.
//
// IMPORT CONSTRAINTS (invariant 2):
//   - client-only. No imports from storage/, runtime/, handlers/, config/.

import { enterPreview } from './previewMode'
import type { PreviewMode } from './PreviewContext'

export interface EnterPreviewButtonProps {
  readonly mode: PreviewMode
}

export function EnterPreviewButton({ mode }: EnterPreviewButtonProps): React.ReactElement | null {
  // Dev-only gate: hoisted above any hook so Next's prod build can
  // dead-code-eliminate the whole component body. Do NOT move this
  // check inside an effect — that would prevent tree-shaking.
  if (process.env.NODE_ENV === 'production') return null

  // Hide in preview mode — PreviewToolbar already owns the exit UI and
  // we want a single exit point. See dispatch note for the trade-off.
  if (mode !== 'published') return null

  return (
    <button
      type="button"
      onClick={enterPreview}
      style={buttonStyle}
      title="Enter preview mode (edit content)"
      aria-label="Enter preview mode"
      data-testid="agntcms-enter-preview"
    >
      Edit
    </button>
  )
}

// --- Inline styles ---
//
// Hard-coded values mirror the admin token palette (see admin-theme.ts):
//   accent       -> #2DD4BF
//   accent-fg    -> #0A0A0A
// The stylesheet is not mounted on published pages, so we cannot use
// the CSS variables here. Keep this small surface in sync if the admin
// accent ever changes.

const buttonStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  padding: '10px 16px',
  backgroundColor: '#2DD4BF',
  color: '#0A0A0A',
  border: 'none',
  borderRadius: 999,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  // Sit above the host page chrome but below modal overlays
  // (PreviewToolbar uses 99999, modal uses 100000+).
  zIndex: 99998,
}
