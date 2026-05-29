'use client'

// PreviewToolbar — small floating bar visible only in preview mode.
// Shows: "Preview Mode" label | Publish | (Discard draft) | Admin panel | Exit Preview.
//
// IMPORT CONSTRAINTS (invariant 2):
//   - runtime import of `react` only.
//   - local import from PreviewContext (same client module).
//   - NOTHING from storage/, runtime/, handlers/, config/.

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

import { AdminModal } from '../admin/AdminModal'
import { Modal } from '../shared/Modal'
import { resolveInitialAdminTheme, setAdminTheme } from '../admin/AdminThemeBoot'
import type { AdminTheme } from '../admin/admin-theme'
import type { DefinitionLike } from '../section-replace/SectionPickerModal'
import { usePreviewMode } from './PreviewContext'
import { exitPreview } from './previewMode'

type PublishState = 'idle' | 'publishing' | 'done' | 'error'

const publishLabel: Record<PublishState, string> = {
  idle: 'Publish',
  publishing: 'Publishing...',
  done: 'Published!',
  error: 'Error',
}

/**
 * Derive the content slug from a Next.js pathname.
 *
 * Kept module-scope and pure so it stays SSR-safe — `window` is not available
 * during server rendering of client components, which is when JSX-attribute
 * call sites (vs. event handlers) evaluate. Callers feed in the value from
 * `usePathname()`.
 */
function slugFromPathname(pathname: string | null): string {
  if (pathname === null) return 'home'
  return pathname.slice(1) || 'home'
}

export interface PreviewToolbarProps {
  /**
   * Optional section definitions. When provided, the Admin modal's
   * Edit-global flow renders the real section component with inline
   * editable fields instead of a generic form. Forwarded verbatim to
   * AdminModal.
   */
  readonly definitions?: readonly DefinitionLike[]
}

/**
 * Fixed-position bar at the bottom of the viewport, visible only in preview mode.
 * Layout: "Preview Mode" | Publish | (Discard draft) | Admin panel | Exit Preview.
 */
