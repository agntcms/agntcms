'use client'

// EditableText — plain text. For markdown-rendered text use `EditableRichText`.
//
// EditableText is bound to a `TextField` in a section schema (titles, URLs,
// slugs, SEO meta). It renders the value verbatim — no markdown processing —
// so a URL containing `*` or `_`, or a title containing literal `**`, renders
// as the author wrote it. React auto-escapes the text child, so there is no
// XSS risk from setting the content directly.
//
// Sibling component `EditableRichText` is for long-form copy bound to a
// `RichTextField` and DOES render markdown. The split mirrors the schema
// split in `domain/sectionSchema.ts`.
//
// Multi-line TextFields are uncommon but legal. We render with
// `whiteSpace: 'pre-wrap'` so embedded `\n` characters become visual line
// breaks without going through markdown's `<br/>` substitution.
//
// Architecture: the outer `EditableText` is a thin dispatcher that checks
// whether the field is a preview-wrapped value. If not, it returns a
// plain element immediately — zero hooks, zero state, zero overhead on
// the published hot path. If yes, it delegates to `EditableTextPreview`
// which owns the editing state (hooks live there unconditionally,
// satisfying the rules of hooks).
//
// The editing flow uses `PlainTextEditorModal` — a simple textarea modal
// with Save / Cancel and no toolbar. The markdown editor with B / I / link
// / Source / Preview is reserved for `EditableRichText`, matching the
// schema split: a TextField bound to a URL or SEO title must never get
// markdown affordances.
//
// IMPORT CONSTRAINTS:
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react, local editable/ files.

import { useState, useCallback } from 'react'
import type { EditableSlot } from '../../sections/index'
import type { PreviewFieldLike } from './isPreviewField'
import { isPreviewField } from './isPreviewField'
import { useSaveField } from './SaveContext'
import { PlainTextEditorModal } from './PlainTextEditorModal'
import {
  isBlankString,
  placeholderHintFromOrigin,
  PLACEHOLDER_HINT_STYLE,
} from './placeholderHint'

// Hover style injected via <style> tag — pseudo-classes cannot be set inline.
const EDITABLE_HOVER_STYLE = `
[data-agntcms-editable="text"]:hover {
  outline: 2px dashed var(--agntcms-admin-accent);
  outline-offset: 4px;
  box-shadow: var(--agntcms-admin-editable-halo);
}
`

// Inline style applied to all rendered tags. `pre-wrap` preserves embedded
// `\n` characters as visual line breaks — TextField values are usually
// single-line, but the schema does not forbid newlines.
const TEXT_DISPLAY_STYLE = { whiteSpace: 'pre-wrap' as const }
const TEXT_DISPLAY_STYLE_CLICKABLE = { whiteSpace: 'pre-wrap' as const, cursor: 'pointer' as const }

export interface EditableTextProps {
  /**
   * The slot for this text field. SectionRenderer hands every editable
   * field through `wrapAsSlot` (EDITABILITY_DESIGN.md sub-task 2), so the
   * component receives an `EditableSlot<'text', string>` whose `.value`
   * is either a bare string (published) or `PreviewFieldLike<string>`
   * (preview). The slot kind `'text'` makes a mismatched widget
   * (`<EditableImage field={textSlot}>`) a TS error.
   */
  readonly field: EditableSlot<'text', string>
  /** HTML tag to render. Default: 'div'. */
  readonly as?: keyof React.JSX.IntrinsicElements
  /** Additional className applied to the outer element. */
  readonly className?: string
  /** Called when the user saves an edit in preview mode. */
  readonly onSave?: (origin: PreviewFieldLike<string>['origin'], newValue: string) => void
}

/**
 * Renders a plain-text field value. In published mode, renders the raw
 * string in the specified tag with zero overhead. In preview mode,
 * delegates to an inner component that provides click-to-edit via a modal.
 */
