'use client'

// ImagePickerModal — the picker UI wired to `/api/agntcms/assets`.
//
// Two-step flow (0.1.19):
//
//   browse  — upload row + grid of existing assets. Uploading a file
//             requires the user to fill in alt text; successful upload
//             (or clicking any existing grid card) transitions to
//             `confirm` seeded with the chosen filename + an initial
//             alt guess.
//   confirm — preview of the selected image + a required alt <input>.
//             Clicking Insert fires `onInsert({ filename, alt })` and
//             closes the modal. Clicking Back returns to `browse`.
//
// Alt is NOT stored as asset metadata on disk — the upload endpoint
// accepts only `file`. Alt lives per-usage in the section's `data`
// (ImageValue shape). That's why `initialValue.alt` is passed in: when
// editing a section, the current alt is pre-filled. When picking a
// previously-uploaded asset for the first time in a new section, we
// have no metadata to seed from and force the author to type one.
//
// IMPORT CONSTRAINTS (invariants 1 + 2):
//   - "use client" component. No server imports. Only `react` + the
//     shared Modal shell + type-only ImageValue from domain.
//   - The shape of `PickerAsset` mirrors `AssetListEntry` from
//     storage/assets.ts, replicated locally to avoid pulling server code.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactElement,
  type CSSProperties,
} from 'react'
import type { ImageValue } from '../../domain/index'
import { Modal } from '../shared/Modal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of each asset card in the grid. Mirrors `AssetListEntry` from
 * the server barrel without importing it, to keep this file free of
 * server-side transitive dependencies.
 */
interface PickerAsset {
  readonly filename: string
  readonly url: string
  readonly contentType: string | null
  readonly modifiedAt: string
}

export interface ImagePickerModalProps {
  readonly open: boolean
  readonly onClose: () => void
  /** Fired when the user confirms a selection in the modal's confirm step.
   *  The caller is responsible for closing any parent state after receiving
   *  this — the modal itself also calls `onClose` immediately afterwards. */
  readonly onInsert: (value: ImageValue) => void
  /** Current value, used to seed the confirm-step alt input when the user
   *  picks the same filename they already have. Also used when no other
   *  source of alt is available. */
  readonly initialValue?: ImageValue
  /** Stacking override. Defaults to 100000 — same plane as
   *  MarkdownEditorModal. Callers that mount this picker on top of another
   *  modal should pass a higher value so the shared document-level Escape
   *  handler dismisses only the topmost modal instead of both at once. */
  readonly zIndex?: number
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ImagePickerModal(
  props: ImagePickerModalProps,
): ReactElement | null {
  const { open, onClose, onInsert, initialValue, zIndex } = props

  // Outer guard matches Modal's: when closed, render nothing and the
  // inner component never mounts. This keeps the data-load `useEffect`
  // (and its in-flight fetches) off the page when the picker is unused.
  if (!open) return null
  // Conditional spread instead of `zIndex={zIndex}` because the project
  // has `exactOptionalPropertyTypes` enabled — passing `undefined`
  // explicitly is not the same as omitting the prop.
  return (
    <ImagePickerModalBody
      onClose={onClose}
      onInsert={onInsert}
      initialValue={initialValue}
      {...(zIndex !== undefined ? { zIndex } : {})}
    />
  )
}

// ---------------------------------------------------------------------------
// Body — owns hooks. Only mounts when `open === true`.
// ---------------------------------------------------------------------------

interface ImagePickerModalBodyProps {
  readonly onClose: () => void
  readonly onInsert: (value: ImageValue) => void
  readonly initialValue: ImageValue | undefined
  readonly zIndex?: number
}

type PickerMode =
  | { readonly kind: 'browse' }
  | {
      readonly kind: 'confirm'
      readonly selected: { readonly filename: string; readonly url: string }
      readonly seededAlt: string
    }

function ImagePickerModalBody(
  props: ImagePickerModalBodyProps,
): ReactElement {
  const { onClose, onInsert, initialValue, zIndex = 100000 } = props

  const [assets, setAssets] = useState<readonly PickerAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<PickerMode>({ kind: 'browse' })

  // Drag-drop upload state. `dragDepth` tracks nested dragenter/dragleave
  // events — a naive boolean flips off when the cursor passes over any
  // child element because each child fires its own dragenter/leave pair.
  // Counting enters minus leaves gives a stable "is a drag currently over
  // the zone" signal.
  const [dragDepth, setDragDepth] = useState(0)
  const [dropUploading, setDropUploading] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)

