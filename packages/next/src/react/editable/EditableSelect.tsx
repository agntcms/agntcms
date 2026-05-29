'use client'

// EditableSelect — dropdown widget for a SelectField.
//
// Renders the selected option's label in published mode (resolved from
// the descriptor's options list, falling back to the raw value when not
// found). In preview mode it shows a native `<select>` bound to the
// option set passed in via props — the section component owns the
// option list because the descriptor (held by the section registry)
// is not visible inside a "use client" component without leaking the
// section module across the boundary.
//
// IMPORT CONSTRAINTS:
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react, local editable/ files, and a type-only import of
//     SelectOption from `domain/`.

import { useCallback } from 'react'
import type { SelectOption } from '../../domain/index'
import type { EditableSlot } from '../../sections/index'
import type { PreviewFieldLike } from './isPreviewField'
import { isPreviewField } from './isPreviewField'
import { useSaveField } from './SaveContext'

export interface EditableSelectProps {
  /**
   * The slot for this select field. `slot.value` is either a bare
   * string (published) or `PreviewFieldLike<string>` (preview). The
   * slot kind `'select'` rejects mismatched widgets at compile time.
   */
  readonly field: EditableSlot<'select', string>
  /**
   * The option set. The section component passes this — typically the
   * same array used in its descriptor — so the dropdown stays in sync
   * with the schema.
   */
  readonly options: readonly SelectOption[]
  /** Additional className applied to the outer element. */
  readonly className?: string
  /** Called when the user picks a different option. */
  readonly onSave?: (origin: PreviewFieldLike<string>['origin'], newValue: string) => void
}

export function EditableSelect(props: EditableSelectProps): React.ReactElement {
  const { field: slot, options, className } = props
  const inner = slot.value

  // Published mode: render the resolved label. Fall back to the raw
  // value if the option isn't in the list (graceful degradation when
  // the schema's option set has changed since the content was written).
  if (!isPreviewField<string>(inner)) {
    const match = options.find((o) => o.value === inner)
    return <span className={className}>{match?.label ?? inner}</span>
  }

  const innerProps: EditableSelectPreviewProps = {
    field: inner,
    options,
    className,
    onSave: props.onSave,
  }

  return <EditableSelectPreview {...innerProps} />
}

interface EditableSelectPreviewProps {
  readonly field: PreviewFieldLike<string>
  readonly options: readonly SelectOption[]
  readonly className: string | undefined
  readonly onSave: ((origin: PreviewFieldLike<string>['origin'], newValue: string) => void) | undefined
}

function EditableSelectPreview(props: EditableSelectPreviewProps): React.ReactElement {
  const { field, options, className, onSave } = props
  const contextSave = useSaveField()

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = e.currentTarget.value
      const saveFn = onSave ?? contextSave
      if (saveFn && next !== field.value) {
        saveFn(field.origin, next)
      }
    },
    [field.origin, field.value, onSave, contextSave],
  )

  return (
    <select
      className={className}
      data-agntcms-editable="select"
      data-agntcms-field={field.origin.fieldPath}
      value={field.value}
      onChange={handleChange}
      style={{
        font: 'inherit',
        color: 'inherit',
        background: 'var(--agntcms-admin-surface-raised)',
        border: '1px solid var(--agntcms-admin-border)',
        borderRadius: 4,
        padding: '2px 6px',
        cursor: 'pointer',
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
