'use client'

// ItemFormEditor — recursive form-editor used by `EditableList` (per-list-item
// ✎ button) to render an editing form for an item's value, and recursively
// for any nested ListField cells inside that form.
//
// Filtering policy:
//   - `EditableList`'s ✎ button passes `inlineEditableHidden={true}` so
//     the modal renders ONLY the meta/non-inline fields of a list item.
//     The visible editorial fields (text/richText/image/link/list) are
//     edited inline on the rendered card via the wrapped PreviewItem; a
//     duplicate set of widgets in the modal would be confusing and let
//     editors edit the same value through two paths.
//   - This file's own `NestedListEditor` recurses into itself for nested
//     list rows. Those nested rows have no inline path; the full schema
//     is rendered (default `inlineEditableHidden={false}`).
//
// Why this is its own file:
//   - Only one place defines the field-kind → widget mapping. The same
//     mapping must work for top-level item fields AND for nested
//     ListField cells, so the renderer recurses into itself for the
//     'list' case. Extracting it here is the only way to avoid a
//     duplicated switch.
//   - The widgets here are DELIBERATELY plain form controls — they do
//     NOT use EditableText/EditableImage/EditableLink/etc. Those
//     components carry their own modal-on-click behaviour, hover
//     outlines, agent ✨ buttons, and PreviewField origin plumbing.
//     None of that applies inside a modal-form context: the form
//     already has its own Save/Cancel boundary, and the items rendered
//     here have no per-item PreviewField origin (saves go through the
//     parent's origin).
//
// Validation policy:
//   - Link fields render via the shared `<LinkSubForm>`, so the
//     internal/external segmented control, page picker, and URL
//     allow-list are identical to `<EditableLink>`. The parent
//     modal's Save button is responsible for short-circuiting if any
//     sub-form reports an error.
//   - Other fields trust the descriptor's hints (number min/max/step,
//     select options) at the widget level only. The runtime never
//     re-validates — that contract is preserved.
//
// IMPORT CONSTRAINTS:
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react, sibling editable/ files, and type-only imports
//     of descriptor types from `domain/`.

import { useCallback } from 'react'
import type {
  ButtonValue,
  FieldDescriptor,
  ImageValue,
  LinkValue,
  ListItem,
  SectionSchema,
  SelectOption,
  VideoValue,
} from '../../domain/index'
import { normalizeLinkValue } from '../../domain/index'
import { LinkSubForm } from './LinkSubForm'

type AnyItem = ListItem<SectionSchema>
type AnyItemValue = AnyItem[keyof AnyItem]

// ---------------------------------------------------------------------------
// _id generation — duplicated from EditableList because the nested-list
// editor needs to mint new ids when the user adds a row. Same rationale
// as the original: short, opaque, unique-within-list, no Web Crypto
// dependency.
// ---------------------------------------------------------------------------

