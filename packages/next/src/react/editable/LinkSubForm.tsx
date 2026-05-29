'use client'

// LinkSubForm — the shared link sub-form used by both `EditableLink`
// (top-level link field, opened from the page) and `ItemFormEditor`
// (link field inside a list-item modal). Lifted into its own file so
// the two consumers cannot drift on segmented-control behaviour,
// page-list fetching, or validation messages.
//
// Behaviour:
//   - A segmented control switches between four types: Internal,
//     External, Email, Phone. The pills wrap on small screens. The
//     label is preserved across switches; the type-specific input is
//     reset to empty when the type changes (a URL is never a valid
//     slug, an email is never a valid phone, and so on — preserving
//     would just produce a stale validation error).
//   - Internal: a `<select>` of pages fetched from
//     `GET /api/agntcms/page/list`. The option labels are the page
//     slugs (the admin-list endpoint returns slug-only summaries so we
//     cannot show seo.title without a second roundtrip — slug is a
//     fine label for v1 and matches what the picker on the agent side
//     already uses).
//     If the fetch fails (or the route is missing), the picker falls
//     back to a free-text slug input so the editor stays usable —
//     the project's "graceful degradation" principle (ARCHITECTURE.md
//     §10) applied to the editor itself.
//   - External: a single `<input type="url">` validated by
//     `validateExternalUrl`.
//   - Email: a single `<input type="email">` validated by
//     `validateEmail`.
//   - Phone: a single `<input type="tel">` validated by
//     `validatePhone`.
//
// Page-list fetch: triggered the first time `usePageList(isOpen)` sees
// `isOpen === true`. We cache the result in a module-level promise so
// a second sub-form (e.g. opening EditableLink twice in a single page)
// does not refetch.
//
// IMPORT CONSTRAINTS:
//   - "use client" component. May NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react, sibling editable/ files, and type-only imports
//     of `LinkValue` from `domain/`.

import { useEffect, useRef, useState } from 'react'
import type { LinkValue } from '../../domain/index'
import {
  normalizeLinkValue,
  validateEmail,
  validateExternalUrl,
  validateInternalSlug,
  validatePhone,
} from '../../domain/index'

type LinkType = LinkValue['type']

// ---------------------------------------------------------------------------
// Page-list fetch — module-level cache so a second sub-form reuses the
// answer instead of hitting the route again. The promise is keyed by
// the endpoint; in v1 there is exactly one endpoint, so a single slot
// is enough.
// ---------------------------------------------------------------------------

interface PageListEntry {
  readonly slug: string
  /**
   * Optional human-friendly label. The admin-list endpoint does not
   * return SEO metadata, so this is undefined in v1; we keep the field
   * so a future endpoint that returns titles can populate it without
   * shape churn.
   */
  readonly label?: string
}

interface PageListResult {
  readonly ok: true
  readonly pages: ReadonlyArray<PageListEntry>
}
interface PageListFailure {
  readonly ok: false
  readonly reason: string
}
type PageListState = PageListResult | PageListFailure

let pageListCache: Promise<PageListState> | null = null

