'use client'

// EditableNumber — inline-editable numeric field for preview mode.
//
// Same dispatcher pattern as EditableText: the outer component renders a
// plain numeric value with zero hooks in published mode, and delegates to
// an inner stateful component in preview mode. The inner component shows
// a native `<input type="number">` that honours the descriptor's
// `min`/`max`/`step` HINTS — those hints are NOT enforced at runtime by
// the framework (see domain/fields.ts NumberField); the input clamps and
// steps so authoring stays sensible without the framework rejecting
// older content that happens to fall outside the current bounds.
//
// IMPORT CONSTRAINTS:
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react, local editable/ files.

import { useCallback, useRef, useState } from 'react'
import type { EditableSlot } from '../../sections/index'
import type { PreviewFieldLike } from './isPreviewField'
import { isPreviewField } from './isPreviewField'
import { useSaveField } from './SaveContext'

const EDITABLE_HOVER_STYLE = `
[data-agntcms-editable="number"]:hover {
  outline: 2px dashed var(--agntcms-admin-accent);
  outline-offset: 4px;
  box-shadow: var(--agntcms-admin-editable-halo);
}
`

// ---------------------------------------------------------------------------
// shouldCommit — pure helper used by the Enter/blur dedupe (I8).
//
// Returns the value to forward to `saveFn`, or `null` when the commit
// should be a no-op. This is the single source of truth for whether a
// candidate write should fire, used both by the Enter handler and the
// blur handler. Extracted so a unit test can pin the dedupe contract
// without driving a real DOM event sequence.
//
// @internal Exported for unit tests only. Not re-exported through any barrel.
// ---------------------------------------------------------------------------
export function shouldCommit(
  draft: string,
  min: number | undefined,
  max: number | undefined,
  fieldValue: number,
  lastCommitted: number | null,
): { value: number } | null {
  const parsed = Number(draft)
  if (!Number.isFinite(parsed)) return null
  let value = parsed
  if (min !== undefined && value < min) value = min
  if (max !== undefined && value > max) value = max
  if (lastCommitted === value) return null
  if (value === fieldValue) return null
  return { value }
}

export interface EditableNumberProps {
  /**
   * The slot for this number field. `slot.value` is either a bare
   * number (published) or `PreviewFieldLike<number>` (preview). The
   * slot kind `'number'` rejects mismatched widgets at compile time.
   */
  readonly field: EditableSlot<'number', number>
  /** HTML tag to render in display mode. Default: 'span'. */
  readonly as?: keyof React.JSX.IntrinsicElements
  /** Additional className applied to the outer element. */
  readonly className?: string
  /** Lower bound HINT for the input's clamping. Optional. */
  readonly min?: number
  /** Upper bound HINT for the input's clamping. Optional. */
  readonly max?: number
  /** Step HINT for the input. Default 1 (integer-friendly). */
  readonly step?: number
  /** Called when the user commits a new value in preview mode. */
  readonly onSave?: (origin: PreviewFieldLike<number>['origin'], newValue: number) => void
}

export function EditableNumber(props: EditableNumberProps): React.ReactElement {
  const { field: slot, as: Tag = 'span', className } = props
  const inner = slot.value

  // Published mode: plain text node, zero hooks.
  if (!isPreviewField<number>(inner)) {
    return <Tag className={className}>{String(inner)}</Tag>
  }

  const innerProps: EditableNumberPreviewProps = {
    field: inner,
    as: Tag,
    className,
    onSave: props.onSave,
    min: props.min,
    max: props.max,
    step: props.step,
  }

  return <EditableNumberPreview {...innerProps} />
}

interface EditableNumberPreviewProps {
  readonly field: PreviewFieldLike<number>
  readonly as: keyof React.JSX.IntrinsicElements
  readonly className: string | undefined
  readonly onSave: ((origin: PreviewFieldLike<number>['origin'], newValue: number) => void) | undefined
  readonly min: number | undefined
  readonly max: number | undefined
  readonly step: number | undefined
}

function EditableNumberPreview(props: EditableNumberPreviewProps): React.ReactElement {
  const { field, as: Tag, className, onSave, min, max, step } = props
  const contextSave = useSaveField()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(String(field.value))
  // Guards against double-commit on Enter+blur. `field.value` doesn't
  // update synchronously after `saveFn`, so the dedupe based on
  // `value !== field.value` would let blur fire saveFn again with the
  // same payload before the parent re-renders. We track the last
  // committed value here and short-circuit if commit() is called twice
  // in a row with the same input. Cleared when editing re-enters or
  // when `field.value` actually catches up.
  const lastCommittedRef = useRef<number | null>(null)

  const startEditing = useCallback(() => {
    setDraft(String(field.value))
    lastCommittedRef.current = null
    setEditing(true)
  }, [field.value])

  const commit = useCallback(() => {
    const decision = shouldCommit(
      draft,
      min,
      max,
      field.value,
      lastCommittedRef.current,
    )
    if (decision === null) {
      // No-op (NaN, clamp-no-change, or already-committed). Still exit
      // edit mode so the input collapses back to display.
      setEditing(false)
      return
    }
    const saveFn = onSave ?? contextSave
    if (saveFn) {
      lastCommittedRef.current = decision.value
      saveFn(field.origin, decision.value)
    }
    setEditing(false)
  }, [draft, min, max, onSave, contextSave, field.origin, field.value])

  const cancel = useCallback(() => {
    setEditing(false)
  }, [])

  if (!editing) {
    return (
      <>
        <style>{EDITABLE_HOVER_STYLE}</style>
        <Tag
          className={className}
          data-agntcms-editable="number"
          data-agntcms-field={field.origin.fieldPath}
          onClick={startEditing}
          style={{ cursor: 'pointer' }}
        >
          {String(field.value)}
        </Tag>
      </>
    )
  }

  return (
    <>
      <style>{EDITABLE_HOVER_STYLE}</style>
      <input
        type="number"
        value={draft}
        autoFocus
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        {...(step !== undefined ? { step } : { step: 1 })}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        style={{
          font: 'inherit',
          color: 'inherit',
          background: 'var(--agntcms-admin-surface-raised)',
          border: '1px solid var(--agntcms-admin-accent)',
          borderRadius: 4,
          padding: '2px 6px',
        }}
      />
    </>
  )
}