  // Load the asset list once on open. The upload form's post-success
  // path injects the new asset into `assets` directly; re-listing is
  // avoided since the server's sort is stable modulo the new upload.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/agntcms/assets')
      .then(async (res) => {
        if (!res.ok) {
          const msg = await res.text().catch(() => 'failed')
          throw new Error(msg || `HTTP ${res.status}`)
        }
        return (await res.json()) as { assets: PickerAsset[] }
      })
      .then((body) => {
        if (cancelled) return
        setAssets(body.assets)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'failed to load assets')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleUploaded = useCallback(
    (asset: PickerAsset, uploadedAlt: string) => {
      // Prepend so the newest upload shows up top-left (matches the
      // server's newest-first sort) and de-duplicate on filename in
      // case the same hash was already in the list — re-uploading an
      // existing asset is idempotent.
      setAssets((prev) => {
        const filtered = prev.filter((a) => a.filename !== asset.filename)
        return [asset, ...filtered]
      })
      // Alt collected in the upload form moves straight into the confirm
      // step as the seeded value. The author can still edit it before
      // clicking Insert.
      setMode({
        kind: 'confirm',
        selected: { filename: asset.filename, url: asset.url },
        seededAlt: uploadedAlt,
      })
    },
    [],
  )

  const handlePickExisting = useCallback(
    (asset: PickerAsset) => {
      // Seed alt from the current section's value IFF the picked filename
      // matches — otherwise the author is switching to a different asset
      // and must type a fresh alt. There is no per-asset alt metadata on
      // disk to seed from.
      const seededAlt =
        initialValue && initialValue.filename === asset.filename
          ? initialValue.alt
          : ''
      setMode({
        kind: 'confirm',
        selected: { filename: asset.filename, url: asset.url },
        seededAlt,
      })
    },
    [initialValue],
  )

  const handleBackToBrowse = useCallback(() => {
    setMode({ kind: 'browse' })
  }, [])

  // Upload a single file via the same endpoint the form uses. Shared by the
  // drop handler; the form has its own inline fetch because it also manages
  // the alt-text seed that only applies to single-file form submits.
  const uploadOneFile = useCallback(async (file: File): Promise<PickerAsset> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/agntcms/assets/upload', {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const msg = await res.text().catch(() => 'upload failed')
      throw new Error(msg || `HTTP ${res.status}`)
    }
    const body = (await res.json()) as { asset: PickerAsset }
    return body.asset
  }, [])

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    // Preventing default on dragenter + dragover is what actually lets the
    // drop fire; without it the browser treats the payload as a file to
    // navigate to and the whole modal unmounts as the page changes.
    e.preventDefault()
    e.stopPropagation()
    setDragDepth((d) => d + 1)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragDepth((d) => Math.max(0, d - 1))
  }, [])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    // Signal to the browser that this is a valid drop target for a copy.
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      e.preventDefault()
      e.stopPropagation()
      setDragDepth(0)
      if (dropUploading) return

      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      // Filter to images only — dropping a PDF or text file should be a
      // silent no-op rather than a cryptic server error. The filter matches
      // the file input's `accept="image/*"` behaviour.
      const images = Array.from(files).filter((f) => f.type.startsWith('image/'))
      if (images.length === 0) {
        setDropError('Only image files can be uploaded here.')
        return
      }

      setDropError(null)
      setDropUploading(true)

      // Upload sequentially so the server sees one request at a time (the
      // v1 FS adapter is single-writer and this keeps error reporting
      // straightforward). Collect all successes, surface the first
      // failure (if any) after the batch completes.
      void (async () => {
        const uploaded: PickerAsset[] = []
        let firstError: string | null = null
        for (const file of images) {
          try {
            const asset = await uploadOneFile(file)
            uploaded.push(asset)
          } catch (err) {
            if (firstError === null) {
              firstError = err instanceof Error ? err.message : 'upload failed'
            }
          }
        }

        setDropUploading(false)

        if (uploaded.length > 0) {
          // Prepend new assets (same ordering as the form's post-success
          // path), de-duping on filename so re-uploading an existing asset
          // stays idempotent.
          setAssets((prev) => {
            const newNames = new Set(uploaded.map((a) => a.filename))
            const filtered = prev.filter((a) => !newNames.has(a.filename))
            return [...uploaded, ...filtered]
          })
          // Multi-file drop: stay in browse so the user can pick one. The
          // confirm step requires alt text and we deliberately do NOT
          // invent placeholder alts. Single-file drop also stays in browse
          // — consistent behaviour across drop counts, and the user then
          // clicks the new card to proceed to the confirm step with a
          // fresh alt input.
        }

        if (firstError !== null) {
          setDropError(firstError)
        }
      })()
    },
    [dropUploading, uploadOneFile],
  )

  const handleInsert = useCallback(
    (value: ImageValue) => {
      onInsert(value)
      onClose()
    },
    [onInsert, onClose],
  )

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={<h2 style={titleStyle}>Choose an image</h2>}
      ariaLabel="Choose an image"
      maxWidth={960}
      maxHeight="85vh"
      zIndex={zIndex}
      contentPadding={24}
    >
      {mode.kind === 'browse' ? (
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            ...dropZoneStyle,
            ...(dragDepth > 0 ? dropZoneActiveStyle : null),
          }}
          data-agntcms-image-picker-dropzone=""
        >
          <UploadForm onUploaded={handleUploaded} />

          {dropUploading ? (
            <div style={hintStyle}>Uploading...</div>
          ) : null}
          {dropError !== null ? (
            <div style={errorStyle}>{dropError}</div>
          ) : null}

          {/* Grid wrapper mirrors SectionPickerModal's single-group layout:
              no header above the grid (section picker suppresses the label
              when there is one uncategorized group), same marginBottom: 24
              rhythm. Loading/error/empty states occupy the same slot. */}
          <div style={{ marginBottom: 24 }}>
            {loading ? (
              <div style={hintStyle}>Loading...</div>
            ) : error !== null ? (
              <div style={errorStyle}>Failed to load assets: {error}</div>
            ) : assets.length === 0 ? (
              <div style={hintStyle}>
                No assets yet. Upload an image above or drop files here to get started.
              </div>
            ) : (
              <div style={gridStyle}>
                {assets.map((asset) => (
                  <AssetCard
                    key={asset.filename}
                    asset={asset}
                    onPick={handlePickExisting}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <ConfirmStep
          filename={mode.selected.filename}
          url={mode.selected.url}
          initialAlt={mode.seededAlt}
          onBack={handleBackToBrowse}
          onInsert={handleInsert}
        />
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Upload form — collects file + alt; alt is not sent over the wire (the
// handler doesn't accept it), only forwarded to the confirm step.
// ---------------------------------------------------------------------------

interface UploadFormProps {
  readonly onUploaded: (asset: PickerAsset, alt: string) => void
}

function UploadForm(props: UploadFormProps): ReactElement {
  const { onUploaded } = props
  const [file, setFile] = useState<File | null>(null)
  const [alt, setAlt] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const trimmedAlt = alt.trim()
  const submitDisabled = uploading || file === null || trimmedAlt === ''

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0] ?? null
    setFile(next)
    setError(null)
  }, [])

  const handleAltChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setAlt(e.target.value)
    setError(null)
  }, [])

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (submitDisabled || file === null) return

      const form = new FormData()
      form.append('file', file)

      setUploading(true)
      setError(null)

      fetch('/api/agntcms/assets/upload', {
        method: 'POST',
        body: form,
      })
        .then(async (res) => {
          if (!res.ok) {
            const msg = await res.text().catch(() => 'upload failed')
            throw new Error(msg || `HTTP ${res.status}`)
          }
          return (await res.json()) as { asset: PickerAsset }
        })
        .then((body) => {
          setUploading(false)
          setFile(null)
          const altForConfirm = trimmedAlt
          setAlt('')
          if (fileInputRef.current) fileInputRef.current.value = ''
          onUploaded(body.asset, altForConfirm)
        })
        .catch((err: unknown) => {
          setUploading(false)
          setError(err instanceof Error ? err.message : 'upload failed')
        })
    },
    [submitDisabled, file, trimmedAlt, onUploaded],
  )

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        border: '1px dashed var(--agntcms-admin-border)',
        borderRadius: 8,
      }}
    >
      <div style={sectionLabelStyle}>Upload a new image</div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <label style={fieldLabelStyle}>
            Alt text (required)
            <input
              type="text"
              value={alt}
              onChange={handleAltChange}
              disabled={uploading}
              placeholder="Describe the image..."
              style={textInputStyle}
            />
          </label>
        </div>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <label style={fieldLabelStyle}>
            File
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={uploading}
              style={fileInputStyle}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={submitDisabled}
          style={submitDisabled ? primaryButtonDisabledStyle : primaryButtonStyle}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>
      {error !== null ? <div style={errorStyle}>{error}</div> : null}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Confirm step — preview the selected image, collect required alt, insert.
