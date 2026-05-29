'use client'

// EditableImage — image field for preview + published modes.
//
// Architecture: same dispatcher pattern as EditableText. The outer
// `EditableImage` checks the mode and returns a plain `<img>` in
// published mode (no hooks). In preview mode, it delegates to
// `EditableImagePreview` which owns the picker-open state.
//
// 0.1.19 shape: the image field value is an `ImageValue` (`{ filename,
// alt }`). Alt is collected per-usage in the picker modal and lives in
// the section's `data` alongside the filename — there is no on-disk
// sidecar (the 0.1.16–17 experiment was reverted) and there is no
// framework-level alt default (the 0.1.18 `DEFAULT_IMAGE_ALT` was
// dropped when the picker began requiring alt).
//
// IMPORT CONSTRAINTS:
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react, local editable/ files, and a type-only import
//     of `ImageValue` from `domain/` (types are safe per invariant 1).

import { useCallback, useState, type CSSProperties, type ReactElement } from 'react'
import type { ImageValue } from '../../domain/index'
import type { EditableSlot } from '../../sections/index'
import type { PreviewFieldLike } from './isPreviewField'
import { isPreviewField } from './isPreviewField'
import { useSaveField } from './SaveContext'
import { ImagePickerModal } from './ImagePickerModal'

export interface EditableImageProps {
  /**
   * The slot for this image field. `slot.value` is either a bare
   * `ImageValue` (published) or `PreviewFieldLike<ImageValue>` (preview).
   * The slot kind `'image'` rejects mismatched widgets at compile time.
   */
  readonly field: EditableSlot<'image', ImageValue>
  /** Additional className applied to the outer element. */
  readonly className?: string
  /** Called when the user picks a new image in preview mode. */
  readonly onSave?: (
    origin: PreviewFieldLike<ImageValue>['origin'],
    newValue: ImageValue,
  ) => void
}

/**
 * Renders an image field value. In published mode, renders a plain
 * `<img>` with zero overhead. In preview mode, delegates to an inner
 * component that opens the image picker on click.
 */
export function EditableImage(props: EditableImageProps): React.ReactElement {
  const { field: slot, className, onSave } = props
  const inner = slot.value

  // Published mode: plain img, no hooks, no state, no event listeners.
  if (!isPreviewField<ImageValue>(inner)) {
    return (
      <img
        src={`/assets/${inner.filename}`}
        alt={inner.alt}
        className={className}
      />
    )
  }

  // Preview mode: delegate to the stateful inner component.
  return (
    <EditableImagePreview
      field={inner}
      className={className}
      onSave={onSave}
    />
  )
}

// ---------------------------------------------------------------------------
// Inner preview-mode component — owns picker-open state via hooks.
// ---------------------------------------------------------------------------

interface EditableImagePreviewProps {
  readonly field: PreviewFieldLike<ImageValue>
  // `| undefined` is explicit because the outer component forwards its
  // optional props directly and `exactOptionalPropertyTypes` forbids
  // assigning `T | undefined` to an optional `T?` property.
  readonly className: string | undefined
  readonly onSave:
    | ((
        origin: PreviewFieldLike<ImageValue>['origin'],
        newValue: ImageValue,
      ) => void)
    | undefined
}

function EditableImagePreview(
  props: EditableImagePreviewProps,
): React.ReactElement {
  const { field, className, onSave } = props
  const contextSave = useSaveField()

  const [pickerOpen, setPickerOpen] = useState(false)

  const handleClick = useCallback(() => {
    setPickerOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setPickerOpen(false)
  }, [])

  // Prefer the explicit onSave prop, fall back to SaveContext provider.
  // SaveContext's `newValue` is `unknown` so we pass the ImageValue object
  // through verbatim; the page-level handler stores it as-is.
  const handleInsert = useCallback(
    (value: ImageValue) => {
      if (onSave) {
        onSave(field.origin, value)
      } else if (contextSave) {
        contextSave(field.origin, value)
      }
      setPickerOpen(false)
    },
    [field.origin, onSave, contextSave],
  )

  // Hover outline uses an inline <style> tag (same pattern as EditableText)
  // because inline styles cannot express :hover pseudo-classes.
  return (
    <>
      <style>{`[data-agntcms-editable="image"]:hover {
  outline: 2px dashed var(--agntcms-admin-accent);
  outline-offset: 4px;
  box-shadow: var(--agntcms-admin-editable-halo);
}`}</style>
      <div
        data-agntcms-editable="image"
        data-agntcms-field={field.origin.fieldPath}
        onClick={handleClick}
        style={{
          display: 'inline-block',
          cursor: 'pointer',
          position: 'relative',
        }}
        className={className}
        // The placeholder no longer carries visible text (it must scale
        // down to 40×40 wrappers), so a hover-tooltip provides the
        // discoverability hint instead. Only set when empty so the
        // attribute does not appear on filled images.
        {...placeholderTooltipProps(field.value.filename)}
      >
        {field.value.filename === '' ? (
          renderImagePlaceholder()
        ) : (
          <img
            src={`/assets/${field.value.filename}`}
            alt={field.value.alt}
            style={{ display: 'block' }}
          />
        )}
      </div>
      <ImagePickerModal
        open={pickerOpen}
        onClose={handleClose}
        onInsert={handleInsert}
        initialValue={field.value}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Pure helper: derive the wrapper's hover-tooltip props from the current
// filename. The empty-state tooltip ("Click to add image") replaces the
// visible caption that used to live inside the placeholder; that caption
// was overflowing small wrappers (e.g. 40×40 icon cells in Features
// cards). Returns a `title` prop only when the field is empty so filled
// images render without an unsolicited tooltip. Pure + node-testable
// per `feedback_pure_helpers_for_node_tests`.
//
// @internal
// ---------------------------------------------------------------------------
export function placeholderTooltipProps(
  filename: string,
): { readonly title: string } | Record<string, never> {
  return filename === '' ? { title: 'Click to add image' } : {}
}

// ---------------------------------------------------------------------------
// Placeholder for the empty-filename preview state.
//
// Rendered only in preview mode when `filename === ''`. Mirrors the
// `EditableVideo` empty-state card so editors get a visible click target
// instead of a broken `<img src="/assets/">` rendering as empty space.
// Extracted to a pure helper so node-env tests can assert the element
// shape without invoking hooks (see `feedback_pure_helpers_for_node_tests`).
//
// Sizing rule: the placeholder fills its parent (`width/height: 100%`)
// and never asserts its own ratio. Whatever className the section author
// puts on the wrapper (e.g. `w-10 h-10` for a 40×40 icon cell, or
// `w-[600px] h-[400px]` for a hero) determines the box. The icon scales
// at 60% of the box and caps at 32×32 so it stays legible at small sizes
// and doesn't blow up at large sizes. No fixed paddings, no caption —
// a 40×40 cell can't fit text, and visible text was overflowing card
// layouts in template/.../Features.
//
// @internal
// ---------------------------------------------------------------------------
export function renderImagePlaceholder(): ReactElement {
  return (
    <div data-agntcms-image-placeholder="" style={placeholderStyle}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={placeholderIconStyle}
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  )
}

const placeholderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  padding: 0,
  border: '1px dashed var(--agntcms-admin-accent)',
  borderRadius: 4,
  background: 'var(--agntcms-admin-surface)',
  color: 'var(--agntcms-admin-fg-dim)',
  overflow: 'hidden',
  boxSizing: 'border-box',
}

const placeholderIconStyle: CSSProperties = {
  width: '60%',
  height: '60%',
  maxWidth: 32,
  maxHeight: 32,
}
