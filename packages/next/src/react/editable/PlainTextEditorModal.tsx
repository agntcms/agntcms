'use client'

// PlainTextEditorModal — simple textarea modal for EditableText.
//
// Sibling to MarkdownEditorModal. Both are internal — neither is exported
// from a barrel. EditableText opens this; EditableRichText opens the
// markdown editor. The split mirrors the schema split between TextField
// (plain) and RichTextField (markdown) in `domain/sectionSchema.ts`, so
// editing UX matches rendering UX: a URL or SEO title field gets a plain
// textarea, never a markdown toolbar with B / I / link / Source / Preview.
//
// Why a textarea and not <input type="text">: most TextField values are
// single-line (URL, slug, SEO title), but the schema does not forbid
// newlines (a brand tagline, a multi-line note). A textarea handles both.
// Newlines are preserved verbatim — EditableText renders with
// `whiteSpace: pre-wrap`, so saved line breaks survive round-trip.
//
// IMPORT CONSTRAINTS:
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react and the shared Modal. No agent context, no markdown
//     renderer — keeping the surface intentionally minimal.

import { useState, useCallback, useRef, useEffect } from 'react'

import { Modal } from '../shared/Modal'
import { Z_FIELD_EDITOR } from '../shared/zLayers'

export interface PlainTextEditorModalProps {
  readonly value: string
  readonly fieldPath: string
  readonly onSave: (newValue: string) => void
  readonly onCancel: () => void
}

/**
 * Plain-text editor modal: a single textarea, Save / Cancel footer, no
 * toolbar, no markdown processing. Escape / backdrop dismissal is owned
 * by the shared Modal.
 */
export function PlainTextEditorModal(props: PlainTextEditorModalProps): React.ReactElement {
  const { value, fieldPath, onSave, onCancel } = props
  const [draft, setDraft] = useState(value)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea on mount. Same pattern as MarkdownEditorModal so the
  // user can start typing immediately after click-to-edit.
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Ctrl/Cmd+S commits — keyboard parity with MarkdownEditorModal so
  // muscle memory transfers between plain and rich text fields. Escape
  // is owned by the shared Modal; registering it here would double-fire.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 's') {
        e.preventDefault()
        onSave(draft)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [draft, onSave])

  const handleSave = useCallback(() => {
    onSave(draft)
  }, [draft, onSave])

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
        onClick={handleSave}
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
        {/* Single textarea — no toolbar, no preview. Generous default
            height so multi-line content is comfortable to edit. */}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
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
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
      </Modal>
    </>
  )
}

// Styles for pseudo-classes that cannot be applied inline. Mirrors the
// subset of MarkdownEditorModal's styles that this modal actually uses.
const MODAL_STYLES = `
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
`
