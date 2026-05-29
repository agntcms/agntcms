'use client'

// ButtonSubForm — the shared button sub-form used by both
// `ButtonPickerModal` (top-level button field, opened from the page)
// and `ItemFormEditor` (button field inside a list-item modal).
// Lifted into its own file so the two consumers cannot drift on label /
// variant / link editing.
//
// Layout:
//   - Label  — text input bound to `value.label`.
//   - Variant — `<select>` populated from the descriptor's `variants`
//     list. If the stored variant is not in the list (e.g. a variant
//     was removed from the schema after content was authored), a
//     synthetic `(missing)` option is rendered so the editor surfaces
//     the stale value rather than silently rewriting it.
//   - Link toggle — checkbox: "This button links somewhere". When OFF,
//     the saved `ButtonValue.link` is omitted (undefined). When ON,
//     the shared `<LinkSubForm>` is rendered to edit the link.
//
// Why label is collected here, not inside the link's own label: a
// button's visible text takes precedence. The link's `label` field is
// effectively unused by `EditableButton` — sections render
// `value.label` directly, not `value.link?.label`. Keeping a distinct
// "Label" input at this layer makes the precedence explicit.
//
// IMPORT CONSTRAINTS:
//   - "use client" component. May NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react, sibling editable/ files, and type-only imports
//     of `ButtonValue` / `LinkValue` / `SelectOption` from `domain/`.

import type {
  ButtonValue,
  LinkValue,
  SelectOption,
} from '../../domain/index'
import { LinkSubForm } from './LinkSubForm'

export interface ButtonSubFormProps {
  /** Current button value. */
  readonly value: ButtonValue
  /** Called on every change with the next button value. */
  readonly onChange: (next: ButtonValue) => void
  /** Closed list of variants the section component supports. */
  readonly variants: ReadonlyArray<SelectOption>
  /**
   * When `true`, the inner `<LinkSubForm>` is allowed to start its
   * page-list fetch. Mirrors `LinkSubForm`'s `isOpen` gate.
   * Defaults to `true`.
   */
  readonly isOpen?: boolean
  /** Validation error to surface inside the inner LinkSubForm. */
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

const TOGGLE_LABEL_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  color: 'var(--agntcms-admin-fg-muted)',
  cursor: 'pointer',
}

/** Build a default `LinkValue` for the "linked" toggle. */
function defaultLink(label: string): LinkValue {
  // Internal/empty-slug mirrors `defineSection.builtInDefault`'s link
  // case — the picker shows "Choose a page…" until the author selects.
  return { type: 'internal', slug: '', label }
}

export function ButtonSubForm(props: ButtonSubFormProps): React.ReactElement {
  const { value, onChange, variants, isOpen = true, error = null } = props

  const variantValues = variants.map((v) => v.value)
  const hasVariant = variantValues.includes(value.variant)
  const linked = value.link !== undefined

  const setLabel = (label: string): void => {
    onChange({ ...value, label })
  }

  const setVariant = (variant: string): void => {
    onChange({ ...value, variant })
  }

  const toggleLink = (next: boolean): void => {
    if (next) {
      // Seed with an internal blank link carrying the button's label
      // so the rendered link's own label field starts populated.
      onChange({ ...value, link: defaultLink(value.label) })
    } else {
      // Drop the key entirely (rather than set it to `undefined`) so
      // `exactOptionalPropertyTypes` stays satisfied. Object spread
      // would otherwise carry the original key forward.
      const { link: _omit, ...rest } = value
      void _omit
      onChange(rest as ButtonValue)
    }
  }

  const setLink = (next: LinkValue): void => {
    onChange({ ...value, link: next })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={FIELD_LABEL_STYLE}>
        Label
        <input
          type="text"
          value={value.label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          style={FIELD_INPUT_STYLE}
          data-agntcms-button-label=""
        />
      </label>

      <label style={FIELD_LABEL_STYLE}>
        Variant
        <select
          value={value.variant}
          onChange={(e) => setVariant(e.currentTarget.value)}
          style={FIELD_INPUT_STYLE}
          data-agntcms-button-variant=""
        >
          {/* Render the stored value as "(missing)" when it's not in
              the declared list — same precedent as `LinkSubForm`'s
              page picker for slugs that aren't in the page list. The
              author can then switch to a known variant; we don't
              silently rewrite the stored value. */}
          {!hasVariant && value.variant !== '' ? (
            <option value={value.variant}>{value.variant} (missing)</option>
          ) : null}
          {variants.map((opt: SelectOption) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label style={TOGGLE_LABEL_STYLE}>
        <input
          type="checkbox"
          checked={linked}
          onChange={(e) => toggleLink(e.currentTarget.checked)}
          data-agntcms-button-link-toggle=""
        />
        <span>This button links somewhere</span>
      </label>

      {linked && value.link !== undefined ? (
        <LinkSubForm
          value={value.link}
          onChange={setLink}
          isOpen={isOpen}
          error={error}
        />
      ) : null}
    </div>
  )
}
