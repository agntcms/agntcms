'use client'

// MarkdownEditorModal — split-pane markdown editor modal for EditableText.
//
// Internal component, NOT exported from barrels. Only imported by
// EditableText. Uses the shared Modal shell (../shared/Modal) for
// overlay/panel/header/close/escape/backdrop mechanics. z-index
// `Z_FIELD_EDITOR` (see ../shared/zLayers) so it sits above both
// PreviewToolbar (99999) and the AdminModal "Edit global" host (100001).
//
// Pre-v0.5 the toolbar carried a sparkle button that dispatched a
// text_edit MCP task to the local agent. The channel was removed in v0.5
// (ARCHITECTURE.md sections 6 and 7); the toolbar now only carries
// formatting controls. The `origin` prop is retained on the public
// interface for forward-compat — it costs nothing and lets callers keep
// passing the field origin without churn.
//
// IMPORT CONSTRAINTS:
//   - "use client" component. Must NOT import from storage/, runtime/,
//     handlers/, config/.
//   - Uses only react, the shared Modal, and local editable/ files.

import { useState, useCallback, useRef, useEffect } from 'react'

import type { ImageValue } from '../../domain/index'
import { Modal } from '../shared/Modal'
import { Z_FIELD_EDITOR, Z_FIELD_EDITOR_PICKER } from '../shared/zLayers'
import { escapeMarkdownAlt } from './escapeMarkdownAlt'
import { ImagePickerModal } from './ImagePickerModal'
import type { PreviewFieldOriginLike } from './isPreviewField'
import { applyLinePrefix } from './prefixLines'
import { renderMarkdown } from './renderMarkdown'

export interface MarkdownEditorModalProps {
  readonly value: string
  readonly fieldPath: string
  /**
   * Field origin. Retained on the public interface for forward compat
   * after the v0.5 channel removal (it used to back the sparkle toolbar
   * button); no rendering depends on it today.
   */
  readonly origin?: PreviewFieldOriginLike
  readonly onSave: (newValue: string) => void
  readonly onCancel: () => void
}

/**
 * Split-pane markdown editor modal: source on the left, live preview on
 * the right. Provides toolbar buttons for bold, italic, link insertion,
 * and keyboard shortcuts (Ctrl/Cmd+S/B/I). Escape dismissal is owned by
 * the shared Modal.
 */