// ---------------------------------------------------------------------------

interface ConfirmStepProps {
  readonly filename: string
  readonly url: string
  readonly initialAlt: string
  readonly onBack: () => void
  readonly onInsert: (value: ImageValue) => void
}

function ConfirmStep(props: ConfirmStepProps): ReactElement {
  const { filename, url, initialAlt, onBack, onInsert } = props
  const [alt, setAlt] = useState(initialAlt)

  const trimmedAlt = useMemo(() => alt.trim(), [alt])
  const insertDisabled = trimmedAlt === ''

  const handleAltChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setAlt(e.target.value)
  }, [])

  const handleInsertClick = useCallback(() => {
    if (insertDisabled) return
    onInsert({ filename, alt: trimmedAlt })
  }, [insertDisabled, onInsert, filename, trimmedAlt])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={confirmPreviewWrapStyle}>
        <img
          src={url}
          alt={trimmedAlt || filename}
          style={confirmPreviewImgStyle}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={sectionLabelStyle}>Selected</div>
        <div style={confirmFilenameStyle}>{filename}</div>
      </div>
      <label style={fieldLabelStyle}>
        Alt text (required)
        <input
          type="text"
          value={alt}
          onChange={handleAltChange}
          placeholder="Describe the image..."
          style={textInputStyle}
          autoFocus
        />
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onBack} style={secondaryButtonStyle}>
          Back
        </button>
        <button
          type="button"
          onClick={handleInsertClick}
          disabled={insertDisabled}
          style={insertDisabled ? primaryButtonDisabledStyle : primaryButtonStyle}
        >
          Insert
        </button>
      </div>
    </div>
  )
}

