'use client'

// EditableVideo — video field for preview + published modes.
//
// Architecture: same dispatcher pattern as EditableImage. The outer
// `EditableVideo` checks the mode and returns a plain iframe (or
// nothing, when the URL is empty) in published mode — no hooks. In
// preview mode, it delegates to `EditableVideoPreview` which owns
// the picker-open state and click affordance.
//
// VideoValue shape:
//   `{ url: string; aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16'; caption?: string }`.
// Absent `aspectRatio` is the canonical "auto" — both the editor and the
// rendered iframe fall back to 16:9 in that case (per ARCHITECTURE.md
// §4 and the `domain/fields.ts` doc on `VideoField`).
//
// `caption` is optional plain text (NOT markdown — see `VideoField`
// JSDoc). When non-empty it is rendered under the iframe in both
// preview and published modes; absence/empty string suppresses the
// caption element entirely so the page never carries a stray empty
// `<p>`. Caption editing happens inside the picker modal only — there
// is no inline caption affordance on `<EditableVideo>` itself.
//
// IMPORT CONSTRAINTS (invariants 1 + 2):
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react, local editable/ files, the shared modal, and
//     type-only / pure-function imports from `domain/`.

import { useCallback, useState, type CSSProperties, type ReactElement } from 'react'
import type { VideoValue } from '../../domain/index'
import { parseVideoUrl } from '../../domain/video'
import type { EditableSlot } from '../../sections/index'
import type { PreviewFieldLike } from './isPreviewField'
import { isPreviewField } from './isPreviewField'
import { useSaveField } from './SaveContext'
import { VideoPickerModal } from './VideoPickerModal'

export interface EditableVideoProps {
  /**
   * The slot for this video field. `slot.value` is either a bare
   * `VideoValue` (published) or `PreviewFieldLike<VideoValue>`
   * (preview). The slot kind `'video'` rejects mismatched widgets at
   * compile time.
   */
  readonly field: EditableSlot<'video', VideoValue>
  /** Additional className applied to the outer element. */
  readonly className?: string
  /**
   * Force a specific aspect ratio regardless of `field.value.aspectRatio`.
   * Useful when a section design fixes the ratio and the per-instance
   * choice is not meaningful — the picker still surfaces the ratio
   * selector, but the rendered iframe ignores it.
   */
  readonly aspectRatioOverride?: VideoValue['aspectRatio']
  /** Called when the user picks a new value in preview mode. */
  readonly onSave?: (
    origin: PreviewFieldLike<VideoValue>['origin'],
    newValue: VideoValue,
  ) => void
}

/**
 * Renders a video field value. In published mode, renders the provider
 * iframe with no hooks (or `null` when there is no URL). In preview
 * mode, delegates to an inner component that opens the URL picker on
 * click and shows a placeholder when the URL is empty/unrecognised.
 */
export function EditableVideo(props: EditableVideoProps): ReactElement | null {
  const { field: slot, className, aspectRatioOverride, onSave } = props
  const inner = slot.value

  // Published mode: zero hooks. Render the iframe if the URL parses,
  // otherwise nothing (no editor affordance, no placeholder — keeping
  // a published page visually clean when an author hasn't filled the
  // URL in yet). Caption (when non-empty) is rendered under the
  // iframe; absence/empty string suppresses the `<p>` entirely so the
  // page does not carry an empty paragraph.
  if (!isPreviewField<VideoValue>(inner)) {
    const { embedUrl } = parseVideoUrl(inner.url)
    if (embedUrl === null) return null
    const ratio = aspectRatioOverride ?? inner.aspectRatio
    const captionText = inner.caption ?? ''
    return (
      <div className={className}>
        <div style={aspectRatioWrapStyle(ratio)}>
          <iframe
            src={embedUrl}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={iframeStyle}
          />
        </div>
        {captionText !== '' ? <p style={captionStyle}>{captionText}</p> : null}
      </div>
    )
  }

  // Preview mode: delegate to the stateful inner component.
  return (
    <EditableVideoPreview
      field={inner}
      className={className}
      aspectRatioOverride={aspectRatioOverride}
      onSave={onSave}
    />
  )
}

// ---------------------------------------------------------------------------
// Inner preview-mode component — owns picker-open state via hooks.
// ---------------------------------------------------------------------------

interface EditableVideoPreviewProps {
  readonly field: PreviewFieldLike<VideoValue>
  // `| undefined` is explicit because the outer component forwards its
  // optional props directly and `exactOptionalPropertyTypes` forbids
  // assigning `T | undefined` to an optional `T?` property.
  readonly className: string | undefined
  readonly aspectRatioOverride: VideoValue['aspectRatio'] | undefined
  readonly onSave:
    | ((
        origin: PreviewFieldLike<VideoValue>['origin'],
        newValue: VideoValue,
      ) => void)
    | undefined
}