function generateItemId(): string {
  const r = Math.random().toString(36).slice(2, 10)
  const t = Date.now().toString(36)
  return `li_${t}_${r}`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ItemFormEditorProps {
  /** The schema describing every field this editor must render. */
  readonly schema: SectionSchema
  /** Current draft value of the item. */
  readonly value: AnyItem
  /** Called on every keystroke / interaction with the patched item. */
  readonly onChange: (next: AnyItem) => void
  /**
   * When true, fields whose kind is inline-eligible (per `isModalEligible`)
   * are HIDDEN from the rendered modal body. Used by `EditableList`'s ✎
   * button so its modal only exposes meta/non-inline fields — visible
   * editorial content is edited on the rendered card itself.
   *
   * Default `false`: the rendered modal shows every field. This is what
   * `NestedListEditor` (recursive nested-list rows in the same modal)
   * wants — those rows have no inline path of their own.
   */
  readonly inlineEditableHidden?: boolean
}

// ---------------------------------------------------------------------------
// Inline / modal classification policy.
//
// This is a POLICY split, not a capability split. The wrap mechanism
// (`wrapItemForPreview`) currently supports inline editing for kinds
// {text, richText, image, link, list, boolean}. But the user's editorial
// model says boolean is META — it's a setting, not visible content —
// and dropping `<EditableBoolean>` next to a card's headline pollutes
// the published-style preview with form chrome. So `boolean` is
// classified MODAL even though the wrap can do inline.
//
// Future contributors: when adding a new wrapped field kind, do NOT
// auto-extend the inline-eligible set here — decide separately whether
// the kind is editorial content (inline) or meta/configuration (modal).
// ---------------------------------------------------------------------------

/**
 * Inline-eligible kinds — visible editorial content edited on the card
 * itself via the wrapped PreviewItem. These four are the canonical
 * "what the reader sees" fields.
 *
 * Why `link` is NOT here (it used to be):
 *   A link's editable surface is its DESTINATION (slug / url / email /
 *   phone), which is configuration, not a visible text node. The only
 *   inline affordance `<EditableLink>` offers is a clickable label span
 *   — but the common list pattern (nav menus, footers) renders the
 *   visible text through a SEPARATE `text` field (`label`) and uses the
 *   link solely via `read(item.link)` to compute an href. In that
 *   pattern the link has no inline surface at all, so classifying it
 *   inline-only left it UNEDITABLE: the ✎ modal filtered it out and the
 *   card never rendered an `<EditableLink>` for it. Treating `link` as
 *   modal-eligible routes it through this file's `<LinkSubForm>` (same
 *   sub-form `<EditableLink>` uses), restoring editability. Authors who
 *   DO render `<EditableLink field={item.link}>` inline still get the
 *   inline path — the modal entry is purely additive.
 */
const INLINE_EDITABLE_KINDS: ReadonlySet<FieldDescriptor['kind']> = new Set([
  'text',
  'richText',
  'image',
  'list',
])

/**
 * Kinds that are EXCLUDED from the item form entirely — never rendered,
 * regardless of `inlineEditableHidden`.
 *
 * Why this exists separately from `INLINE_EDITABLE_KINDS`:
 *   - "Inline-eligible" = "edit it on the card body via PreviewItem". The
 *     ✎ modal still renders these fields when `inlineEditableHidden` is
 *     false (the recursive `NestedListEditor` case).
 *   - "Excluded"        = "the modal renders nothing for this kind".
 *     The field IS edited somewhere else, but NOT through the form
 *     surface this component owns. The button is the canonical case:
 *     it's a self-contained editable on the page, edited only by
 *     clicking the button itself (which opens `<ButtonPickerModal>`).
 *     Adding a row here would create a duplicate editor surface.
 *
 * If a kind belongs in BOTH categories conceptually, exclusion wins —
 * the modal silently skips it.
 */
const FORM_EXCLUDED_KINDS: ReadonlySet<FieldDescriptor['kind']> = new Set([
  'button',
])

/**
 * Returns true when a field descriptor's kind is reachable ONLY through a
 * modal (meta/non-inline). Returns false for the inline-eligible set
 * — those fields are edited on the rendered card.
 *
 * Policy (not capability):
 *   FALSE (= inline-only): text, richText, image, list
 *   TRUE  (= modal-only):  link, number, boolean, select, video, reference
 *
 * Even though `boolean` (and others) have inline editor components,
 * authors should NOT use them inside a list item's `renderItem` — the
 * modal handles those. See INLINE_EDITABLE_KINDS comment above for the
 * extension protocol.
 */
export function isModalEligible(descriptor: FieldDescriptor): boolean {
  return !INLINE_EDITABLE_KINDS.has(descriptor.kind)
}

/**
 * Renders a vertical stack of labelled controls for every field in
 * `schema`, plus recursive inline editors for any nested ListField.
 * Pure presentation: this component holds no commit/cancel state — its
 * caller (the section settings modal or list-item ✎ modal) owns
 * Save/Cancel.
 *
 * When `inlineEditableHidden` is true, fields whose kind is
 * inline-eligible are filtered out — the modal renders only meta fields.
 * Defensive empty-state caption is rendered if filtering leaves nothing
 * (in practice `EditableList` gates the ✎ button on
 * `hasModalEligibleFields`, so this branch shouldn't be reachable).
 */
export function ItemFormEditor(props: ItemFormEditorProps): React.ReactElement {
  const { schema, value, onChange, inlineEditableHidden = false } = props
  // Step 1: hard exclusion. Some kinds (e.g. `button`) own a self-contained
  // editor surface on the page itself; rendering them inside this form
  // would create a duplicate edit path.
  // Step 2: optional inline-eligible filter when called from EditableList's
  // ✎ button (visible content is edited inline on the card).
  const allEntries = Object.entries(schema).filter(
    ([, d]) => !FORM_EXCLUDED_KINDS.has(d.kind),
  )
  const entries = inlineEditableHidden
    ? allEntries.filter(([, d]) => isModalEligible(d))
    : allEntries

  if (entries.length === 0) {
    return (
      <div style={FORM_STACK_STYLE}>
        <span style={EMPTY_STATE_STYLE}>
          No fields to edit here — all content is editable inline.
        </span>
      </div>
    )
  }

  return (
    <div style={FORM_STACK_STYLE}>
      {entries.map(([fieldName, descriptor]) => (
        <ItemFormField
          key={fieldName}
          fieldName={fieldName}
          descriptor={descriptor}
          value={value[fieldName] as AnyItemValue}
          onChange={(v) => onChange({ ...value, [fieldName]: v })}
        />
      ))}
    </div>
  )
}

const EMPTY_STATE_STYLE: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--agntcms-admin-fg-dim)',
  fontStyle: 'italic',
}