export function MarkdownEditorModal(props: MarkdownEditorModalProps): React.ReactElement {
  const { value, fieldPath, origin, onSave, onCancel } = props
  // `origin` no longer drives any rendering — accepted for backward
  // compat (see the type comment above). Suppress unused-var without
  // having to touch the call sites or weaken the prop type.
  void origin
  const [draft, setDraft] = useState(value)
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  // Feedback-loop guard for proportional scroll sync. When pane A's
  // onScroll programmatically writes pane B's scrollTop, the browser
  // synchronously fires B's onScroll, which would otherwise mirror back
  // to A and either stall the gesture or drift due to rounding. The flag
  // is cleared in rAF — after the bounced event has been swallowed but
  // before the next user-driven frame.
  const isSyncingRef = useRef(false)
  // Capture the textarea selection at the moment the image picker opens.
  // Mounting the picker pulls focus out of the textarea, so by the time the
  // user clicks Insert the live `selectionStart`/`selectionEnd` would both
  // be 0 — losing the original caret position. The saved range survives
  // the focus shift and lets us insert at (or replace) the spot the author
  // actually had selected.
  const savedImageRangeRef = useRef<{ start: number; end: number } | null>(null)

  // Focus textarea on mount.
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Wrap current textarea selection (or insert placeholder if none).
  const wrapSelection = useCallback(
    (before: string, after: string, placeholder: string) => {
      const ta = textareaRef.current
      if (!ta) return

      const start = ta.selectionStart
      const end = ta.selectionEnd
      const text = ta.value
      const selected = text.substring(start, end)
      const replacement = selected.length > 0 ? selected : placeholder
      const newText = text.substring(0, start) + before + replacement + after + text.substring(end)

      setDraft(newText)

      // Restore cursor position after React re-render.
      requestAnimationFrame(() => {
        ta.focus()
        const cursorStart = start + before.length
        const cursorEnd = cursorStart + replacement.length
        ta.setSelectionRange(cursorStart, cursorEnd)
      })
    },
    [],
  )

  // Prefix each line in the current selection (or the caret's line if
  // no selection) with `prefix`. Used for headings, lists, and quote.
  // The line-handling rules (skip blanks, drop blanks for list
  // prefixes, expand to line boundaries) live in the pure
  // applyLinePrefix helper so they can be unit-tested without a
  // textarea.
  const prefixLines = useCallback((prefix: string) => {
    const ta = textareaRef.current
    if (!ta) return

    const result = applyLinePrefix(ta.value, ta.selectionStart, ta.selectionEnd, prefix)
    setDraft(result.text)

    requestAnimationFrame(() => {
      ta.focus()
      // Select the prefixed block so the user can immediately see what
      // was affected and undo cleanly.
      ta.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }, [])

  // Keyboard shortcuts: Ctrl/Cmd+S/B/I. Escape is owned by the shared
  // Modal (registered at document level too) — registering it twice
  // would double-fire onCancel.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      if (e.key === 's') {
        e.preventDefault()
        onSave(draft)
      } else if (e.key === 'b') {
        e.preventDefault()
        wrapSelection('**', '**', 'bold text')
      } else if (e.key === 'i') {
        e.preventDefault()
        wrapSelection('*', '*', 'italic text')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [draft, onSave, wrapSelection])

  const handleBold = useCallback(() => {
    wrapSelection('**', '**', 'bold text')
  }, [wrapSelection])

  const handleItalic = useCallback(() => {
    wrapSelection('*', '*', 'italic text')
  }, [wrapSelection])

  const handleLink = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return

    const start = ta.selectionStart
    const end = ta.selectionEnd
    const text = ta.value
    const selected = text.substring(start, end)
    const linkText = selected.length > 0 ? selected : 'link text'
    const newText = text.substring(0, start) + '[' + linkText + '](url)' + text.substring(end)

    setDraft(newText)

    requestAnimationFrame(() => {
      ta.focus()
      // Select the "url" part for easy replacement.
      const urlStart = start + 1 + linkText.length + 2
      const urlEnd = urlStart + 3
      ta.setSelectionRange(urlStart, urlEnd)
    })
  }, [])

  // Open the shared ImagePickerModal so authors get the same browse /
  // upload / confirm-with-alt flow EditableImage uses, instead of typing
  // a `url` placeholder by hand. The textarea selection is stashed BEFORE
  // the picker mounts because the picker steals focus and would otherwise
  // collapse the live selection to (0, 0) by the time Insert is clicked.
  const handleImage = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    savedImageRangeRef.current = {
      start: ta.selectionStart,
      end: ta.selectionEnd,
    }
    setImagePickerOpen(true)
  }, [])

  // Insert the picker's result as real markdown at the saved selection,
  // replacing any previously-selected text. We do NOT try to wrap the
  // selection as alt — the picker collected an explicit alt, so the
  // selection is always treated as a range to replace.
  const handleImagePickerInsert = useCallback((value: ImageValue) => {
    const ta = textareaRef.current
    if (!ta) {
      setImagePickerOpen(false)
      return
    }

    // Prefer the saved range (captured before focus left the textarea).
    // Fall back to the live selection if for some reason the ref is null
    // — defensive, shouldn't happen via the toolbar button path.
    const range =
      savedImageRangeRef.current ?? {
        start: ta.selectionStart,
        end: ta.selectionEnd,
      }
    savedImageRangeRef.current = null

    const text = ta.value
    // why: `value.filename` is intentionally NOT escaped. The asset upload
    // pipeline produces content-addressable names of the form
    // `<sha256-hex><ext>` (see packages/next/src/storage/fs/assets.ts), so it
    // can never contain `(`, `)`, `]`, or other markdown-meaningful chars.
    const insertion = `![${escapeMarkdownAlt(value.alt)}](/assets/${value.filename})`
    const newText = text.substring(0, range.start) + insertion + text.substring(range.end)
    const insertedEnd = range.start + insertion.length

    setDraft(newText)
    setImagePickerOpen(false)

    requestAnimationFrame(() => {
      ta.focus()
      // Caret at the END of the inserted markdown — author can keep typing
      // immediately. No selection to highlight, since the picker already
      // collected everything needed (alt, filename).
      ta.setSelectionRange(insertedEnd, insertedEnd)
    })
  }, [])

  const handleImagePickerClose = useCallback(() => {
    savedImageRangeRef.current = null
    setImagePickerOpen(false)
  }, [])

  const handleStrikethrough = useCallback(() => {
    wrapSelection('~~', '~~', 'text')
  }, [wrapSelection])

  const handleH1 = useCallback(() => prefixLines('# '), [prefixLines])
  const handleH2 = useCallback(() => prefixLines('## '), [prefixLines])
  const handleH3 = useCallback(() => prefixLines('### '), [prefixLines])
  const handleH4 = useCallback(() => prefixLines('#### '), [prefixLines])
  const handleH5 = useCallback(() => prefixLines('##### '), [prefixLines])
  const handleH6 = useCallback(() => prefixLines('###### '), [prefixLines])
  const handleBulletList = useCallback(() => prefixLines('- '), [prefixLines])
  // The toolbar passes `'1. '` as a sentinel; applyLinePrefix recognizes
  // it and emits sequential numbers (`1. `, `2. `, …) per non-blank line
  // so the source stays readable when re-edited. Markdown itself accepts
  // any starting number, so the rendered list is identical either way.
  const handleNumberedList = useCallback(() => prefixLines('1. '), [prefixLines])
  const handleQuote = useCallback(() => prefixLines('> '), [prefixLines])
  const handleInlineCode = useCallback(() => {
    wrapSelection('`', '`', 'code')
  }, [wrapSelection])
  // Code block: wrap with fence on its own line above and below the
  // selection. The empty-selection placeholder seeds a single line of
  // "code" between the fences.
  const handleCodeBlock = useCallback(() => {
    wrapSelection('```\n', '\n```', 'code')
  }, [wrapSelection])

  // Mirror scroll position from `source` to `target` proportionally.
  // Both panes have different content heights (textarea source vs.
  // rendered HTML), so we map by ratio rather than absolute pixels.
  const syncScroll = useCallback(
    (source: HTMLElement, target: HTMLElement) => {
      if (isSyncingRef.current) return
      const sourceMax = source.scrollHeight - source.clientHeight
      const targetMax = target.scrollHeight - target.clientHeight
      // Content fits — nothing to sync, and dividing by zero would NaN
      // the assignment.
      if (sourceMax <= 0 || targetMax <= 0) return
      const ratio = source.scrollTop / sourceMax
      isSyncingRef.current = true
      target.scrollTop = ratio * targetMax
      requestAnimationFrame(() => {
        isSyncingRef.current = false
      })
    },
    [],
  )

  const handleSourceScroll = useCallback(() => {
    const ta = textareaRef.current
    const preview = previewRef.current
    if (ta === null || preview === null) return
    syncScroll(ta, preview)
  }, [syncScroll])

  const handlePreviewScroll = useCallback(() => {
    const ta = textareaRef.current
    const preview = previewRef.current
    if (ta === null || preview === null) return
    syncScroll(preview, ta)
  }, [syncScroll])

  const titleNode = (
    <span
      style={{
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--agntcms-admin-fg)',
        fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
      }}
    >
      {fieldPath}
    </span>
  )

  const footerNode = (
    <>
      <button
        type="button"
        onClick={onCancel}
        style={{
          background: 'var(--agntcms-admin-surface-raised)',
          border: '1px solid var(--agntcms-admin-border)',
          color: 'var(--agntcms-admin-fg)',
          borderRadius: '8px',
          padding: '8px 16px',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => onSave(draft)}
        data-agntcms-save-btn=""
        style={{
          background: 'var(--agntcms-admin-accent)',
          border: 'none',
          color: 'var(--agntcms-admin-accent-fg)',
          borderRadius: '8px',
          padding: '8px 16px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 600,
        }}
      >
        Save
      </button>
    </>
  )

  return (
    <>
      <style>{MODAL_STYLES}</style>
      <Modal
        open
        onClose={onCancel}
        title={titleNode}
        ariaLabel={`Edit ${fieldPath}`}
        zIndex={Z_FIELD_EDITOR}
        contentPadding={0}
        footer={footerNode}
      >
        {/* Toolbar */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            padding: '8px 16px',
            borderBottom: '1px solid var(--agntcms-admin-border)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={handleBold}
            data-agntcms-toolbar-btn=""
            style={{ ...TOOLBAR_BTN_STYLE, fontWeight: 700 }}
            title="Bold (Ctrl+B)"
          >
            B
          </button>
          <button
            type="button"
            onClick={handleItalic}
            data-agntcms-toolbar-btn=""
            style={{ ...TOOLBAR_BTN_STYLE, fontStyle: 'italic' }}
            title="Italic (Ctrl+I)"
          >
            I
          </button>
          <button
            type="button"
            onClick={handleStrikethrough}
            data-agntcms-toolbar-btn=""
            style={{ ...TOOLBAR_BTN_STYLE, textDecoration: 'line-through' }}
            title="Strikethrough"
            aria-label="Strikethrough"
          >
            S
          </button>
          <button
            type="button"
            onClick={handleLink}
            data-agntcms-toolbar-btn=""
            style={TOOLBAR_BTN_STYLE}
            title="Link"
          >
            🔗
          </button>
          <button
            type="button"
            onClick={handleImage}
            data-agntcms-toolbar-btn=""
            style={TOOLBAR_BTN_STYLE}
            title="Image"
            aria-label="Image"
          >
            🖼️
          </button>
          {/* Visual divider between inline-style buttons and block-style buttons. */}
          <span style={TOOLBAR_DIVIDER_STYLE} aria-hidden="true" />
          <button
            type="button"
            onClick={handleH1}
            data-agntcms-toolbar-btn=""
            style={TOOLBAR_BTN_STYLE}
            title="Heading 1"
          >
            H1
          </button>
          <button
            type="button"
            onClick={handleH2}
            data-agntcms-toolbar-btn=""
            style={TOOLBAR_BTN_STYLE}
            title="Heading 2"
          >
            H2
          </button>
          <button
            type="button"
            onClick={handleH3}
            data-agntcms-toolbar-btn=""
            style={TOOLBAR_BTN_STYLE}
            title="Heading 3"
          >
            H3
          </button>
          <button
            type="button"
            onClick={handleH4}
            data-agntcms-toolbar-btn=""
            style={TOOLBAR_BTN_STYLE}
            title="Heading 4"
          >
            H4
          </button>
          <button
            type="button"
            onClick={handleH5}
            data-agntcms-toolbar-btn=""
            style={TOOLBAR_BTN_STYLE}
            title="Heading 5"
          >
            H5
          </button>
          <button
            type="button"
            onClick={handleH6}
            data-agntcms-toolbar-btn=""
            style={TOOLBAR_BTN_STYLE}
            title="Heading 6"
          >
            H6
          </button>
          <span style={TOOLBAR_DIVIDER_STYLE} aria-hidden="true" />
          <button
            type="button"
            onClick={handleBulletList}
            data-agntcms-toolbar-btn=""
            style={TOOLBAR_BTN_STYLE}
            title="Bullet list"
            aria-label="Bullet list"
          >
            •
          </button>
          <button
            type="button"
            onClick={handleNumberedList}
            data-agntcms-toolbar-btn=""
            style={TOOLBAR_BTN_STYLE}
            title="Numbered list"
            aria-label="Numbered list"
          >
            1.
          </button>
          <button
            type="button"
            onClick={handleQuote}
            data-agntcms-toolbar-btn=""
            style={TOOLBAR_BTN_STYLE}
            title="Quote"
            aria-label="Blockquote"
          >
            ❝
          </button>
          <span style={TOOLBAR_DIVIDER_STYLE} aria-hidden="true" />
          <button
            type="button"
            onClick={handleInlineCode}
            data-agntcms-toolbar-btn=""
            style={{ ...TOOLBAR_BTN_STYLE, fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
            title="Inline code"
            aria-label="Inline code"
          >
            {'`'}
          </button>
          <button
            type="button"
            onClick={handleCodeBlock}
            data-agntcms-toolbar-btn=""
            style={{ ...TOOLBAR_BTN_STYLE, fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
            title="Code block"
            aria-label="Code block"
          >
            {'```'}
          </button>
        </div>

        {/* Split pane: source + preview */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Source pane */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              borderRight: '1px solid var(--agntcms-admin-border)',
            }}
          >
            <div
              style={{
                padding: '8px 16px',
                fontSize: '11px',
                color: 'var(--agntcms-admin-fg-dim)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
              }}
            >
              Source
            </div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onScroll={handleSourceScroll}
              style={{
                flex: 1,
                resize: 'none',
                background: 'var(--agntcms-admin-surface)',
                color: 'var(--agntcms-admin-fg)',
                border: 'none',
                padding: '12px 16px',
                fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
                fontSize: '14px',
                lineHeight: '1.6',
                outline: 'none',
                minHeight: '200px',
              }}
            />
          </div>

          {/* Preview pane */}
          <div
            ref={previewRef}
            onScroll={handlePreviewScroll}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'auto',
            }}
          >
            <div
              style={{
                padding: '8px 16px',
                fontSize: '11px',
                color: 'var(--agntcms-admin-fg-dim)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
              }}
            >
              Preview
            </div>
            <div
              data-agntcms-md-preview=""
              dangerouslySetInnerHTML={{ __html: renderMarkdown(draft) }}
              style={{
                flex: 1,
                padding: '12px 16px',
                background: 'var(--agntcms-admin-surface)',
                color: 'var(--agntcms-admin-fg)',
                fontFamily: 'var(--font-body, system-ui, -apple-system, sans-serif)',
                fontSize: '14px',
                lineHeight: '1.6',
              }}
            />
          </div>
        </div>
      </Modal>
      {/* Z_FIELD_EDITOR_PICKER sits one rung above the editor
          (Z_FIELD_EDITOR). Single satellite modal today; the explicit
          ordering keeps it well-formed if more are added in the future. */}
      <ImagePickerModal
        open={imagePickerOpen}
        onClose={handleImagePickerClose}
        onInsert={handleImagePickerInsert}
        zIndex={Z_FIELD_EDITOR_PICKER}
      />
    </>
  )
}

// Shared toolbar button style — extracted because we now have eight
// of them and the inline duplication was getting noisy. Individual
// buttons override fontWeight / fontStyle / fontFamily as needed.
const TOOLBAR_BTN_STYLE = {
  background: 'var(--agntcms-admin-surface-raised)',
  border: '1px solid var(--agntcms-admin-border)',
  color: 'var(--agntcms-admin-fg)',
  borderRadius: '6px',
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: '13px',
  lineHeight: '20px',
} as const

const TOOLBAR_DIVIDER_STYLE = {
  width: '1px',
  alignSelf: 'stretch',
  margin: '2px 4px',
  background: 'var(--agntcms-admin-border)',
} as const

// Styles for pseudo-classes that cannot be applied inline.
const MODAL_STYLES = `
[data-agntcms-toolbar-btn]:hover {
  background: var(--agntcms-admin-accent) !important;
  color: var(--agntcms-admin-accent-fg) !important;
}
[data-agntcms-toolbar-btn]:focus-visible {
  outline: 2px solid var(--agntcms-admin-focus-ring);
  outline-offset: 2px;
}
[data-agntcms-toolbar-btn]:disabled {
  cursor: not-allowed !important;
}
[data-agntcms-toolbar-btn]:disabled:hover {
  background: var(--agntcms-admin-surface-raised) !important;
  color: var(--agntcms-admin-fg) !important;
}
[data-agntcms-save-btn]:hover {
  background: var(--agntcms-admin-accent-hover) !important;
}
[data-agntcms-save-btn]:focus-visible {
  outline: 2px solid var(--agntcms-admin-focus-ring);
  outline-offset: 2px;
}
[data-agntcms-modal-close]:hover {
  color: var(--agntcms-admin-fg) !important;
}
[data-agntcms-md-preview] a {
  color: var(--agntcms-admin-accent);
  text-decoration: underline;
}
[data-agntcms-md-preview] ol,
[data-agntcms-md-preview] ul {
  padding-inline-start: 24px;
  margin: 8px 0;
}
[data-agntcms-md-preview] ol {
  list-style: decimal;
}
[data-agntcms-md-preview] ul {
  list-style: disc;
}
[data-agntcms-md-preview] li {
  margin: 2px 0;
}
[data-agntcms-md-preview] blockquote {
  border-left: 3px solid var(--agntcms-admin-border);
  padding: 4px 12px;
  margin: 8px 0;
  color: var(--agntcms-admin-fg-dim);
}
[data-agntcms-md-preview] pre {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  background: var(--agntcms-admin-surface-raised);
  padding: 8px 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
}
[data-agntcms-md-preview] code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  background: var(--agntcms-admin-surface-raised);
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 0.9em;
}
[data-agntcms-md-preview] pre code {
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}
[data-agntcms-md-preview] h1,
[data-agntcms-md-preview] h2,
[data-agntcms-md-preview] h3,
[data-agntcms-md-preview] h4,
[data-agntcms-md-preview] h5,
[data-agntcms-md-preview] h6 {
  margin: 12px 0 6px;
  line-height: 1.2;
  font-weight: 600;
}
[data-agntcms-md-preview] h1 {
  font-size: 1.4em;
}
[data-agntcms-md-preview] h2 {
  font-size: 1.25em;
}
[data-agntcms-md-preview] h3 {
  font-size: 1.1em;
}
[data-agntcms-md-preview] h4,
[data-agntcms-md-preview] h5,
[data-agntcms-md-preview] h6 {
  font-size: 1em;
}
[data-agntcms-md-preview] hr {
  border: 0;
  border-top: 1px solid var(--agntcms-admin-border);
  margin: 12px 0;
}
[data-agntcms-md-preview] img {
  max-width: 100%;
  height: auto;
}
`
