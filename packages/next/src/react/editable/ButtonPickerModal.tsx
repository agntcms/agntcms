'use client'

// ButtonPickerModal — modal-based picker for a `ButtonField`.
//
// Architecture mirrors `VideoPickerModal` (standalone modal shell that
// callers mount themselves) rather than `EditableLink`'s inline modal,
// so external callers (e.g. a future custom widget) can reuse the
// picker without the EditableButton wrapper. The modal body delegates
// to the shared `<ButtonSubForm>` so the in-modal experience matches
// the in-list-item-form experience exactly.
//
// Save policy: like `VideoPickerModal`, the modal does NOT block save
// on validation. The author can save a button with no link, with an
// empty internal slug, or with an unknown variant — every case is
// recoverable (the picker re-opens with the stored state). The link
// sub-form surfaces inline validation hints as the user types.
//
// IMPORT CONSTRAINTS (invariants 1 + 2):
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only `react`, the shared Modal shell, sibling editable/
//     files, and type-only imports from `domain/`.

import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'
import type { ButtonValue, SelectOption } from '../../domain/index'
import { Modal } from '../shared/Modal'
import { Z_FIELD_EDITOR } from '../shared/zLayers'
import { ButtonSubForm } from './ButtonSubForm'

export interface ButtonPickerModalProps {
  readonly open: boolean
  readonly onClose: () => void
  /**
   * Fired when the user clicks Save. The caller is responsible for
   * persisting the value; the modal also calls `onClose` immediately
   * afterwards.
   */
  readonly onInsert: (value: ButtonValue) => void
  /** Variants list from the descriptor. */
  readonly variants: ReadonlyArray<SelectOption>
  /** Current value, used to seed the inputs on open. */
  readonly initialValue?: ButtonValue
  /**
   * Stacking override. Defaults to `Z_FIELD_EDITOR` — same plane as
   * VideoPickerModal / ImagePickerModal.
   */
  readonly zIndex?: number
}

export function ButtonPickerModal(
  props: ButtonPickerModalProps,
): ReactElement | null {
  const { open, onClose, onInsert, variants, initialValue, zIndex } = props

  // Outer guard mirrors VideoPickerModal: when closed, render nothing
  // and the inner component never mounts. Keeps the link sub-form's
  // page-list fetch off the page until the modal is actually opened.
  if (!open) return null
  return (
    <ButtonPickerModalBody
      onClose={onClose}
      onInsert={onInsert}
      variants={variants}
      initialValue={initialValue}
      {...(zIndex !== undefined ? { zIndex } : {})}
    />
  )
}

interface ButtonPickerModalBodyProps {
  readonly onClose: () => void
  readonly onInsert: (value: ButtonValue) => void
  readonly variants: ReadonlyArray<SelectOption>
  readonly initialValue: ButtonValue | undefined
  readonly zIndex?: number
}

function ButtonPickerModalBody(
  props: ButtonPickerModalBodyProps,
): ReactElement {
  const { onClose, onInsert, variants, initialValue, zIndex = Z_FIELD_EDITOR } = props

  // Seed the draft from `initialValue`, falling back to a sensible
  // blank: empty label, first variant (or '' for an empty list — same
  // degenerate-config rule as `defineSection`'s built-in default).
  const [draft, setDraft] = useState<ButtonValue>(() => {
    if (initialValue !== undefined) return initialValue
    const firstVariant = variants[0]?.value ?? ''
    return { label: '', variant: firstVariant }
  })

  const handleSave = useCallback(() => {
    onInsert(draft)
    onClose()
  }, [draft, onInsert, onClose])

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={<h2 style={titleStyle}>Edit button</h2>}
      ariaLabel="Edit button"
      maxWidth={480}
      maxHeight="auto"
      zIndex={zIndex}
      footer={
        <>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            data-agntcms-button-save=""
            style={primaryButtonStyle}
          >
            Save
          </button>
        </>
      }
    >
      <ButtonSubForm value={draft} onChange={setDraft} variants={variants} isOpen={true} />
    </Modal>
  )
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
}

const primaryButtonStyle: CSSProperties = {
  padding: '6px 12px',
  background: 'var(--agntcms-admin-accent)',
  color: 'var(--agntcms-admin-accent-fg)',
  border: '1px solid var(--agntcms-admin-accent)',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 600,
}

const secondaryButtonStyle: CSSProperties = {
  padding: '6px 12px',
  background: 'var(--agntcms-admin-surface-raised)',
  color: 'var(--agntcms-admin-fg)',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 4,
  cursor: 'pointer',
}
