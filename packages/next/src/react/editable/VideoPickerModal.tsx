'use client'

// VideoPickerModal — URL-only picker for video fields.
//
// Unlike ImagePickerModal there is no asset library and no upload step:
// videos are URL references to YouTube / Vimeo / Wistia / Loom, never
// stored as files on disk. The whole picker is therefore a single page:
//
//   - URL <input>           — what the editor pasted.
//   - Aspect-ratio <select> — auto / 16:9 / 4:3 / 1:1 / 9:16.
//   - Live preview         — debounced parse + iframe (or "Unsupported
//                              URL" hint when the URL doesn't resolve to
//                              a known provider).
//   - Save / Cancel.
//
// Save policy: the picker does NOT block save on validation. A user
// who saves an unsupported URL ends up with a working `<EditableVideo>`
// in the placeholder state — the same state they'd have with an empty
// URL. This trades strictness for forgiveness; the live preview tells
// them the URL doesn't parse, but the editor decides whether to save
// anyway (e.g. typing-in-progress, paste from a custom shortener).
//
// IMPORT CONSTRAINTS (invariants 1 + 2):
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only `react`, the shared Modal shell, and pure helpers from
//     `domain/`.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactElement,
} from 'react'
import type { VideoValue } from '../../domain/index'
import { parseVideoUrl } from '../../domain/video'
import { Modal } from '../shared/Modal'

// Aspect-ratio options surfaced in the picker. Mirrors the closed
// `VideoValue['aspectRatio']` union plus an "Auto" entry that maps to
// the absent key. The empty `value` is the canonical "no aspectRatio
// stored" — readers (e.g. `<EditableVideo>`) treat it as 16:9.
const ASPECT_OPTIONS: ReadonlyArray<{
  readonly value: '' | NonNullable<VideoValue['aspectRatio']>
  readonly label: string
}> = [
  { value: '', label: 'Auto (16:9)' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1 (square)' },
  { value: '9:16', label: '9:16 (vertical)' },
]

export interface VideoPickerModalProps {
  readonly open: boolean
  readonly onClose: () => void
  /**
   * Fired when the user clicks Save. The caller is responsible for
   * persisting the value; the modal also calls `onClose` immediately
   * afterwards.
   */
  readonly onInsert: (value: VideoValue) => void
  /** Current value, used to seed the URL + ratio inputs on open. */
  readonly initialValue?: VideoValue
  /**
   * Stacking override. Defaults to 100000 — same plane as
   * ImagePickerModal / MarkdownEditorModal. Callers that mount this
   * picker on top of another modal should pass a higher value so the
   * shared document-level Escape handler dismisses only the topmost
   * modal instead of both at once.
   */
  readonly zIndex?: number
}

export function VideoPickerModal(
  props: VideoPickerModalProps,
): ReactElement | null {
  const { open, onClose, onInsert, initialValue, zIndex } = props

  // Outer guard matches Modal's: when closed, render nothing and the
  // inner component never mounts. This keeps the debounce timer (and
  // any in-flight parse) off the page when the picker is unused.
  if (!open) return null
  return (
    <VideoPickerModalBody
      onClose={onClose}
      onInsert={onInsert}
      initialValue={initialValue}
      {...(zIndex !== undefined ? { zIndex } : {})}
    />
  )
}

interface VideoPickerModalBodyProps {
  readonly onClose: () => void
  readonly onInsert: (value: VideoValue) => void
  readonly initialValue: VideoValue | undefined
  readonly zIndex?: number
}

function VideoPickerModalBody(
  props: VideoPickerModalBodyProps,
): ReactElement {
  const { onClose, onInsert, initialValue, zIndex = 100000 } = props

  const [url, setUrl] = useState<string>(initialValue?.url ?? '')
  // Empty string represents the "Auto" choice (= absent aspectRatio).
  const [ratio, setRatio] = useState<'' | NonNullable<VideoValue['aspectRatio']>>(
    initialValue?.aspectRatio ?? '',
  )
  // Caption is plain text (not markdown). Empty string maps to the
  // "no caption" signal — saved as an absent key on the VideoValue.
  const [caption, setCaption] = useState<string>(initialValue?.caption ?? '')

  // Debounced URL used for the live preview. Typing fast shouldn't
  // produce one parse per keystroke + iframe reload; 300ms matches the
  // brief and is comfortably below the human "is this typed yet?"
  // threshold.
  const [debouncedUrl, setDebouncedUrl] = useState<string>(url)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedUrl(url), 300)
    return () => clearTimeout(id)
  }, [url])

  const parsed = useMemo(() => parseVideoUrl(debouncedUrl), [debouncedUrl])

  const handleUrlChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value)
  }, [])

  const handleRatioChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value
    // The select's option list is closed; cast is safe here.
    setRatio(v as '' | NonNullable<VideoValue['aspectRatio']>)
  }, [])

  const handleCaptionChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setCaption(e.target.value)
  }, [])

  const handleSave = useCallback(() => {
    // Build a `VideoValue`. When the user picked "Auto" we OMIT the
    // `aspectRatio` key entirely (instead of writing `undefined`) so
    // the saved JSON stays minimal and `exactOptionalPropertyTypes`
    // stays satisfied. Same pattern as `defineSection`'s
    // `builtInDefault` for video. Caption follows the same rule —
    // empty string is the "no caption" signal and we omit the key.
    const value: VideoValue = {
      url,
      ...(ratio === '' ? {} : { aspectRatio: ratio }),
      ...(caption === '' ? {} : { caption }),
    }
    onInsert(value)
    onClose()
  }, [url, ratio, caption, onInsert, onClose])

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={<h2 style={titleStyle}>Choose a video</h2>}
      ariaLabel="Choose a video"
      maxWidth={720}
      maxHeight="85vh"
      zIndex={zIndex}
      contentPadding={24}
      footer={
        <>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} style={primaryButtonStyle}>
            Save
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={fieldLabelStyle}>
          URL
          <input
            type="text"
            value={url}
            onChange={handleUrlChange}
            placeholder="Paste a YouTube, Vimeo, Wistia, or Loom URL"
            style={textInputStyle}
            autoFocus
          />
        </label>

        <label style={fieldLabelStyle}>
          Aspect ratio
          <select value={ratio} onChange={handleRatioChange} style={textInputStyle}>
            {ASPECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldLabelStyle}>
          Caption
          <input
            type="text"
            value={caption}
            onChange={handleCaptionChange}
            placeholder="Optional short caption shown below the video"
            style={textInputStyle}
          />
        </label>

        <div style={previewSectionStyle}>
          <div style={sectionLabelStyle}>Preview</div>
          {parsed.embedUrl !== null ? (
            <>
              <div style={previewFrameWrapStyle}>
                <iframe
                  src={parsed.embedUrl}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  style={previewFrameStyle}
                />
              </div>
              {/* Caption mirrors what the published page will render —
                  small muted text under the embed. Plain text only
                  (matches `<EditableVideo>`'s caption style). */}
              {caption !== '' ? (
                <p style={previewCaptionStyle}>{caption}</p>
              ) : null}
            </>
          ) : debouncedUrl === '' ? (
            <div style={hintStyle}>
              Paste a video URL to preview it here.
            </div>
          ) : (
            <div style={hintStyle}>
              Unsupported URL. The video will save anyway, but the page will
              show a placeholder until you replace it with a recognised
              YouTube, Vimeo, Wistia, or Loom URL.
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Styles — kept lean. Mirrors the visual language of ImagePickerModal so
// the two pickers feel like siblings without duplicating the entire
// stylesheet (each picker re-states the few rules it needs).
// ---------------------------------------------------------------------------

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
}

const sectionLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 8,
}

const fieldLabelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-muted)',
}

const textInputStyle: CSSProperties = {
  padding: '8px 10px',
  fontFamily: 'inherit',
  fontSize: 14,
  color: 'var(--agntcms-admin-fg)',
  background: 'var(--agntcms-admin-surface)',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 4,
  outline: 'none',
}

const primaryButtonStyle: CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  fontFamily: 'inherit',
  border: '1px solid var(--agntcms-admin-accent)',
  borderRadius: 4,
  background: 'var(--agntcms-admin-accent)',
  color: 'var(--agntcms-admin-accent-fg)',
  cursor: 'pointer',
}

const secondaryButtonStyle: CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  fontFamily: 'inherit',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 4,
  background: 'var(--agntcms-admin-surface-raised)',
  color: 'var(--agntcms-admin-fg)',
  cursor: 'pointer',
}

const previewSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

const previewFrameWrapStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '16 / 9',
  overflow: 'hidden',
  borderRadius: 8,
  border: '1px solid var(--agntcms-admin-border)',
  background: 'var(--agntcms-admin-surface)',
}

const previewFrameStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  border: 0,
}

// Muted plain-text caption under the preview iframe. Mirrors the
// caption style used by `<EditableVideo>` in published mode so the
// modal preview matches what the page will actually render.
const previewCaptionStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
}

const hintStyle: CSSProperties = {
  padding: 16,
  textAlign: 'center',
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  border: '1px dashed var(--agntcms-admin-border)',
  borderRadius: 8,
}