interface AssetCardProps {
  readonly asset: PickerAsset
  readonly onPick: (asset: PickerAsset) => void
}

function AssetCard(props: AssetCardProps): ReactElement {
  const { asset, onPick } = props

  const handleClick = useCallback(() => {
    onPick(asset)
  }, [asset, onPick])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onPick(asset)
      }
    },
    [asset, onPick],
  )

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.currentTarget.style.borderColor = 'var(--agntcms-admin-border)'
      e.currentTarget.style.background = 'var(--agntcms-admin-surface-raised)'
    },
    [],
  )

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.currentTarget.style.borderColor = 'transparent'
      e.currentTarget.style.background = 'none'
    },
    [],
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={cardStyle}
    >
      {/* Cards mirror SectionPickerModal's preview cards: same dimensions,
          same hover behavior, same centered caption. Images use
          `object-fit: contain` so the full image is visible inside the
          constant-ratio frame — analogous to how section previews show the
          full section content via `transform: scale`. A `<div role="button">`
          (not `<button>`) is used so the card fills its grid cell naturally,
          matching SectionPickerModal's SectionPreviewCard. */}
      <div style={previewContainerStyle}>
        <img
          src={asset.url}
          alt={asset.filename}
          style={cardImageStyle}
        />
      </div>
      <div style={cardCaptionStyle}>{asset.filename}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout constants — mirror SectionPickerModal's card dimensions so the
