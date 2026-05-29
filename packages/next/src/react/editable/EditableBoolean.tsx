'use client'

// EditableBoolean — toggle widget for a boolean field.
//
// Same dispatcher pattern as the rest of the editable family. In
// published mode it renders the children of the section as the section
// itself sees fit; here we render a small label/value pair so a section
// that simply prints `<EditableBoolean field={visible} />` still has a
// visible representation. In preview mode it shows a checkbox the
// author toggles directly — no modal, no transient draft state.
//
// IMPORT CONSTRAINTS:
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react, local editable/ files.

import { useCallback } from 'react'
import type { EditableSlot } from '../../sections/index'
import type { PreviewFieldLike } from './isPreviewField'
import { isPreviewField } from './isPreviewField'
import { useSaveField } from './SaveContext'

export interface EditableBooleanProps {
  /**
   * The slot for this boolean field. `slot.value` is either a bare
   * boolean (published) or `PreviewFieldLike<boolean>` (preview). The
   * slot kind `'boolean'` rejects mismatched widgets at compile time.
   */
  readonly field: EditableSlot<'boolean', boolean>
  /** Additional className applied to the wrapper. */
  readonly className?: string
  /** Optional label rendered alongside the toggle in preview mode. */
  readonly label?: string
  /** Called when the user toggles the value in preview mode. */
  readonly onSave?: (origin: PreviewFieldLike<boolean>['origin'], newValue: boolean) => void
}

export function EditableBoolean(props: EditableBooleanProps): React.ReactElement | null {
  const { field: slot, className, label } = props
  const inner = slot.value

  // Published mode: render NOTHING. A boolean field is meant to be used
  // structurally by the section component (e.g. `{visible && <Banner />}`,
  // `<Card dismissible={dismissible} />`). Emitting the literal string
  // "true" / "false" inline would surface as garbage text in production
  // for any section that doesn't wrap the prop in an explicit conditional.
  // The previous fallback was actively harmful — silent rendering bugs
  // are worse than a no-op.
  if (!isPreviewField<boolean>(inner)) {
    return null
  }

  const innerProps: EditableBooleanPreviewProps = {
    field: inner,
    className,
    label,
    onSave: props.onSave,
  }

  return <EditableBooleanPreview {...innerProps} />
}

interface EditableBooleanPreviewProps {
  readonly field: PreviewFieldLike<boolean>
  readonly className: string | undefined
  readonly label: string | undefined
  readonly onSave: ((origin: PreviewFieldLike<boolean>['origin'], newValue: boolean) => void) | undefined
}

function EditableBooleanPreview(props: EditableBooleanPreviewProps): React.ReactElement {
  const { field, className, label, onSave } = props
  const contextSave = useSaveField()

  const handleToggle = useCallback(() => {
    const next = !field.value
    const saveFn = onSave ?? contextSave
    if (saveFn) saveFn(field.origin, next)
  }, [field.origin, field.value, onSave, contextSave])

  return (
    <label
      className={className}
      data-agntcms-editable="boolean"
      data-agntcms-field={field.origin.fieldPath}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={field.value}
        onChange={handleToggle}
        style={{ cursor: 'pointer' }}
      />
      {label !== undefined ? <span>{label}</span> : null}
    </label>
  )
}