export function PreviewToolbar(props: PreviewToolbarProps = {}): React.ReactElement | null {
  const { definitions } = props
  const mode = usePreviewMode()
  const router = useRouter()
  // usePathname is SSR-safe (returns the request path on the server, the
  // current path on the client) so the slug is available during the initial
  // render of this client component — before any event handler fires.
  const pathname = usePathname()
  const slug = slugFromPathname(pathname)
  const [publishState, setPublishState] = useState<PublishState>('idle')
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  // Whether the current page has a pending draft. Null = not yet known.
  // Used to gate the "Discard draft" button. Refreshed when the publish
  // flow completes (publish removes the draft) and on mount.
  const [hasDraft, setHasDraft] = useState<boolean | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [discardBusy, setDiscardBusy] = useState(false)
  // Active admin theme, mirrored in React so the toggle icon updates
  // immediately. Initialised to 'dark' (the SSR-safe default) and corrected
  // on mount from the persisted/OS-resolved value — never read window during
  // render. AdminThemeBoot owns writing the initial <html> attribute; here we
  // only mirror it and flip it on click.
  const [theme, setTheme] = useState<AdminTheme>('dark')

  // Mirror the resolved theme on mount (after AdminThemeBoot has seeded it).
  useEffect(() => {
    setTheme(resolveInitialAdminTheme())
  }, [])

  // Probe draft existence when mounted in preview mode, and re-probe after
  // mutations that could change it (publish removes the draft). Uses the
  // existing /draft/list endpoint — no new server plumbing needed.
  useEffect(() => {
    if (mode !== 'preview') return
    let cancelled = false
    fetch('/api/agntcms/draft/list')
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        if (cancelled || body === null || typeof body !== 'object') return
        const drafts = (body as { drafts?: ReadonlyArray<{ slug?: string }> }).drafts
        if (!Array.isArray(drafts)) return
        setHasDraft(drafts.some((d) => d.slug === slug))
      })
      .catch(() => {
        // Treat failures as "unknown"; worst case the Discard button is
        // hidden and the user refreshes. Better than surfacing a cryptic
        // error for a non-critical probe.
      })
    return () => {
      cancelled = true
    }
    // publishState transitions to 'done' after a successful publish (which
    // deletes the draft); re-run the probe so the button hides. `slug` is a
    // dep so a client-side route change re-runs the probe for the new page.
  }, [mode, publishState, slug])

  if (mode !== 'preview') {
    return null
  }

  const handlePublish = (): void => {
    if (publishState === 'publishing' || publishState === 'done') return

    setPublishState('publishing')

    fetch('/api/agntcms/draft/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
      .then((res) => {
        if (!res.ok) {
          setPublishState('error')
          return
        }
        setPublishState('done')
        // router.refresh() re-runs server components so the newly-published
        // content replaces the draft-decorated tree without a hard reload —
        // scroll position and client-only state (open modals, focus) are
        // preserved. Return the button to 'idle' after a short delay so
        // the user can publish again (e.g. after more edits) without
        // reloading the page.
        router.refresh()
        setTimeout(() => {
          setPublishState('idle')
        }, 1500)
      })
      .catch(() => {
        setPublishState('error')
      })
  }

  const handleDiscardClick = (): void => {
    setDiscardOpen(true)
  }

  const handleDiscardCancel = (): void => {
    if (discardBusy) return
    setDiscardOpen(false)
  }

  const handleDiscardConfirm = (): void => {
    if (discardBusy) return
    setDiscardBusy(true)
    fetch('/api/agntcms/draft/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
      .then(async (res) => {
        setDiscardBusy(false)
        setDiscardOpen(false)
        if (!res.ok) {
          // Best-effort error surface — the success path is far more
          // common, so a simple alert is acceptable here.
          const msg = await res.text().catch(() => '')
          // eslint-disable-next-line no-restricted-globals
          alert(`Failed to discard draft: ${msg || res.status}`)
          return
        }
        setHasDraft(false)
        router.refresh()
      })
      .catch(() => {
        setDiscardBusy(false)
        setDiscardOpen(false)
        // eslint-disable-next-line no-restricted-globals
        alert('Failed to discard draft.')
      })
  }

  // Exit logic lives in the shared `exitPreview` helper so the
  // floating EnterPreviewButton and this toolbar share one
  // implementation. Best-effort reload is built into the helper.
  const handleExit = exitPreview

  const handleThemeToggle = (): void => {
    const next: AdminTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    // setAdminTheme writes the <html> attribute + persists to localStorage.
    setAdminTheme(next)
  }

  return (
    <div style={toolbarStyle}>
      <span style={labelStyle}>Preview Mode</span>
      <button
        type="button"
        onClick={handleThemeToggle}
        style={iconButtonStyle}
        data-testid="agntcms-theme-toggle"
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {/* Show the glyph for the theme you'd switch TO. */}
        {theme === 'dark' ? '☀' : '☽'}
      </button>
      <button
        type="button"
        onClick={handlePublish}
        disabled={publishState === 'publishing' || publishState === 'done'}
        style={publishState === 'error' ? errorButtonStyle : publishButtonStyle}
      >
        {publishLabel[publishState]}
      </button>

      {hasDraft === true && (
        <button
          type="button"
          onClick={handleDiscardClick}
          style={buttonStyle}
          data-testid="agntcms-discard-draft"
          title="Discard the current draft and revert to the published version"
        >
          Discard draft
        </button>
      )}

      <button
        type="button"
        onClick={() => setAdminModalOpen(true)}
        style={buttonStyle}
        data-testid="agntcms-m-menu"
        title="Open admin panel"
        aria-label="Open admin panel"
      >
        Admin panel
      </button>

      <button type="button" onClick={handleExit} style={buttonStyle}>
        Exit Preview
      </button>

      <AdminModal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        {...(definitions !== undefined ? { definitions } : {})}
      />

      {discardOpen && (
        <Modal
          open={true}
          onClose={handleDiscardCancel}
          title={<span style={{ fontWeight: 600, fontSize: 16 }}>Discard draft</span>}
          ariaLabel="Discard draft"
          zIndex={100001}
          maxWidth={480}
          maxHeight="auto"
          footer={
            <>
              <button
                type="button"
                onClick={handleDiscardCancel}
                disabled={discardBusy}
                style={buttonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDiscardConfirm}
                disabled={discardBusy}
                style={errorButtonStyle}
                data-testid="agntcms-discard-draft-confirm"
              >
                {discardBusy ? 'Discarding...' : 'Discard'}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              Discard this draft? Unpublished changes will be lost. This cannot be undone.
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}

// --- Inline styles (KISS: no CSS modules, no tailwind) ---

const toolbarStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  padding: '8px 16px',
  backgroundColor: 'var(--agntcms-admin-surface)',
  color: 'var(--agntcms-admin-fg)',
  // Frosted glass: the backdrop blur + dark tint + soft elevation separate
  // the toolbar from any host page (light or dark). The faint white hairline
  // on top only crisps the edge. WebkitBackdropFilter mirrors backdropFilter
  // for Safari/older WebKit; the @supports fallback in admin-theme.ts swaps
  // the translucent surface for an opaque one where blur is unsupported.
  backdropFilter: 'var(--agntcms-admin-backdrop)',
  WebkitBackdropFilter: 'var(--agntcms-admin-backdrop)',
  borderTop: '1px solid var(--agntcms-admin-border)',
  boxShadow: 'var(--agntcms-admin-elevation)',
  fontFamily: 'var(--font-body, system-ui, -apple-system, sans-serif)',
  fontSize: '14px',
  zIndex: 99999,
}

const labelStyle: React.CSSProperties = {
  fontWeight: 600,
}

const buttonStyle: React.CSSProperties = {
  padding: '4px 12px',
  backgroundColor: 'var(--agntcms-admin-surface-raised)',
  color: 'var(--agntcms-admin-fg)',
  // Hairline border keeps secondary buttons discernible against the toolbar
  // surface — without it, surface-raised vs surface read as one flat slab.
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: '4px',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
}

// Square icon button (theme toggle). Same tokens as buttonStyle; sized for a
// single glyph so it doesn't stretch the toolbar layout.
const iconButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  padding: 0,
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '15px',
  lineHeight: 1,
}

const publishButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  backgroundColor: 'var(--agntcms-admin-accent)',
  color: 'var(--agntcms-admin-accent-fg)',
}

const errorButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  backgroundColor: 'var(--agntcms-admin-danger-strong)',
  color: 'var(--agntcms-admin-on-accent)',
}
