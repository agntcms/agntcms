'use client'

// EditableButton — modal-based editor for a `ButtonField` value.
//
// Same dispatcher pattern as the rest of the editable family.
//
// Published mode: renders a `<span>{value.label}</span>`. The section
// component is responsible for wrapping this in its own `<a>` /
// `<button>` and picking the className from `value.variant`. Keeping
// render policy out of the editor follows the same rule that applies
// to `EditableLink` — the framework owns the data, sections own the
// presentation.
//
// Preview mode: renders the same span with the standard hover outline;
// clicking opens `<ButtonPickerModal>` to edit label + variant + link.
// The save flow goes through `SaveContext` like every other Editable*.
//
// `variants` is passed as a prop because EditableButton has no direct
// link to the field descriptor — sections call this from inside their
// component body where only the runtime value is available, not the
// schema. The author writes:
//
//   <EditableButton
//     field={data.cta}
//     variants={[
//       { value: 'primary', label: 'Primary' },
//       { value: 'secondary', label: 'Secondary' },
//     ]}
//   />
//
// (matching the variants declared on the schema's `ButtonField`).
//
// IMPORT CONSTRAINTS:
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react, local editable/ files, and type-only imports
//     from `domain/`.

import { useCallback, useState } from 'react'
import type { ButtonValue, SelectOption } from '../../domain/index'
import type { EditableSlot } from '../../sections/index'
import { ButtonPickerModal } from './ButtonPickerModal'
import type { PreviewFieldLike } from './isPreviewField'
import { isPreviewField } from './isPreviewField'
import { useSaveField } from './SaveContext'

const EDITABLE_HOVER_STYLE = `
[data-agntcms-editable="button"]:hover {
  outline: 2px dashed var(--agntcms-admin-accent);
  outline-offset: 4px;
  box-shadow: var(--agntcms-admin-editable-halo);
}
`

export interface EditableButtonProps {
  /**
   * The slot for this button field. `slot.value` is either a bare
   * `ButtonValue` (published) or `PreviewFieldLike<ButtonValue>`
   * (preview). The slot kind `'button'` rejects mismatched widgets at
   * compile time.
   */
  readonly field: EditableSlot<'button', ButtonValue>
  /**
   * The closed list of variants the section supports — surfaced in
   * the picker's `<select>`. Should match the schema's `ButtonField`
   * variants list. Required because EditableButton has no link to
   * the descriptor at runtime.
   */
  readonly variants: ReadonlyArray<SelectOption>
  /** Additional className applied to the outer element. */
  readonly className?: string
  /** Called when the user saves an edit in preview mode. */
  readonly onSave?: (
    origin: PreviewFieldLike<ButtonValue>['origin'],
    newValue: ButtonValue,
  ) => void
}

export function EditableButton(props: EditableButtonProps): React.ReactElement {
  const { field: slot, className } = props
  const inner = slot.value

  // Published mode: a plain span carrying the label. The section is
  // expected to wrap this in its own `<a>` / `<button>` based on
  // `value.variant` and `value.link`.
  if (!isPreviewField<ButtonValue>(inner)) {
    return <span className={className}>{inner.label}</span>
  }

  const innerProps: EditableButtonPreviewProps = {
    field: inner,
    className,
    variants: props.variants,
    onSave: props.onSave,
  }
  return <EditableButtonPreview {...innerProps} />
}

interface EditableButtonPreviewProps {
  readonly field: PreviewFieldLike<ButtonValue>
  readonly variants: ReadonlyArray<SelectOption>
  readonly className: string | undefined
  readonly onSave:
    | ((origin: PreviewFieldLike<ButtonValue>['origin'], newValue: ButtonValue) => void)
    | undefined
}

function EditableButtonPreview(
  props: EditableButtonPreviewProps,
): React.ReactElement {
  const { field, variants, className, onSave } = props
  const contextSave = useSaveField()

  const [open, setOpen] = useState(false)

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])

  const handleInsert = useCallback(
    (next: ButtonValue) => {
      const saveFn = onSave ?? contextSave
      if (saveFn) {
        saveFn(field.origin, next)
      }
    },
    [field.origin, onSave, contextSave],
  )

  return (
    <>
      <style>{EDITABLE_HOVER_STYLE}</style>
      <span
        className={className}
        data-agntcms-editable="button"
        data-agntcms-field={field.origin.fieldPath}
        onClick={handleOpen}
        style={{ cursor: 'pointer' }}
      >
        {field.value.label}
      </span>
      <ButtonPickerModal
        open={open}
        onClose={handleClose}
        onInsert={handleInsert}
        variants={variants}
        initialValue={field.value}
      />
    </>
  )
}