function EditableVideoPreview(
  props: EditableVideoPreviewProps,
): ReactElement {
  const { field, className, aspectRatioOverride, onSave } = props
  const contextSave = useSaveField()

  const [pickerOpen, setPickerOpen] = useState(false)

  const handleClick = useCallback(() => {
    setPickerOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setPickerOpen(false)
  }, [])

  // Prefer the explicit onSave prop, fall back to SaveContext provider.
  // SaveContext's `newValue` is `unknown` so we pass the VideoValue object
  // through verbatim; the page-level handler stores it as-is.
  const handleInsert = useCallback(
    (value: VideoValue) => {
      if (onSave) {
        onSave(field.origin, value)
      } else if (contextSave) {
        contextSave(field.origin, value)
      }
      setPickerOpen(false)
    },
    [field.origin, onSave, contextSave],
  )

  const { embedUrl } = parseVideoUrl(field.value.url)
  const ratio = aspectRatioOverride ?? field.value.aspectRatio
  const captionText = field.value.caption ?? ''

  // Hover outline uses an inline <style> tag (same pattern as
  // EditableText / EditableImage) because inline styles cannot express
  // :hover pseudo-classes.
  return (
    <>
      <style>{HOVER_STYLE}</style>
      <div
        data-agntcms-editable="video"
        data-agntcms-field={field.origin.fieldPath}
        onClick={handleClick}
        style={previewWrapStyle}
        className={className}
      >
        {embedUrl !== null ? (
          <div style={aspectRatioWrapStyle(ratio)}>
            <iframe
              src={embedUrl}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              // pointer-events: none lets clicks fall through to the
              // wrapper so the picker opens. Without this, the iframe
              // captures the click and the editor cannot reach the
              // affordance — the same trade-off ImagePickerModal makes
              // for `<img>` (which is non-interactive by default).
              style={{ ...iframeStyle, pointerEvents: 'none' }}
            />
          </div>
        ) : (
          <div style={placeholderStyle}>
            <div style={placeholderIconStyle}>{'▶'}</div>
            <div style={placeholderTextStyle}>No video — click to add</div>
          </div>
        )}
        {/* Caption only appears when an iframe is rendered. The
            placeholder state already conveys "no content yet" — adding
            a caption beneath it would be confusing. */}
        {embedUrl !== null && captionText !== '' ? (
          <p style={captionStyle}>{captionText}</p>
        ) : null}
      </div>
      <VideoPickerModal
        open={pickerOpen}
        onClose={handleClose}
        onInsert={handleInsert}
        initialValue={field.value}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Helpers + styles
// ---------------------------------------------------------------------------

// Mirror EditableText/EditableImage hover affordance: dashed teal
// outline with a 4px offset. Exported as a constant so both the styled
// section and the rule lookup match — matters if a future refactor
// extracts a shared <HoverAffordance> wrapper.
const HOVER_STYLE = `[data-agntcms-editable="video"]:hover {
  outline: 2px dashed var(--agntcms-admin-accent);
  outline-offset: 4px;
  box-shadow: var(--agntcms-admin-editable-halo);
}`

function aspectRatioWrapStyle(
  ratio: VideoValue['aspectRatio'] | undefined,
): CSSProperties {
  // Absent ratio = "auto" = 16:9. The CSS aspect-ratio property accepts
  // the slash form natively in modern browsers; provide a width:100% so
  // the iframe stretches to the parent's width, then aspect-ratio fixes
  // the height.
  return {
    position: 'relative',
    width: '100%',
    aspectRatio: aspectRatioCss(ratio),
    overflow: 'hidden',
  }
}

function aspectRatioCss(ratio: VideoValue['aspectRatio'] | undefined): string {
  switch (ratio) {
    case '4:3':
      return '4 / 3'
    case '1:1':
      return '1 / 1'
    case '9:16':
      return '9 / 16'
    case '16:9':
    case undefined:
      return '16 / 9'
    default: {
      // Closed string-literal union — exhaustiveness guard. A future
      // ratio added to `VideoValue['aspectRatio']` becomes a compile
      // error here.
      const _exhaustive: never = ratio
      void _exhaustive
      return '16 / 9'
    }
  }
}

const iframeStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  border: 0,
}

const previewWrapStyle: CSSProperties = {
  display: 'block',
  cursor: 'pointer',
  position: 'relative',
}

const placeholderStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  // Match a 16:9 ratio for the placeholder so it doesn't collapse when
  // the parent has no intrinsic height.
  aspectRatio: '16 / 9',
  gap: 8,
  padding: 24,
  border: '2px dashed var(--agntcms-admin-border)',
  borderRadius: 8,
  background: 'var(--agntcms-admin-surface)',
  color: 'var(--agntcms-admin-fg-dim)',
  fontFamily: 'var(--font-body, sans-serif)',
}

const placeholderIconStyle: CSSProperties = {
  fontSize: 32,
  lineHeight: 1,
}

const placeholderTextStyle: CSSProperties = {
  fontSize: 13,
}

// Plain-text caption rendered under the iframe. Muted, small, no
// markdown — captions are short ("A 2-minute walkthrough") and don't
// need rich-text features (see `VideoField` JSDoc for rationale).
const captionStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
}