export function EditableText(props: EditableTextProps): React.ReactElement {
  const { field: slot, as: Tag = 'div', className, onSave } = props
  // The slot is the public prop; the inner branches still consume the
  // underlying `V | PreviewFieldLike<V>` union via `slot.value`. Slots
  // are a type-system-only wrapper at this layer — runtime dispatch
  // continues to key off the `__agntcmsPreview` brand.
  const inner = slot.value

  // Published mode: plain text, no hooks, no state, no event listeners.
  // React auto-escapes the text child — no XSS risk.
  if (!isPreviewField<string>(inner)) {
    return (
      <Tag className={className} style={TEXT_DISPLAY_STYLE}>
        {inner ?? ''}
      </Tag>
    )
  }

  // Preview mode: delegate to the stateful inner component.
  return (
    <EditableTextPreview
      field={inner}
      as={Tag}
      className={className}
      onSave={onSave}
    />
  )
}

// ---------------------------------------------------------------------------
// Inner preview-mode component — owns editing state via hooks.
// ---------------------------------------------------------------------------

interface EditableTextPreviewProps {
  readonly field: PreviewFieldLike<string>
  readonly as: keyof React.JSX.IntrinsicElements
  // `| undefined` is explicit here because the outer component forwards
  // its optional props directly, and `exactOptionalPropertyTypes` requires
  // that the receiving type accepts `undefined` as a value, not just as
  // an absent key.
  readonly className: string | undefined
  readonly onSave: ((origin: PreviewFieldLike<string>['origin'], newValue: string) => void) | undefined
}

function EditableTextPreview(props: EditableTextPreviewProps): React.ReactElement {
  const { field, as: Tag, className, onSave } = props
  const contextSave = useSaveField()

  const [editing, setEditing] = useState(false)

  const handleClick = useCallback(() => {
    setEditing(true)
  }, [])

  const handleCancel = useCallback(() => {
    setEditing(false)
  }, [])

  // The modal passes the new value directly — no need for draft state here.
  // Prefer the explicit onSave prop (component-level wiring), fall back
  // to the SaveContext provider (page-level wiring from SectionEditControls).
  const handleSave = useCallback(
    (newValue: string) => {
      const saveFn = onSave ?? contextSave
      if (saveFn) {
        saveFn(field.origin, newValue)
      }
      setEditing(false)
    },
    [field.origin, onSave, contextSave],
  )

  // Empty/whitespace-only values would render as a zero-content element
  // (an empty `<h3>`, an empty `<div>`), giving editors no click target.
  // In preview mode we render a muted italic hint INSIDE the existing
  // wrapper element so styling, click handler, and hover outline all
  // continue to work. The hint is render-only — it never enters the
  // saved value (modal opens with `field.value`, not the hint text).
  const rawValue = field.value ?? ''
  const showPlaceholder = isBlankString(rawValue)
  const placeholder = showPlaceholder ? (
    <span style={PLACEHOLDER_HINT_STYLE}>
      {placeholderHintFromOrigin(field.origin.fieldPath)}
    </span>
  ) : null

  // Not currently editing: show text with hover outline affordance.
  if (!editing) {
    return (
      <>
        <style>{EDITABLE_HOVER_STYLE}</style>
        <Tag
          className={className}
          data-agntcms-editable="text"
          data-agntcms-field={field.origin.fieldPath}
          onClick={handleClick}
          style={TEXT_DISPLAY_STYLE_CLICKABLE}
        >
          {showPlaceholder ? placeholder : rawValue}
        </Tag>
      </>
    )
  }

  // Editing: show text in place + plain-text modal overlay. No toolbar,
  // no markdown processing — the modal's only job is to collect a new
  // string. Markdown editing lives in EditableRichText.
  return (
    <>
      <style>{EDITABLE_HOVER_STYLE}</style>
      <Tag
        className={className}
        data-agntcms-editable="text"
        data-agntcms-field={field.origin.fieldPath}
        style={TEXT_DISPLAY_STYLE}
      >
        {showPlaceholder ? placeholder : rawValue}
      </Tag>
      <PlainTextEditorModal
        value={field.value}
        fieldPath={field.origin.fieldPath}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </>
  )
}