const fetchPageList = async (): Promise<PageListState> => {
  try {
    const res = await fetch('/api/agntcms/page/list', {
      method: 'GET',
      // Caller is in preview mode — we need fresh data, not a cached
      // bundle. The browser's HTTP cache still applies via headers.
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` }
    }
    const body = (await res.json()) as unknown
    if (
      body === null ||
      typeof body !== 'object' ||
      !Array.isArray((body as { pages?: unknown }).pages)
    ) {
      return { ok: false, reason: 'unexpected response shape' }
    }
    const raw = (body as { pages: unknown[] }).pages
    const pages: PageListEntry[] = raw
      .filter(
        (p): p is { slug: string } =>
          p !== null &&
          typeof p === 'object' &&
          typeof (p as { slug?: unknown }).slug === 'string',
      )
      // Stable alphabetical order — matches the admin-list shape order
      // and means the dropdown isn't surprising on every reload.
      .map((p) => ({ slug: p.slug }))
      .sort((a, b) => a.slug.localeCompare(b.slug))
    return { ok: true, pages }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'fetch failed' }
  }
}

const usePageList = (isOpen: boolean): PageListState | null => {
  const [state, setState] = useState<PageListState | null>(null)
  // why: under React.StrictMode (default in Next.js dev) effects mount →
  // cleanup → mount. A per-mount "fire once" ref would early-return on
  // the second invocation after cancelling the first invocation's
  // setState — leaving the component stuck on Loading… forever. The
  // module-level `pageListCache === null` guard is what actually
  // de-dupes the network request; each effect run is free to attach
  // its own `.then(setState)`. Multiple subscribers on one promise are
  // harmless — only the live effect's setState fires.
  useEffect(() => {
    if (!isOpen) return
    if (pageListCache === null) {
      pageListCache = fetchPageList()
    }
    let cancelled = false
    pageListCache.then((s) => {
      if (!cancelled) setState(s)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen])
  return state
}

/** @internal Reset the page-list cache. Test-only. */
export const __resetPageListCacheForTests = (): void => {
  pageListCache = null
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface LinkSubFormProps {
  /**
   * Current link value. Pass through `normalizeLinkValue` upstream if
   * you cannot guarantee it has the new shape — this component does
   * not double-normalise.
   */
  readonly value: LinkValue
  /** Called on every change with the next link value. */
  readonly onChange: (next: LinkValue) => void
  /**
   * When `true`, the page-list fetch is allowed to start. Use this
   * to gate the network request behind a parent modal's open state.
   * Defaults to `true`.
   */
  readonly isOpen?: boolean
  /**
   * Validation error to surface below the slug/url input. The parent
   * is responsible for tracking and clearing this. We don't compute
   * it inside the sub-form because the parent owns the Save boundary
   * (the modal in EditableLink, the form in ItemFormEditor) and
   * decides when to show it.
   */
  readonly error?: string | null
}

const FIELD_LABEL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 13,
  color: 'var(--agntcms-admin-fg-muted)',
}

const FIELD_INPUT_STYLE: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--agntcms-admin-fg)',
  background: 'var(--agntcms-admin-surface-raised)',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 4,
  padding: '6px 8px',
}

const SEGMENT_GROUP_STYLE: React.CSSProperties = {
  // `flex-wrap: wrap` allows the four pills to break onto two rows
  // on narrow modal widths (the Modal default `maxWidth` is 480px;
  // the four labels just fit on a single row at desktop sizes but
  // overflow on a narrow phone). Wrapping is the cleanest fallback —
  // the alternative was an overflow scroll which is harder to
  // discover with a touch device.
  display: 'inline-flex',
  flexWrap: 'wrap',
  gap: 2,
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 999,
  padding: 2,
  background: 'var(--agntcms-admin-surface-raised)',
  alignSelf: 'flex-start',
}

const segmentButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  fontSize: 12,
  fontWeight: active ? 600 : 500,
  color: active
    ? 'var(--agntcms-admin-accent-fg)'
    : 'var(--agntcms-admin-fg-muted)',
  background: active ? 'var(--agntcms-admin-accent)' : 'transparent',
  border: 'none',
  borderRadius: 999,
  cursor: 'pointer',
  font: 'inherit',
})

/**
 * Read the type-specific string off a `LinkValue`. Used by the local
 * draft state so we can present a single `<input>` regardless of which
 * branch is active and re-sync when the committed value changes
 * underneath the sub-form.
 */
function payloadOf(value: LinkValue): string {
  if (value.type === 'internal') return value.slug
  if (value.type === 'external') return value.url
  if (value.type === 'email') return value.email
  return value.phone
}

/** Build a blank LinkValue for `nextType`, preserving label across switches. */
function blankFor(nextType: LinkType, label: string): LinkValue {
  if (nextType === 'internal') return { type: 'internal', slug: '', label }
  if (nextType === 'external') return { type: 'external', url: '', label }
  if (nextType === 'email') return { type: 'email', email: '', label }
  return { type: 'phone', phone: '', label }
}

/**
 * Build a `LinkValue` for the current branch with the type-specific
 * string replaced. Used to commit a keystroke without losing label.
 */
function withPayload(value: LinkValue, payload: string): LinkValue {
  if (value.type === 'internal') return { type: 'internal', slug: payload, label: value.label }
  if (value.type === 'external') return { type: 'external', url: payload, label: value.label }
  if (value.type === 'email') return { type: 'email', email: payload, label: value.label }
  return { type: 'phone', phone: payload, label: value.label }
}

/**
 * Build a `LinkValue` for the current branch with `label` replaced.
 * Mirrors the per-branch object construction in `withPayload` so the
 * caller does not have to re-narrow `value.type`.
 */
function withLabel(value: LinkValue, label: string): LinkValue {
  if (value.type === 'internal') return { type: 'internal', slug: value.slug, label }
  if (value.type === 'external') return { type: 'external', url: value.url, label }
  if (value.type === 'email') return { type: 'email', email: value.email, label }
  return { type: 'phone', phone: value.phone, label }
}

interface SegmentDescriptor {
  readonly type: LinkType
  readonly label: string
}

const SEGMENTS: readonly SegmentDescriptor[] = [
  { type: 'internal', label: 'Internal' },
  { type: 'external', label: 'External' },
  { type: 'email', label: 'Email' },
  { type: 'phone', label: 'Phone' },
]

export function LinkSubForm(props: LinkSubFormProps): React.ReactElement {
  const { value, onChange, isOpen = true, error = null } = props
  const pageListState = usePageList(isOpen)

  // Hold a local string draft for the type-specific input so partial
  // keystrokes survive validation; the parent only sees clean
  // updates as the discriminated `LinkValue`.
  const [draft, setDraft] = useState<string>(payloadOf(value))
  // Re-sync the draft when the parent value changes underneath us
  // (e.g. switching segmented control resets the payload to ''),
  // but only when the in-flight draft was still aligned with the
  // previously-committed value. This mirrors the pattern used by
  // EditableNumber to avoid a "ping-pong" between draft and parent.
  const lastSeenRef = useRef<string>(draft)
  const committed = payloadOf(value)
  if (committed !== lastSeenRef.current) {
    if (draft === lastSeenRef.current) {
      setDraft(committed)
    }
    lastSeenRef.current = committed
  }

  const switchType = (nextType: LinkType): void => {
    if (value.type === nextType) return
    // Reset the payload on type-switch — preserving it across a
    // switch would always produce a validation error (an http URL is
    // never a valid slug, an email is never a valid phone, etc.).
    setDraft('')
    lastSeenRef.current = ''
    onChange(blankFor(nextType, value.label))
  }

  const handlePayloadChange = (next: string): void => {
    setDraft(next)
    lastSeenRef.current = next
    onChange(withPayload(value, next))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={SEGMENT_GROUP_STYLE} role="tablist" aria-label="Link type">
        {SEGMENTS.map((seg) => (
          <button
            key={seg.type}
            type="button"
            role="tab"
            aria-selected={value.type === seg.type}
            data-agntcms-link-type={seg.type}
            onClick={() => switchType(seg.type)}
            style={segmentButtonStyle(value.type === seg.type)}
          >
            {seg.label}
          </button>
        ))}
      </div>

      {value.type === 'internal' ? (
        <InternalPicker
          value={value.slug}
          draft={draft}
          pageListState={pageListState}
          onSlugChange={handlePayloadChange}
        />
      ) : value.type === 'external' ? (
        <ExternalUrlInput draft={draft} onUrlChange={handlePayloadChange} />
      ) : value.type === 'email' ? (
        <EmailInput draft={draft} onEmailChange={handlePayloadChange} />
      ) : (
        <PhoneInput draft={draft} onPhoneChange={handlePayloadChange} />
      )}

      {error !== null ? (
        <span
          data-agntcms-link-error=""
          role="alert"
          style={{
            fontSize: 12,
            color: 'var(--agntcms-admin-danger)',
          }}
        >
          {error}
        </span>
      ) : null}

      <label style={FIELD_LABEL_STYLE}>
        Label
        <input
          type="text"
          value={value.label}
          onChange={(e) => onChange(withLabel(value, e.currentTarget.value))}
          style={FIELD_INPUT_STYLE}
        />
      </label>
    </div>
  )
}

interface InternalPickerProps {
  readonly value: string
  readonly draft: string
  readonly pageListState: PageListState | null
  readonly onSlugChange: (nextSlug: string) => void
}

function InternalPicker(props: InternalPickerProps): React.ReactElement {
  const { value, draft, pageListState, onSlugChange } = props
  const [validationError, setValidationError] = useState<string | null>(null)

  // Until the fetch resolves we render a disabled select. On failure we
  // fall back to a free-text slug input so the editor stays usable —
  // the agent-side skill is the recovery path, but the human editor
  // shouldn't be locked out by a transient network blip.
  if (pageListState === null) {
    return (
      <label style={FIELD_LABEL_STYLE}>
        Page
        <select disabled style={FIELD_INPUT_STYLE} aria-busy="true">
          <option>Loading…</option>
        </select>
      </label>
    )
  }

  if (!pageListState.ok) {
    return (
      <label style={FIELD_LABEL_STYLE}>
        Page slug
        <input
          type="text"
          value={draft}
          placeholder="page slug"
          onChange={(e) => {
            const nextSlug = e.currentTarget.value
            const v = validateInternalSlug(nextSlug)
            setValidationError(v)
            onSlugChange(nextSlug)
          }}
          style={FIELD_INPUT_STYLE}
        />
        <span
          style={{
            fontSize: 11,
            color: 'var(--agntcms-admin-fg-dim)',
          }}
        >
          Page list unavailable ({pageListState.reason}); enter a slug manually.
        </span>
        {validationError !== null ? (
          <span
            role="alert"
            style={{
              fontSize: 12,
              color: 'var(--agntcms-admin-danger)',
            }}
          >
            {validationError}
          </span>
        ) : null}
      </label>
    )
  }

  // The select offers every page from the list. We deliberately keep
  // the current `value` selectable even when the slug is not in the
  // list (e.g. an old draft with a now-deleted slug) by rendering a
  // synthetic option for it. Otherwise the select would silently
  // collapse onto the first option and overwrite the author's data.
  const known = pageListState.pages.some((p) => p.slug === value)
  return (
    <label style={FIELD_LABEL_STYLE}>
      Page
      <select
        value={value}
        onChange={(e) => onSlugChange(e.currentTarget.value)}
        style={FIELD_INPUT_STYLE}
      >
        <option value="">Choose a page…</option>
        {!known && value !== '' ? (
          <option value={value}>{value} (missing)</option>
        ) : null}
        {pageListState.pages.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.label ?? p.slug}
          </option>
        ))}
      </select>
    </label>
  )
}

interface ExternalUrlInputProps {
  readonly draft: string
  readonly onUrlChange: (nextUrl: string) => void
}

function ExternalUrlInput(props: ExternalUrlInputProps): React.ReactElement {
  const { draft, onUrlChange } = props
  const [validationError, setValidationError] = useState<string | null>(null)
  return (
    <label style={FIELD_LABEL_STYLE}>
      URL
      <input
        type="url"
        value={draft}
        placeholder="https://example.com/path"
        onChange={(e) => {
          const next = e.currentTarget.value
          // Validate as the user types so the inline error appears
          // immediately. The parent's Save button is responsible for
          // short-circuiting if any sub-form reports an error.
          setValidationError(validateExternalUrl(next))
          onUrlChange(next)
        }}
        style={FIELD_INPUT_STYLE}
      />
      {validationError !== null ? (
        <span
          role="alert"
          style={{
            fontSize: 12,
            color: 'var(--agntcms-admin-danger)',
          }}
        >
          {validationError}
        </span>
      ) : null}
    </label>
  )
}

interface EmailInputProps {
  readonly draft: string
  readonly onEmailChange: (next: string) => void
}

function EmailInput(props: EmailInputProps): React.ReactElement {
  const { draft, onEmailChange } = props
  const [validationError, setValidationError] = useState<string | null>(null)
  return (
    <label style={FIELD_LABEL_STYLE}>
      Email
      <input
        type="email"
        value={draft}
        placeholder="you@example.com"
        onChange={(e) => {
          const next = e.currentTarget.value
          setValidationError(validateEmail(next))
          onEmailChange(next)
        }}
        style={FIELD_INPUT_STYLE}
      />
      {validationError !== null ? (
        <span
          role="alert"
          style={{
            fontSize: 12,
            color: 'var(--agntcms-admin-danger)',
          }}
        >
          {validationError}
        </span>
      ) : null}
    </label>
  )
}

interface PhoneInputProps {
  readonly draft: string
  readonly onPhoneChange: (next: string) => void
}

function PhoneInput(props: PhoneInputProps): React.ReactElement {
  const { draft, onPhoneChange } = props
  const [validationError, setValidationError] = useState<string | null>(null)
  return (
    <label style={FIELD_LABEL_STYLE}>
      Phone
      <input
        type="tel"
        value={draft}
        placeholder="+1 555 123 4567"
        onChange={(e) => {
          const next = e.currentTarget.value
          setValidationError(validatePhone(next))
          onPhoneChange(next)
        }}
        style={FIELD_INPUT_STYLE}
      />
      {validationError !== null ? (
        <span
          role="alert"
          style={{
            fontSize: 12,
            color: 'var(--agntcms-admin-danger)',
          }}
        >
          {validationError}
        </span>
      ) : null}
    </label>
  )
}

/**
 * Validate a `LinkValue` for save-time short-circuit. Returns `null`
 * when the value is fully ready to commit, or a human-readable error
 * string. Empty payload (slug, url, email, phone) is treated as
 * "incomplete" and rejected (different from the field-level
 * validators, which consider empty as "not-yet-entered").
 *
 * Exposed so `EditableLink` and `ItemFormEditor` can both apply the
 * same final check before calling `onSave`.
 */
export function validateLinkForSave(value: LinkValue): string | null {
  // Defensively re-normalise — if a caller forgot, this still works.
  const v = normalizeLinkValue(value)
  if (v.type === 'internal') {
    if (v.slug === '') return 'Pick a page or switch link type.'
    return validateInternalSlug(v.slug)
  }
  if (v.type === 'external') {
    if (v.url === '') return 'Enter a URL or switch link type.'
    return validateExternalUrl(v.url)
  }
  if (v.type === 'email') {
    if (v.email === '') return 'Enter an email address or switch link type.'
    return validateEmail(v.email)
  }
  if (v.phone === '') return 'Enter a phone number or switch link type.'
  return validatePhone(v.phone)
}