const FORM_STACK_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

// ---------------------------------------------------------------------------
// Per-field row: label + control. The label is the field's name as
// declared in the schema. We don't infer prettier names — that's a
// schema-author concern and would require a separate metadata channel
// not in v1.
// ---------------------------------------------------------------------------

interface ItemFormFieldProps {
  readonly fieldName: string
  readonly descriptor: FieldDescriptor
  readonly value: AnyItemValue
  readonly onChange: (next: AnyItemValue) => void
}

function ItemFormField(props: ItemFormFieldProps): React.ReactElement {
  const { fieldName, descriptor, value, onChange } = props
  // Boolean is the one kind we render with the label INSIDE a horizontal
  // row instead of stacked above the control — the visual rhythm of a
  // checkbox needs a single line to read naturally.
  if (descriptor.kind === 'boolean') {
    const boolValue = typeof value === 'boolean' ? value : false
    return (
      <label style={INLINE_LABEL_STYLE}>
        <input
          type="checkbox"
          checked={boolValue}
          onChange={(e) => onChange(e.currentTarget.checked as AnyItemValue)}
        />
        <span>{fieldName}</span>
      </label>
    )
  }
  return (
    <label style={STACKED_LABEL_STYLE}>
      <span style={LABEL_TEXT_STYLE}>{fieldName}</span>
      <ItemFieldControl descriptor={descriptor} value={value} onChange={onChange} />
    </label>
  )
}

const STACKED_LABEL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const INLINE_LABEL_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  color: 'var(--agntcms-admin-fg-muted)',
  cursor: 'pointer',
}

const LABEL_TEXT_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--agntcms-admin-fg-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 500,
}

const INPUT_STYLE: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--agntcms-admin-fg)',
  background: 'var(--agntcms-admin-surface-raised)',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 4,
  padding: '6px 8px',
}

// ---------------------------------------------------------------------------
// Field control dispatcher — covers every closed-set FieldDescriptor.
// ---------------------------------------------------------------------------

interface ItemFieldControlProps {
  readonly descriptor: FieldDescriptor
  readonly value: AnyItemValue
  readonly onChange: (next: AnyItemValue) => void
}

