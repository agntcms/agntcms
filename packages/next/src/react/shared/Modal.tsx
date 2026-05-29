'use client'

// -----------------------------------------------------------------------
// Modal — internal shared modal shell for the react/ layer.
//
// Extracted from MarkdownEditorModal and SectionPickerModal after they
// converged on the same overlay/panel/header/close/escape/backdrop
// skeleton. Callers pass the content, optional footer, and dimensions.
//
// NOT exported from any public barrel. This is an internal composition
// primitive — the two callers import it directly via `../shared/Modal`.
//
// IMPORT CONSTRAINTS (invariants 1 + 2):
//   - "use client" component. Must NOT import from storage/, runtime/
//     (values), mcp/, tasks/, handlers/, config/.
//   - Uses only `react` and `react-dom` (for createPortal) and nothing else.
//
// WHY portal to document.body?
// The fixed-position overlay (inset: 0) must be positioned against the
// viewport. But a modal is rendered as a DOM child of whatever opens it —
// e.g. AdminModal and the Discard modal are children of PreviewToolbar's
// frosted bar. An ancestor carrying `backdrop-filter` (or `filter` /
// `transform`) becomes the containing block for ITS `position: fixed`
// descendants, so the overlay would size/position against that small bar
// (pinning the modal to the bottom of the screen) instead of the viewport.
// Portaling the rendered tree to <body> escapes any such ancestor's
// containing block, so the centering is always relative to the viewport.
// -----------------------------------------------------------------------

import { useEffect, useState, useCallback, useRef, type ReactElement, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

// ---------------------------------------------------------------------------
// Modal stack — module-level registry of currently-open Modal instances, in
// mount order. Each ModalBody pushes a token on mount and pops it on unmount.
// On Escape, only the instance at the top of the stack calls its onClose so
// nested modals (e.g. PageMetadataModal layered over AdminModal) close one
// at a time instead of all at once.
// ---------------------------------------------------------------------------

const modalStack: symbol[] = []

function pushModal(token: symbol): void {
  modalStack.push(token)
}

function popModal(token: symbol): void {
  const index = modalStack.lastIndexOf(token)
  if (index !== -1) modalStack.splice(index, 1)
}

function isTopModal(token: symbol): boolean {
  return modalStack[modalStack.length - 1] === token
}

export interface ModalProps {
  /** Whether the modal is open. When false, renders nothing. */
  readonly open: boolean
  /** Called when the modal should close (Escape, backdrop, close button). */
  readonly onClose: () => void
  /** Header content rendered on the left side of the header row. */
  readonly title: ReactNode
  /** Modal body content. */
  readonly children: ReactNode
  /** Optional footer row rendered below the body with a border-top. */
  readonly footer?: ReactNode
  /** Maximum panel width in pixels. Default 960. */
  readonly maxWidth?: number
  /** Maximum panel height (any CSS height string). Default '85vh'. */
  readonly maxHeight?: string
  /**
   * z-index for the overlay. Default 1000. Callers opened from preview
   * must pass at least 100000 to sit above PreviewToolbar (99999).
   */
  readonly zIndex?: number
  /** aria-label for the dialog. */
  readonly ariaLabel?: string
  /** Padding applied to the body container. Default 24. */
  readonly contentPadding?: number | string
}

// ---------------------------------------------------------------------------
// Outer wrapper: returns null without calling hooks when closed. This lets
// tests invoke Modal({ open: false }) directly without triggering React's
// hook rules. When open, it delegates to ModalBody which owns the hooks.
// Same split pattern as EditableText -> EditableTextPreview.
// ---------------------------------------------------------------------------

export function Modal(props: ModalProps): ReactElement | null {
  if (!props.open) return null
  return <ModalBody {...props} />
}

// ---------------------------------------------------------------------------
// Inner body — hooks live here.
// ---------------------------------------------------------------------------

function ModalBody(props: ModalProps): ReactElement | null {
  const {
    onClose,
    title,
    children,
    footer,
    maxWidth = 960,
    maxHeight = '85vh',
    zIndex = 1000,
    ariaLabel,
    contentPadding = 24,
  } = props

  // The portal target (document.body) is only available on the client.
  // Render nothing until mounted so SSR and the first hydration pass don't
  // touch `document`. In practice ModalBody only mounts after a client
  // event toggles `open`, but the guard keeps the component SSR-safe.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Escape dismissal. Registered at document level so it works regardless
  // of focus location inside the modal. Only the top modal in the stack
  // reacts, so nested modals close one layer at a time.
  const tokenRef = useRef<symbol | null>(null)
  if (tokenRef.current === null) tokenRef.current = Symbol('modal')

  useEffect(() => {
    const token = tokenRef.current as symbol
    pushModal(token)
    return () => {
      popModal(token)
    }
  }, [])

  useEffect(() => {
    const token = tokenRef.current as symbol
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      if (!isTopModal(token)) return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Lock body scroll while mounted. ModalBody only mounts when open === true
  // (see outer Modal), so mount/unmount lines up with open/close. We save and
  // restore the prior inline overflow to avoid stomping any value set elsewhere
  // (e.g. '', 'auto', or 'hidden' from a parent lock). Only <body> is touched;
  // <html> is left alone so Next.js's scroll restoration keeps working.
  // Not exercised in unit tests (requires jsdom — intentionally avoided here).
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Close when the backdrop is clicked but not when the panel is clicked.
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  // After all hooks: bail before touching document.body during SSR/first paint.
  if (!mounted) return null

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex,
    background: 'var(--agntcms-admin-surface-overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const panelStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    maxWidth,
    height: maxHeight,
    maxHeight,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--agntcms-admin-surface)',
    // Frosted glass: blur + dark tint + soft elevation do the separating,
    // the faint white hairline only crisps the edge. WebkitBackdropFilter
    // mirrors backdropFilter for Safari/older WebKit.
    backdropFilter: 'var(--agntcms-admin-backdrop)',
    WebkitBackdropFilter: 'var(--agntcms-admin-backdrop)',
    border: '1px solid var(--agntcms-admin-border)',
    borderRadius: 12,
    boxShadow: 'var(--agntcms-admin-elevation)',
    overflow: 'hidden',
    fontFamily: 'var(--font-body, system-ui, -apple-system, sans-serif)',
  }

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--agntcms-admin-border)',
    flexShrink: 0,
  }

  const closeButtonStyle: CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '1px solid var(--agntcms-admin-border)',
    background: 'var(--agntcms-admin-surface-raised)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    color: 'var(--agntcms-admin-fg-muted)',
    lineHeight: 1,
    padding: 0,
  }

  const bodyStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: contentPadding,
    display: 'flex',
    flexDirection: 'column',
  }

  const footerStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '12px 16px',
    borderTop: '1px solid var(--agntcms-admin-border)',
    flexShrink: 0,
  }

  // Portal to <body> so the fixed overlay escapes any frosted/transformed
  // ancestor's containing block (see the WHY note at the top of the file).
  return createPortal(
    <div style={overlayStyle} onClick={handleOverlayClick} data-agntcms-modal-backdrop="">
      <div
        role="dialog"
        aria-modal="true"
        {...(ariaLabel !== undefined ? { 'aria-label': ariaLabel } : {})}
        style={panelStyle}
      >
        <div style={headerStyle}>
          <div style={{ minWidth: 0, flex: 1 }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-agntcms-modal-close=""
            style={closeButtonStyle}
          >
            {'\u00D7'}
          </button>
        </div>
        <div style={bodyStyle}>{children}</div>
        {footer !== undefined ? <div style={footerStyle}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
