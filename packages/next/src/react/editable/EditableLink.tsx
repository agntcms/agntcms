'use client'

// EditableLink — modal-based editor for a LinkField value.
//
// Same dispatcher pattern as the rest of the editable family. In
// published mode renders the label inside a span (the section component
// is the right place to render an actual `<a>` so it controls href and
// target/rel — keeping render policy out of the editor avoids the
// editor making framework-level decisions about navigation). In preview
// mode shows the label with the standard hover outline; clicking opens
// a modal that hosts the shared `<LinkSubForm>` (segmented Internal /
// External control + page picker / URL input + label + save).
//
// IMPORT CONSTRAINTS:
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react, local editable/ files, the shared Modal, and a
//     type-only import of LinkValue from `domain/`.

import { useCallback, useState } from 'react'
import type { CSSProperties } from 'react'
import type { LinkValue } from '../../domain/index'
import { normalizeLinkValue } from '../../domain/index'
import type { EditableSlot } from '../../sections/index'
import { Modal } from '../shared/Modal'
import { Z_FIELD_EDITOR } from '../shared/zLayers'
import type { PreviewFieldLike } from './isPreviewField'
import { isPreviewField } from './isPreviewField'
import { LinkSubForm, validateLinkForSave } from './LinkSubForm'
import { useSaveField } from './SaveContext'

const EDITABLE_HOVER_STYLE = `
[data-agntcms-editable="link"]:hover {
  outline: 2px dashed var(--agntcms-admin-accent);
  outline-offset: 4px;
  box-shadow: var(--agntcms-admin-editable-halo);
}
`

export interface EditableLinkProps {
  /**
   * The slot for this link field. `slot.value` is either a bare
   * `LinkValue` (published) or `PreviewFieldLike<LinkValue>` (preview).
   * The slot kind `'link'` rejects mismatched widgets at compile time.
   */
  readonly field: EditableSlot<'link', LinkValue>
  /** Additional className applied to the outer element. */
  readonly className?: string
  /** Called when the user saves an edit in preview mode. */
  readonly onSave?: (
    origin: PreviewFieldLike<LinkValue>['origin'],
    newValue: LinkValue,
  ) => void
}

export function EditableLink(props: EditableLinkProps): React.ReactElement {
  const { field: slot, className } = props
  const inner = slot.value

  // Published mode: a plain span carrying the label. The section is
  // expected to wrap this in its own `<a>` (or other navigation
  // primitive) using `hrefOf(field)` / `isExternalLink(field)` from
  // `@agntcms/next` directly.
  //
  // Defensive normalisation so unmigrated content (legacy
  // `{ href, label }`) still renders without crashing.
  if (!isPreviewField<LinkValue>(inner)) {
    const v = normalizeLinkValue(inner)
    return <span className={className}>{v.label}</span>
  }

  const innerProps: EditableLinkPreviewProps = {
    field: inner,
    className,
    onSave: props.onSave,
  }

  return <EditableLinkPreview {...innerProps} />
}

interface EditableLinkPreviewProps {
  readonly field: PreviewFieldLike<LinkValue>
  readonly className: string | undefined
  readonly onSave:
    | ((origin: PreviewFieldLike<LinkValue>['origin'], newValue: LinkValue) => void)
    | undefined
}

function EditableLinkPreview(props: EditableLinkPreviewProps): React.ReactElement {
  const { field, className, onSave } = props
  const contextSave = useSaveField()

  const initial = normalizeLinkValue(field.value)
  const [open, setOpen] = useState(false)
  // The draft is the in-flight LinkValue — held locally so Save commits
  // a single value and Cancel discards. Re-seeded on every modal open.
  const [draft, setDraft] = useState<LinkValue>(initial)
  // Validation error surfaced inside the modal. Reset on every open
  // and on any draft mutation so a stale "must start with http://"
  // does not survive after the user fixes the URL.
  const [error, setError] = useState<string | null>(null)

  const handleOpen = useCallback(() => {
    // Re-seed the draft from the current field value each time the
    // modal opens so background updates show through.
    setDraft(normalizeLinkValue(field.value))
    setError(null)
    setOpen(true)
  }, [field.value])

  const handleClose = useCallback(() => {
    setOpen(false)
    setError(null)
  }, [])

  const handleSave = useCallback(() => {
    const validationError = validateLinkForSave(draft)
    if (validationError !== null) {
      setError(validationError)
      return
    }
    const saveFn = onSave ?? contextSave
    if (saveFn) {
      saveFn(field.origin, draft)
    }
    setError(null)
    setOpen(false)
  }, [draft, field.origin, onSave, contextSave])

  return (
    <>
      <style>{EDITABLE_HOVER_STYLE}</style>
      <span
        className={className}
        data-agntcms-editable="link"
        data-agntcms-field={field.origin.fieldPath}
        onClick={handleOpen}
        style={{ cursor: 'pointer' }}
      >
        {field.value.label}
      </span>
      <Modal
        open={open}
        onClose={handleClose}
        ariaLabel="Edit link"
        title={<h2 style={titleStyle}>Edit link</h2>}
        maxWidth={480}
        maxHeight="auto"
        zIndex={Z_FIELD_EDITOR}
        footer={
          <>
            <button
              type="button"
              onClick={handleClose}
              style={{
                padding: '6px 12px',
                background: 'var(--agntcms-admin-surface-raised)',
                color: 'var(--agntcms-admin-fg)',
                border: '1px solid var(--agntcms-admin-border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              data-agntcms-link-save=""
              style={{
                padding: '6px 12px',
                background: 'var(--agntcms-admin-accent)',
                color: 'var(--agntcms-admin-accent-fg)',
                border: '1px solid var(--agntcms-admin-accent)',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Save
            </button>
          </>
        }
      >
        <LinkSubForm
          value={draft}
          onChange={(next) => {
            setDraft(next)
            setError(null)
          }}
          isOpen={open}
          error={error}
        />
      </Modal>
    </>
  )
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
}