function ItemFieldControl(props: ItemFieldControlProps): React.ReactElement {
  const { descriptor, value, onChange } = props

  switch (descriptor.kind) {
    case 'text': {
      const stringValue = typeof value === 'string' ? value : ''
      return (
        <input
          type="text"
          value={stringValue}
          onChange={(e) => onChange(e.currentTarget.value as AnyItemValue)}
          style={INPUT_STYLE}
        />
      )
    }
    case 'reference': {
      // Reference's runtime value is `{ slug }` per domain/schema.ts. The
      // editor exposes only the slug as a string — an inline reference
      // picker is not in v1.
      const stringValue =
        typeof value === 'string'
          ? value
          : value !== null &&
              typeof value === 'object' &&
              'slug' in value &&
              typeof (value as { slug: unknown }).slug === 'string'
            ? (value as { slug: string }).slug
            : ''
      return (
        <input
          type="text"
          value={stringValue}
          placeholder="page slug"
          onChange={(e) => onChange(e.currentTarget.value as AnyItemValue)}
          style={INPUT_STYLE}
        />
      )
    }
    case 'richText': {
      const stringValue = typeof value === 'string' ? value : ''
      return (
        <textarea
          value={stringValue}
          onChange={(e) => onChange(e.currentTarget.value as AnyItemValue)}
          rows={4}
          style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit' }}
        />
      )
    }
    case 'image': {
      // Inline filename + alt editor. Full image-picker (browse + upload)
      // is intentionally out of scope inside the list-item modal: the
      // picker requires a PreviewField origin which list items do not
      // have. Documented as a deferred enhancement.
      const img: ImageValue =
        value !== null && typeof value === 'object' && 'filename' in value
          ? (value as ImageValue)
          : { filename: '', alt: '' }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input
            type="text"
            value={img.filename}
            placeholder="filename"
            onChange={(e) =>
              onChange({ filename: e.currentTarget.value, alt: img.alt } as AnyItemValue)
            }
            style={INPUT_STYLE}
          />
          <input
            type="text"
            value={img.alt}
            placeholder="alt text"
            onChange={(e) =>
              onChange({ filename: img.filename, alt: e.currentTarget.value } as AnyItemValue)
            }
            style={INPUT_STYLE}
          />
        </div>
      )
    }
    case 'video': {
      // Inline URL + ratio + caption editor. The full picker (with
      // live preview) is intentionally out of scope inside the
      // settings/list-item modal: nesting modals is bad UX and the
      // inline shape is sufficient for authoring inside a list.
      // Mirrors the rationale for `image` above (no upload UI here
      // either).
      //
      // Each onChange rebuilds the full `VideoValue` from scratch, so
      // every edit must explicitly preserve the OTHER optional keys
      // (aspectRatio, caption) — otherwise typing in the URL field
      // would silently strip the caption (and vice versa).
      const v: VideoValue =
        value !== null && typeof value === 'object' && 'url' in value
          ? (value as VideoValue)
          : { url: '' }
      const ratioStr = v.aspectRatio ?? ''
      const captionStr = v.caption ?? ''
      // Compose a fresh `VideoValue` from the trio (url, ratio,
      // caption). Optional keys are emitted only when they hold a
      // non-empty value, matching `exactOptionalPropertyTypes` and
      // the picker modal's serialization rule.
      const compose = (
        url: string,
        ratio: NonNullable<VideoValue['aspectRatio']> | '',
        caption: string,
      ): VideoValue => ({
        url,
        ...(ratio === '' ? {} : { aspectRatio: ratio }),
        ...(caption === '' ? {} : { caption }),
      })
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input
            type="text"
            value={v.url}
            placeholder="Paste a YouTube, Vimeo, Wistia, or Loom URL"
            onChange={(e) => {
              onChange(
                compose(e.currentTarget.value, ratioStr, captionStr) as AnyItemValue,
              )
            }}
            style={INPUT_STYLE}
          />
          <select
            value={ratioStr}
            onChange={(e) => {
              const raw = e.currentTarget.value as
                | ''
                | NonNullable<VideoValue['aspectRatio']>
              onChange(compose(v.url, raw, captionStr) as AnyItemValue)
            }}
            style={INPUT_STYLE}
          >
            <option value="">Auto (16:9)</option>
            <option value="16:9">16:9</option>
            <option value="4:3">4:3</option>
            <option value="1:1">1:1 (square)</option>
            <option value="9:16">9:16 (vertical)</option>
          </select>
          <input
            type="text"
            value={captionStr}
            placeholder="Optional caption shown below the video"
            onChange={(e) => {
              onChange(compose(v.url, ratioStr, e.currentTarget.value) as AnyItemValue)
            }}
            style={INPUT_STYLE}
          />
        </div>
      )
    }
    case 'link':
      return (
        <LinkSubForm
          value={normalizeLinkValue(value)}
          onChange={(next) => onChange(next as AnyItemValue)}
        />
      )
    case 'button': {
      // Buttons are excluded from the item form by `FORM_EXCLUDED_KINDS`
      // (see top of file): the entry filter strips them before they
      // reach this dispatcher. The case label is kept for switch
      // exhaustiveness — TypeScript narrows `descriptor.kind` against
      // every member of the closed `FieldDescriptor` union, and dropping
      // this branch would force a `default` fallback for `'button'`.
      // The branch is functionally unreachable.
      void descriptor
      return <span aria-hidden="true" />
    }
    case 'number': {
      const numValue = typeof value === 'number' ? value : 0
      return (
        <input
          type="number"
          value={numValue}
          {...(descriptor.min !== undefined ? { min: descriptor.min } : {})}
          {...(descriptor.max !== undefined ? { max: descriptor.max } : {})}
          {...(descriptor.step !== undefined ? { step: descriptor.step } : {})}
          onChange={(e) => {
            const parsed = Number(e.currentTarget.value)
            if (Number.isFinite(parsed)) onChange(parsed as AnyItemValue)
          }}
          style={INPUT_STYLE}
        />
      )
    }
    case 'boolean': {
      // Boolean has its own labelled-row layout in ItemFormField; this
      // case is unreachable in practice but kept for exhaustiveness.
      const boolValue = typeof value === 'boolean' ? value : false
      return (
        <input
          type="checkbox"
          checked={boolValue}
          onChange={(e) => onChange(e.currentTarget.checked as AnyItemValue)}
        />
      )
    }
    case 'select': {
      const stringValue = typeof value === 'string' ? value : ''
      return (
        <select
          value={stringValue}
          onChange={(e) => onChange(e.currentTarget.value as AnyItemValue)}
          style={INPUT_STYLE}
        >
          {descriptor.options.map((opt: SelectOption) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )
    }
    case 'list':
      return (
        <NestedListEditor
          itemSchema={descriptor.itemSchema}
          value={value}
          onChange={onChange}
          min={descriptor.min}
          max={descriptor.max}
        />
      )
    default: {
      const _exhaustive: never = descriptor
      void _exhaustive
      return <span>(unsupported field)</span>
    }
  }
}

