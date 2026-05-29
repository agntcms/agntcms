'use client'

// EditableRichText — inline-editable rich-text (markdown) field for preview mode.
//
// Sibling component to `EditableText`. EditableRichText is for long-form copy
// bound to a `RichTextField` in a section schema (body copy, descriptions,
// FAQ answers). It renders the value through a minimal markdown pass
// (`**bold**`, `*italic*`, `[links](url)`, `\n` → `<br/>`).
//
// EditableText (the sibling) is for plain-text fields (titles, URLs, slugs,
// SEO meta) and renders the value verbatim with no markdown processing. The
// split mirrors the schema split in `domain/sectionSchema.ts` so authors don't
// accidentally get markdown processing on URLs or SEO titles.
//
// Architecture: the outer `EditableRichText` is a thin dispatcher that checks
// whether the field is a preview-wrapped value. If not, it returns a
// plain element immediately — zero hooks, zero state, zero overhead on
// the published hot path. If yes, it delegates to `EditableRichTextPreview`
// which owns the editing state (hooks live there unconditionally,
// satisfying the rules of hooks).
//
// Editing uses a modal with a split-pane markdown editor (source left,
// preview right). The modal manages its own draft state; this component
// only tracks whether the modal is open.
//
// IMPORT CONSTRAINTS:
//   - "use client" component. Must NOT import from storage/, runtime/,
//     handlers/, config/.
//   - Uses only react, local editable/ files.

import { useState, useCallback } from 'react'
import type { EditableSlot } from '../../sections/index'
import type { PreviewFieldLike } from './isPreviewField'
import { isPreviewField } from './isPreviewField'
import { useSaveField } from './SaveContext'
import { MarkdownEditorModal } from './MarkdownEditorModal'
import { renderMarkdown } from './renderMarkdown'
import {
  isBlankString,
  placeholderHintFromOrigin,
  PLACEHOLDER_HINT_STYLE,
} from './placeholderHint'

// Hover style injected via <style> tag — pseudo-classes cannot be set inline.
const EDITABLE_HOVER_STYLE = `
[data-agntcms-editable="rich-text"]:hover {
  outline: 2px dashed var(--agntcms-admin-accent);
  outline-offset: 4px;
  box-shadow: var(--agntcms-admin-editable-halo);
}
`

export interface EditableRichTextProps {
  /**
   * The slot for this rich-text field. The slot kind `'richText'` is
   * distinct from `'text'` so passing a `RichTextField` slot to
   * `<EditableText>` (or vice versa) is a TS error — closing the
   * substring-overlap blind spot the old heuristic gate had.
   * `slot.value` is `string | PreviewFieldLike<string>`.
   */
  readonly field: EditableSlot<'richText', string>
  /** HTML tag to render. Default: 'div'. */
  readonly as?: keyof React.JSX.IntrinsicElements
  /** Additional className applied to the outer element. */
  readonly className?: string
  /** Called when the user saves an edit in preview mode. */
  readonly onSave?: (origin: PreviewFieldLike<string>['origin'], newValue: string) => void
}

/**
 * Renders a rich-text field value with markdown processing. In published
 * mode, renders markdown-derived HTML in the specified tag with zero
 * overhead. In preview mode, delegates to an inner component that provides
 * click-to-edit via a modal markdown editor.
 */
export function EditableRichText(props: EditableRichTextProps): React.ReactElement {
  const { field: slot, as: Tag = 'div', className, onSave } = props
  const inner = slot.value

  // Published mode: rendered markdown HTML, no hooks, no state, no event listeners.
  if (!isPreviewField<string>(inner)) {
    return <Tag className={className} dangerouslySetInnerHTML={{ __html: renderMarkdown(inner) }} />
  }

  // Preview mode: delegate to the stateful inner component.
  return (
    <EditableRichTextPreview
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

interface EditableRichTextPreviewProps {
  readonly field: PreviewFieldLike<string>
  readonly as: keyof React.JSX.IntrinsicElements
  // `| undefined` is explicit here because the outer component forwards
  // its optional props directly, and `exactOptionalPropertyTypes` requires
  // that the receiving type accepts `undefined` as a value, not just as
  // an absent key.
  readonly className: string | undefined
  readonly onSave: ((origin: PreviewFieldLike<string>['origin'], newValue: string) => void) | undefined
}

function EditableRichTextPreview(props: EditableRichTextPreviewProps): React.ReactElement {
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
  // (an empty `<div>`), giving editors no click target. In preview mode
  // we render a muted italic hint INSIDE the existing wrapper element.
  // The hint is render-only — it never enters the saved value (modal
  // opens with `field.value`, not the hint text).
  //
  // Switching to children-rendering when blank means we cannot use
  // `dangerouslySetInnerHTML` on the same element (React forbids both
  // `children` and `dangerouslySetInnerHTML` on one element). The blank
  // case has no markdown to render anyway, so the trade-off is free.
  const showPlaceholder = isBlankString(field.value)
  const placeholderHint = placeholderHintFromOrigin(field.origin.fieldPath)

  // Not currently editing: show text with hover outline affordance.
  if (!editing) {
    if (showPlaceholder) {
      return (
        <>
          <style>{EDITABLE_HOVER_STYLE}</style>
          <Tag
            className={className}
            data-agntcms-editable="rich-text"
            data-agntcms-field={field.origin.fieldPath}
            onClick={handleClick}
            style={{ cursor: 'pointer' }}
          >
            <span style={PLACEHOLDER_HINT_STYLE}>{placeholderHint}</span>
          </Tag>
        </>
      )
    }
    return (
      <>
        <style>{EDITABLE_HOVER_STYLE}</style>
        <Tag
          className={className}
          data-agntcms-editable="rich-text"
          data-agntcms-field={field.origin.fieldPath}
          onClick={handleClick}
          style={{ cursor: 'pointer' }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(field.value) }}
        />
      </>
    )
  }

  // Editing: show text in place + modal overlay. We still forward the
  // field origin to the modal — it's kept on the prop type for forward
  // compat after the v0.5 channel removal.
  if (showPlaceholder) {
    return (
      <>
        <style>{EDITABLE_HOVER_STYLE}</style>
        <Tag
          className={className}
          data-agntcms-editable="rich-text"
          data-agntcms-field={field.origin.fieldPath}
        >
          <span style={PLACEHOLDER_HINT_STYLE}>{placeholderHint}</span>
        </Tag>
        <MarkdownEditorModal
          value={field.value}
          fieldPath={field.origin.fieldPath}
          origin={field.origin}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </>
    )
  }
  return (
    <>
      <style>{EDITABLE_HOVER_STYLE}</style>
      <Tag
        className={className}
        data-agntcms-editable="rich-text"
        data-agntcms-field={field.origin.fieldPath}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(field.value) }}
      />
      <MarkdownEditorModal
        value={field.value}
        fieldPath={field.origin.fieldPath}
        origin={field.origin}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </>
  )
}