// existing-assets grid feels the same as the section picker grid.
// ---------------------------------------------------------------------------

const CARD_WIDTH = 288
const CARD_HEIGHT = 176

// ---------------------------------------------------------------------------
// Styles
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
}

const fieldLabelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-muted)',
}

const fileInputStyle: CSSProperties = {
  padding: '6px 0',
  fontFamily: 'inherit',
  fontSize: 14,
  color: 'var(--agntcms-admin-fg)',
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

const primaryButtonDisabledStyle: CSSProperties = {
  ...primaryButtonStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
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

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 16,
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  // Grid items default to `min-width: auto` which resolves to `min-content`.
  // The caption has `white-space: nowrap`, so without this the card's
  // min-content width becomes the longest filename and the 1fr column
  // stretches to match, producing inconsistent card widths across columns.
  minWidth: 0,
  padding: 8,
  borderRadius: 8,
  cursor: 'pointer',
  border: '1px solid transparent',
  background: 'none',
  transition: 'border-color 0.15s, background 0.15s',
}

const previewContainerStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  // Defense-in-depth against the same flex-item min-content trap as cardStyle:
  // this preview is a flex item inside the flex-column card. Harmless if
  // redundant, cheap insurance.
  minWidth: 0,
  aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}`,
  overflow: 'hidden',
  borderRadius: 8,
  border: '1px solid var(--agntcms-admin-border)',
  background: 'var(--agntcms-admin-surface)',
}

const cardImageStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  display: 'block',
}

const cardCaptionStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-muted)',
  textAlign: 'center',
  // Single-line with ellipsis: filenames are arbitrary-length (hashes,
  // long slugs) unlike section names, so without truncation cards end
  // up with different heights and rows look uneven. This is the
  // intentional divergence from SectionPickerModal's labelStyle.
  width: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const hintStyle: CSSProperties = {
  padding: 24,
  textAlign: 'center',
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
}

const errorStyle: CSSProperties = {
  padding: 8,
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-danger)',
  background: 'var(--agntcms-admin-danger-tint)',
  border: '1px solid var(--agntcms-admin-danger-tint-strong)',
}

// Drop-zone wraps the whole browse-mode body. Transparent by default so it
// feels like the regular modal content; swaps to the active style while a
// drag is hovering the zone.
const dropZoneStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  borderRadius: 8,
  transition: 'background 0.12s, outline-color 0.12s',
  outline: '2px dashed transparent',
  outlineOffset: -4,
}

const dropZoneActiveStyle: CSSProperties = {
  background: 'var(--agntcms-admin-accent-tint)',
  outline: '2px dashed var(--agntcms-admin-accent)',
}

// ---------------------------------------------------------------------------
// Confirm-step styles
// ---------------------------------------------------------------------------

const confirmPreviewWrapStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 12,
  borderRadius: 8,
  border: '1px solid var(--agntcms-admin-border)',
  background: 'var(--agntcms-admin-surface)',
}

const confirmPreviewImgStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: 320,
  objectFit: 'contain',
  display: 'block',
}

const confirmFilenameStyle: CSSProperties = {
  fontSize: 14,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
  wordBreak: 'break-all',
}