// ---------------------------------------------------------------------------
// NestedListEditor — recursive inline editor for a `ListField` cell.
//
// One row per nested item, each row containing the item's fields rendered
// through the SAME ItemFormEditor (recursion). Add/remove/reorder
// affordances per row. Replaces the JSON textarea of the old design.
// ---------------------------------------------------------------------------

interface NestedListEditorProps {
  readonly itemSchema: SectionSchema
  readonly value: AnyItemValue
  readonly onChange: (next: AnyItemValue) => void
  readonly min: number | undefined
  readonly max: number | undefined
}

function NestedListEditor(props: NestedListEditorProps): React.ReactElement {
  const { itemSchema, value, onChange, min, max } = props
  const items: ReadonlyArray<AnyItem> = Array.isArray(value)
    ? (value as ReadonlyArray<AnyItem>)
    : []

  // Local helpers. Each one builds the new array and forwards it to the
  // parent through onChange — the parent owns commit semantics (the
  // outer item's draft state in the modal). We pass through unknown
  // typing because AnyItemValue is the union of all field-value shapes.
  const commit = useCallback(
    (next: ReadonlyArray<AnyItem>) => {
      onChange(next as unknown as AnyItemValue)
    },
    [onChange],
  )

  const updateRow = useCallback(
    (index: number, nextItem: AnyItem) => {
      const next = items.map((it, i) => (i === index ? nextItem : it))
      commit(next)
    },
    [items, commit],
  )

  const addRow = useCallback(() => {
    if (max !== undefined && items.length >= max) return
    const blank = buildBlankItem(itemSchema)
    commit([...items, blank])
  }, [items, max, itemSchema, commit])

  const removeRow = useCallback(
    (index: number) => {
      if (min !== undefined && items.length <= min) return
      commit(items.filter((_, i) => i !== index))
    },
    [items, min, commit],
  )

  const moveRow = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= items.length) return
      const next = items.slice()
      const [moved] = next.splice(from, 1) as [AnyItem]
      next.splice(to, 0, moved)
      commit(next)
    },
    [items, commit],
  )

  return (
    <div
      data-agntcms-list-nested=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 8,
        border: '1px dashed var(--agntcms-admin-border)',
        borderRadius: 4,
      }}
    >
      {items.length === 0 ? (
        <span style={{ fontSize: 12, color: 'var(--agntcms-admin-fg-dim)' }}>
          No items yet.
        </span>
      ) : null}
      {items.map((row, idx) => (
        <div
          key={row._id}
          data-agntcms-list-nested-row=""
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 8,
            background: 'var(--agntcms-admin-surface)',
            border: '1px solid var(--agntcms-admin-border)',
            borderRadius: 4,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'var(--agntcms-admin-fg-dim)',
            }}
          >
            <span>#{idx + 1}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => moveRow(idx, idx - 1)}
                disabled={idx === 0}
                aria-label="Move row up"
                style={smallButtonStyle(idx === 0)}
              >
                {'↑'}
              </button>
              <button
                type="button"
                onClick={() => moveRow(idx, idx + 1)}
                disabled={idx === items.length - 1}
                aria-label="Move row down"
                style={smallButtonStyle(idx === items.length - 1)}
              >
                {'↓'}
              </button>
              <button
                type="button"
                onClick={() => removeRow(idx)}
                disabled={min !== undefined && items.length <= min}
                aria-label="Remove row"
                data-agntcms-list-nested-remove=""
                style={smallButtonStyle(min !== undefined && items.length <= min)}
              >
                {'×'}
              </button>
            </div>
          </div>
          {/* Nested-list rows live INSIDE the section settings modal —
              there is no inline path for them. The recursive editor
              renders all schema fields. */}
          <ItemFormEditor
            schema={itemSchema}
            value={row}
            onChange={(updated) => updateRow(idx, updated)}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        disabled={max !== undefined && items.length >= max}
        data-agntcms-list-nested-add=""
        style={{
          alignSelf: 'flex-start',
          padding: '4px 10px',
          fontSize: 12,
          background: 'var(--agntcms-admin-surface-raised)',
          color: 'var(--agntcms-admin-fg)',
          border: '1px solid var(--agntcms-admin-border)',
          borderRadius: 4,
          cursor: max !== undefined && items.length >= max ? 'not-allowed' : 'pointer',
          opacity: max !== undefined && items.length >= max ? 0.5 : 1,
        }}
      >
        + Add
      </button>
    </div>
  )
}

function smallButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: 4,
    border: '1px solid var(--agntcms-admin-border)',
    background: 'var(--agntcms-admin-surface-raised)',
    color: 'var(--agntcms-admin-fg-muted)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    fontSize: 12,
    lineHeight: 1,
    padding: 0,
  }
}

// ---------------------------------------------------------------------------
// buildBlankItem — exported so EditableList can also build a fresh item
// when the user clicks "+ Add item" at the top level. Kept here (next to
// the only other place that needs it) instead of duplicating the switch.
// ---------------------------------------------------------------------------

/**
 * Build a blank item from a schema, using each field descriptor's
 * `default` if present, otherwise a per-kind built-in. The duplication
 * relative to `defineSection`'s `builtInDefault` is deliberate: react/
 * cannot import from sections/. The values produced here are used only
 * by the editor as initial drafts.
 *
 * `ListField.default` requires special handling: the schema's literal
 * default array is shared reference-wise across every blank built from
 * the same descriptor, AND any `_id`s declared inside it would collide
 * across consecutive Add clicks. We deep-clone each seed item via
 * `cloneListDefaultItem`, which mints a fresh `_id` at every level
 * (including nested ListField cells). All other field kinds inherit
 * their `default` value as-is — they are primitives or shallow value
 * objects with no identity to track.
 */
export function buildBlankItem(schema: SectionSchema): AnyItem {
  const item: Record<string, unknown> = { _id: generateItemId() }
  for (const [key, descriptor] of Object.entries(schema)) {
    if (descriptor.kind === 'list') {
      const listDefault = descriptor.default
      if (Array.isArray(listDefault) && listDefault.length > 0) {
        item[key] = listDefault.map((seed) =>
          cloneListDefaultItem(seed, descriptor.itemSchema),
        )
        continue
      }
      // Either no `default` declared or an explicit empty array — both
      // mean "start the list empty".
      item[key] = []
      continue
    }
    item[key] = (descriptor as { default?: unknown }).default ?? blankFor(descriptor)
  }
  return item as AnyItem
}

/**
 * Deep-clone one seed item from a `ListField.default` into a runtime
 * `AnyItem`. Mints a fresh `_id` (a literal id from the schema would
 * collide on a second Add click) and recurses into any nested ListField
 * cells so THEIR items also get fresh ids. Fields the seed omits fall
 * back to per-kind blanks via `blankFor`, mirroring the top-level
 * `buildBlankItem` behaviour.
 */
function cloneListDefaultItem(
  seed: { readonly [k: string]: unknown } | unknown,
  schema: SectionSchema,
): AnyItem {
  const seedRecord: Record<string, unknown> =
    seed !== null && typeof seed === 'object' ? (seed as Record<string, unknown>) : {}
  const out: Record<string, unknown> = { _id: generateItemId() }
  for (const [key, descriptor] of Object.entries(schema)) {
    if (descriptor.kind === 'list') {
      const seedValue = seedRecord[key]
      const seedArray = Array.isArray(seedValue)
        ? (seedValue as ReadonlyArray<unknown>)
        : Array.isArray(descriptor.default)
          ? (descriptor.default as ReadonlyArray<unknown>)
          : []
      out[key] = seedArray.map((nested) =>
        cloneListDefaultItem(nested, descriptor.itemSchema),
      )
      continue
    }
    if (key in seedRecord) {
      out[key] = seedRecord[key]
      continue
    }
    out[key] =
      (descriptor as { default?: unknown }).default ?? blankFor(descriptor)
  }
  return out as AnyItem
}

function blankFor(descriptor: FieldDescriptor): unknown {
  switch (descriptor.kind) {
    case 'text':
    case 'richText':
      return ''
    case 'image':
      return { filename: '', alt: '' } satisfies ImageValue
    case 'video':
      // Empty `url` triggers the editor's "no video — click to add"
      // placeholder; absent `aspectRatio` is the canonical "auto"
      // (= 16:9) signal.
      return { url: '' } satisfies VideoValue
    case 'reference':
      return ''
    case 'link':
      return { type: 'internal', slug: '', label: '' } satisfies LinkValue
    case 'button':
      // Mirrors `defineSection.builtInDefault`'s button case: pick the
      // first declared variant, empty link (the picker shows a
      // "linked?" toggle that's OFF by default — link is omitted).
      return {
        label: '',
        variant: descriptor.variants[0]?.value ?? '',
      } satisfies ButtonValue
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'select':
      return descriptor.options[0]?.value ?? ''
    case 'list':
      return []
    default: {
      const _exhaustive: never = descriptor
      void _exhaustive
      return ''
    }
  }
}
