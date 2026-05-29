// wrapItemForPreview — adapt a single ListItem<S> for inline editing inside
// `<EditableList>`'s preview-mode `renderItem` callback.
//
// Why this lives in `react/editable/` and not in `domain/`:
//   The wrap manipulates `PreviewField`-like origins and binds inline-save
//   closures. Both are UI concerns — the domain layer is descriptor- and
//   data-shape-only and must not know about preview wrappers (invariant 1).
//
// Why this exists at all:
//   `<EditableList>`'s `renderItem` hands the section author a wrapped
//   item so they can write `<EditableRichText field={item.title}>` straight
//   into the card. Visible content edits inline; meta fields edit through
//   the ✎ modal. Both paths require an in-memory representation that
//   carries:
//     - origin metadata per editable field (so the backend save knows
//       which field-path to update),
//     - an inline-save closure that bubbles up through one outer-list
//       commit per mutation.
//
// SUB-TASK 3 — slot-typed items
//   Sub-task 3 of EDITABILITY_DESIGN.md replaced the historical tri-arm
//   `PreviewItem<S>` (raw | wrapped | array-of-wrapped) with `SlotItem<S>`.
//   Every field on a wrapped item is now an `EditableSlot<K, V>` whose
//   `slot.value` carries one of:
//     - bare V          (non-inline-editable kinds: number, select, video)
//     - PreviewFieldLike<V>  (inline-editable kinds: text, richText,
//                             image, link, boolean, button — slot.value
//                             is augmented with `onSave` so the inline
//                             save closure flows through)
//     - PreviewFieldLike<ReadonlyArray<ListItem<NS>>>   (nested list —
//                             slot.value carries the RAW nested array
//                             plus origin/onSave for add/remove/reorder
//                             at the array level; the inner `<EditableList>`
//                             does its own per-item wrap at render time)
//
//   `_id` and reference stay raw on the slot-typed item (same rule as
//   `SlotItem<S>` itself: reference per decision #3, `_id` because it
//   has no inline-editing surface).
//
// Save semantics — list-as-one-save-unit is preserved at every level:
//   The inline `onSave` closure does NOT route to a per-item endpoint.
//   It rebuilds the FULL outer list array (newItem in place, all other
//   items reference-equal to their originals) and calls `commit(newList)`
//   — the same `commit` that add/remove/reorder use. For nested lists,
//   the wrapped nested-list field's `onSave(newNestedArray)` rebuilds the
//   OUTER item with that nested array swapped in, then delegates to the
//   outer `commitItem`, which calls `commit(newOuterList)`. Inline-leaf
//   edits inside a nested item flow through the INNER `<EditableList>`'s
//   per-item dispatcher → leaf onSave → inner commit (= the outer
//   ItemCard's saveField via context) → wrapped nested-list field's
//   onSave → outer commitItem. Different paths, same single outermost
//   `commit` per mutation. That preserves the contract documented in
//   `EditableList.tsx`'s file header: any list mutation re-emits the
//   whole array through the list's PreviewField origin.
//
// Liveness of `fullList`:
//   The closure captures `fullList` by parameter at wrap-call time. The
//   intended call pattern is to invoke `wrapItemForPreview` ON EVERY
//   RENDER of `EditableList`, passing the live `field.value`, so two
//   consecutive saves on the same item never see a stale array.
//   `EditableList.tsx` upholds this: the wrap call sits in the render
//   body, not memoised across renders.
//
// IMPORT CONSTRAINTS:
//   - This file is consumed by a "use client" component (EditableList).
//     It must NOT import from storage/, runtime/, mcp/, tasks/, handlers/,
//     config/. Type-only imports of `domain/` are allowed.
//   - The slot brand types come from `sections/`. We import `wrapAsSlot`
//     as a value (it is a pure function that lives next to the slot type
//     definition) and `SlotItem` / `EditableSlot` as types only.

import type {
  ButtonValue,
  FieldDescriptor,
  ImageValue,
  LinkValue,
  ListItem,
  SectionSchema,
} from '../../domain/index'
import { normalizeLinkValue } from '../../domain/index'
import type { EditableSlot, SlotItem } from '../../sections/index'
import { wrapAsSlot } from '../../sections/index'
import type { PreviewFieldLike, PreviewFieldOriginLike } from './isPreviewField'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * `PreviewFieldLike<T>` augmented with an inline save closure. The closure
 * is the inline-edit callback that `<EditableText>` / `<EditableRichText>`
 * / `<EditableImage>` invoke through their normal save path — see
 * `EditableList.tsx` for the per-item `<SaveProvider>` that routes
 * SaveContext writes into this closure.
 *
 * Structurally a superset of `PreviewFieldLike<T>`, so existing checks
 * (`isPreviewField`) continue to recognise it. Lives inside an
 * `EditableSlot<K, V>`'s `value` arm in preview mode.
 */
export interface InlineEditablePreviewField<T> extends PreviewFieldLike<T> {
  readonly onSave: (newValue: T) => void
}

// ---------------------------------------------------------------------------
// wrapItemForPreview
// ---------------------------------------------------------------------------

/**
 * Wrap a single list item for preview-mode rendering. See file header
 * for the full design rationale.
 *
 * Parameters:
 *   - `item`        — the raw list item (carries `_id` + per-field values).
 *   - `schema`      — the list's `itemSchema`. The wrap iterates the schema
 *                     keys (NOT the data keys) so that fields the author
 *                     just added to the schema but not yet present in
 *                     existing data still get wrapped consistently.
 *                     Existing data fields not in the schema pass through
 *                     unwrapped — they're either legacy keys or data
 *                     drift; wrapping them would invent a fieldPath the
 *                     save backend cannot resolve.
 *   - `index`       — the item's position in `fullList`. Encoded into
 *                     the wrapped origin as `[${index}]` so the DOM data
 *                     attribute (`data-agntcms-field`) is meaningful for
 *                     hover / debugging.
 *   - `listOrigin`  — the LIST's PreviewField origin. The wrapped fields
 *                     inherit `pageSlug`/`sectionId`/`source`/`revision`
 *                     and only the `fieldPath` is extended.
 *   - `fullList`    — the full live array of items; closed over so the
 *                     `onSave` closure can reproduce the array. Pass the
 *                     value at render time, not a stale snapshot.
 *   - `commit`      — the list's outbound write. The closure calls this
 *                     ONCE per save with the new full array, no matter
 *                     how deeply the edited field was nested.
 *
 * Returns a `SlotItem<S>`: every field on the wrapped item is an
 * `EditableSlot<K, V>` (or raw for `_id` / reference), matching the
 * type the section author sees on `renderItem`'s parameter.
 */
export function wrapItemForPreview<S extends SectionSchema>(
  item: ListItem<S>,
  schema: S,
  index: number,
  listOrigin: PreviewFieldOriginLike,
  fullList: ReadonlyArray<ListItem<S>>,
  commit: (next: ReadonlyArray<ListItem<S>>) => void,
): SlotItem<S> {
  // The single bubbling commit closure: takes a replacement for the
  // current item and pushes the rebuilt full list through `commit`. Used
  // by both the leaf (text/richText/image) wrap helpers and by the
  // recursion into nested lists.
  const commitItem = (newItem: ListItem<S>): void => {
    const next = fullList.map((it, i) => (i === index ? newItem : it))
    commit(next)
  }
  return wrapItemWithCommit(item, schema, index, listOrigin, commitItem)
}

// ---------------------------------------------------------------------------
// Internal recursion core
// ---------------------------------------------------------------------------

/**
 * Wrap a single item with a generic "publish my new state through this
 * commit" closure. The closure receives the updated item; the caller
 * decides how that update propagates upward.
 *
 * The public `wrapItemForPreview` is the only caller today: it passes a
 * closure that rebuilds the outer list and calls the user-supplied
 * `commit`. The factoring is preserved (rather than inlined) because the
 * inner-commit indirection is exactly what lets `commitItem` close over
 * the full-list-rebuild logic without leaking it into the per-field
 * branches below — each branch only knows "give me an updated item and
 * I'll make sure the right thing happens upstream".
 */
function wrapItemWithCommit<S extends SectionSchema>(
  item: ListItem<S>,
  schema: S,
  index: number,
  listOrigin: PreviewFieldOriginLike,
  commitItem: (newItem: ListItem<S>) => void,
): SlotItem<S> {
  // Build the slot-typed item by iterating the schema keys. Start with a
  // shallow copy of the raw item so unknown / legacy data keys (and
  // `_id`) pass through intact, then overlay slot-wrapped fields on the
  // schema-known keys. The output is typed `Record<string, unknown>`
  // here and asserted to `SlotItem<S>` at the return — `SlotItem<S>`'s
  // type-level mapping is the load-bearing guarantee, this dynamic
  // assembly is the runtime bridge.
  const out: Record<string, unknown> = { ...(item as Record<string, unknown>) }

  for (const key of Object.keys(schema)) {
    const descriptor = schema[key]
    if (descriptor === undefined) continue
    if (key === '_id') continue // schema cannot legally declare `_id`, but be defensive

    const rawValue = (item as Record<string, unknown>)[key]
    const fieldPath = `${listOrigin.fieldPath}[${index}].${key}`

    if (descriptor.kind === 'text' || descriptor.kind === 'richText') {
      // Text / RichText: wrap as PreviewFieldLike<string> inside an
      // `EditableSlot<'text'|'richText', string>`. Empty string when the
      // data is missing — matches how SectionRenderer treats missing
      // top-level fields.
      const value = typeof rawValue === 'string' ? rawValue : ''
      const wrapped = makeWrappedField<string>(value, fieldPath, listOrigin, (newValue) => {
        const newItem = { ...(item as Record<string, unknown>), [key]: newValue } as ListItem<S>
        commitItem(newItem)
      })
      out[key] = wrapAsSlot(descriptor.kind, wrapped)
      continue
    }

    if (descriptor.kind === 'image') {
      // Image: wrap as PreviewFieldLike<ImageValue> inside an
      // `EditableSlot<'image', ImageValue>`. Default to an empty
      // ImageValue when the data is missing so authors using
      // `<EditableImage field={item.hero}>` don't crash on a brand-new
      // item that has no image yet.
      const value: ImageValue = isImageValue(rawValue) ? rawValue : { filename: '', alt: '' }
      const wrapped = makeWrappedField<ImageValue>(value, fieldPath, listOrigin, (newValue) => {
        const newItem = { ...(item as Record<string, unknown>), [key]: newValue } as ListItem<S>
        commitItem(newItem)
      })
      out[key] = wrapAsSlot('image', wrapped)
      continue
    }

    if (descriptor.kind === 'link') {
      // Link: wrap as PreviewFieldLike<LinkValue> inside an
      // `EditableSlot<'link', LinkValue>`. The raw value goes through
      // `normalizeLinkValue` so legacy `{href,label}` payloads, missing
      // data, and pasted garbage all collapse onto the current
      // discriminated union before EditableLink's preview branch reads
      // it. This matches what `getContent` already does for top-level
      // link fields on read.
      const value: LinkValue = normalizeLinkValue(rawValue)
      const wrapped = makeWrappedField<LinkValue>(value, fieldPath, listOrigin, (newValue) => {
        const newItem = { ...(item as Record<string, unknown>), [key]: newValue } as ListItem<S>
        commitItem(newItem)
      })
      out[key] = wrapAsSlot('link', wrapped)
      continue
    }

    if (descriptor.kind === 'boolean') {
      // Boolean: wrap as PreviewFieldLike<boolean> inside an
      // `EditableSlot<'boolean', boolean>`. Defensive normalisation
      // matches `image`/`link`: a non-boolean stored value (legacy data,
      // schema drift, missing field) collapses to `false` so
      // EditableBoolean's preview branch never sees `unknown` at runtime.
      const value: boolean = typeof rawValue === 'boolean' ? rawValue : false
      const wrapped = makeWrappedField<boolean>(value, fieldPath, listOrigin, (newValue) => {
        const newItem = { ...(item as Record<string, unknown>), [key]: newValue } as ListItem<S>
        commitItem(newItem)
      })
      out[key] = wrapAsSlot('boolean', wrapped)
      continue
    }

    if (descriptor.kind === 'button') {
      // Button: wrap as PreviewFieldLike<ButtonValue> inside an
      // `EditableSlot<'button', ButtonValue>`. Without this wrap,
      // EditableButton's preview branch never fires and clicking a CTA in
      // a list-item card (Pricing tiers, etc.) navigates the underlying
      // link instead of opening the picker modal.
      //
      // The ButtonValue is wrapped as a single unit — the optional `link`
      // sub-object is NOT independently wrapped. Editing flows through
      // the picker modal which emits a fully-formed replacement
      // ButtonValue, so a leaf-level wrap on `link` would be both
      // redundant and a routing mismatch (the saved fieldPath would
      // diverge from what the modal commits).
      //
      // Defensive default mirrors `image`/`link`: missing or malformed
      // data collapses to `{ label: '', variant: <first declared>, link: undefined }`
      // so EditableButton's preview branch never sees `unknown` at
      // runtime.
      const fallbackVariant = descriptor.variants[0]?.value ?? ''
      const value: ButtonValue = isButtonValue(rawValue)
        ? rawValue
        : { label: '', variant: fallbackVariant }
      const wrapped = makeWrappedField<ButtonValue>(value, fieldPath, listOrigin, (newValue) => {
        const newItem = { ...(item as Record<string, unknown>), [key]: newValue } as ListItem<S>
        commitItem(newItem)
      })
      out[key] = wrapAsSlot('button', wrapped)
      continue
    }

    if (descriptor.kind === 'list') {
      // Nested list: wrap as a SINGLE PreviewFieldLike whose `value` is
      // the RAW nested array (no per-item pre-wrap) inside an
      // `EditableSlot<'list', ReadonlyArray<SlotItem<NS>>>`. The author
      // renders the nested array through an inner
      // `<EditableList field={item.features}>` which does its own
      // per-item wrap at render time — that is the SAME contract as
      // top-level lists. Two reasons not to pre-wrap nested items here:
      //   1. `EditableList` always re-wraps the items it receives via
      //      `wrapItemForPreview`. Re-wrapping pre-wrapped items
      //      corrupts origins (the inner wrap sees a slot/`PreviewFieldLike`
      //      where it expects a string/ImageValue and falls back to
      //      empty defaults).
      //   2. Without an array-level PreviewField origin we can't expose
      //      add/remove/reorder for nested lists.
      //
      // The wrapped field's `onSave(newNestedArray)` accepts a FULL
      // replacement nested array (the way `EditableList`'s `commit`
      // calls `onSave` after add/remove/move), rebuilds the outer item
      // with that array swapped in, and delegates to the outer
      // `commitItem`. The cascade ends at the topmost `commit` —
      // exactly one outer-list commit per mutation, no matter how
      // deeply nested the edit was.
      //
      // The runtime value inside `slot.value.value` is `ReadonlyArray<ListItem<NS>>`
      // (the bare items). The TYPE asserts `ReadonlyArray<SlotItem<NS>>`
      // because section-author code consumes the items through
      // `<EditableList renderItem>`, which produces the slot-typed shape
      // at render time. Items are structurally compatible: the slot
      // brand is phantom and adds no runtime keys.
      //
      // Defensive default: a non-array `rawValue` (missing field, schema
      // drift, legacy data) collapses to `[]` so the wrapped value is
      // always a real array — `<EditableList>`'s preview branch reads
      // `.length` immediately.
      const nestedRaw: ReadonlyArray<ListItem<SectionSchema>> = Array.isArray(rawValue)
        ? (rawValue as ReadonlyArray<ListItem<SectionSchema>>)
        : []
      // Capture `key` per iteration so the closure binds to THIS list
      // field name, not a later loop iteration's key.
      const nestedKey = key
      const wrapped = makeWrappedField<ReadonlyArray<ListItem<SectionSchema>>>(
        nestedRaw,
        fieldPath,
        listOrigin,
        (newNestedArray) => {
          const newItem = {
            ...(item as Record<string, unknown>),
            [nestedKey]: newNestedArray,
          } as ListItem<S>
          commitItem(newItem)
        },
      )
      out[key] = wrapAsSlot('list', wrapped)
      continue
    }

    if (
      descriptor.kind === 'number' ||
      descriptor.kind === 'select' ||
      descriptor.kind === 'video'
    ) {
      // Non-inline-editable kinds (per `INLINE_EDITABLE_KINDS` in
      // `ItemFormEditor.tsx`): no `<EditableNumber>` / `<EditableSelect>`
      // / `<EditableVideo>` is rendered inside a list-item card. The wrap
      // still produces a slot so `SlotItem<S>` is structurally complete
      // — the type machinery promises the section author every editable
      // field on `item` is a slot — but `slot.value` carries the bare
      // value (no PreviewFieldLike, no onSave). The ✎ modal reaches
      // these kinds through `<ItemFormEditor>`, which works on raw item
      // drafts (not slot-typed), so the wrap not carrying a closure here
      // is correct.
      out[key] = wrapAsSlot(descriptor.kind, rawValue)
      continue
    }

    // reference — pass through raw. Same rule as the top-level
    // `wrapSectionProps` (decision #3).
  }

  return out as unknown as SlotItem<S>
}

// ---------------------------------------------------------------------------
// wrapItemAsSlot — published-mode counterpart
// ---------------------------------------------------------------------------

/**
 * Build the slot-typed shape for a list item in PUBLISHED mode.
 *
 * Mirrors `wrapItemForPreview` for the published-mode rendering path:
 * `<EditableList>`'s renderItem callback receives the SAME `SlotItem<S>`
 * shape in both modes, so the section author's `renderItem` body is
 * single-pathed. The only difference: published-mode slots carry the
 * BARE value inside `slot.value` (no `PreviewFieldLike`, no inline-save
 * closure — there is nothing to save in published mode).
 *
 * Reference passes through raw, matching the top-level
 * `wrapSectionProps` policy.
 *
 * @internal Exported for `<EditableList>` use only.
 */
export function wrapItemAsSlot<S extends SectionSchema>(
  item: ListItem<S>,
  schema: S,
): SlotItem<S> {
  const out: Record<string, unknown> = { ...(item as Record<string, unknown>) }
  for (const key of Object.keys(schema)) {
    const descriptor = schema[key] as FieldDescriptor | undefined
    if (descriptor === undefined) continue
    if (key === '_id') continue
    if (descriptor.kind === 'reference') continue
    const rawValue = (item as Record<string, unknown>)[key]
    out[key] = wrapAsSlot(descriptor.kind, rawValue)
  }
  return out as unknown as SlotItem<S>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a single wrapped field. Inherits `pageSlug`/`sectionId`/`source`/
 * `revision` from the list's origin and replaces only `fieldPath`. `kind`
 * and `globalName` are inherited (they exist for v0.2 global routing —
 * an item inside a global-backed list still routes its saves to the
 * global endpoint via its inherited origin).
 */
function makeWrappedField<T>(
  value: T,
  fieldPath: string,
  listOrigin: PreviewFieldOriginLike,
  onSave: (newValue: T) => void,
): InlineEditablePreviewField<T> {
  // Spread to preserve `kind`/`globalName` only when they're set on the
  // list origin — `exactOptionalPropertyTypes` makes setting them to
  // `undefined` invalid.
  const origin: PreviewFieldOriginLike = {
    ...listOrigin,
    fieldPath,
  }
  return {
    __agntcmsPreview: true,
    value,
    origin,
    onSave,
  }
}

/** Narrow `unknown` to `ImageValue` without `any`. */
function isImageValue(v: unknown): v is ImageValue {
  return (
    typeof v === 'object' &&
    v !== null &&
    'filename' in v &&
    typeof (v as { filename: unknown }).filename === 'string' &&
    'alt' in v &&
    typeof (v as { alt: unknown }).alt === 'string'
  )
}

/**
 * Narrow `unknown` to `ButtonValue` without `any`. Only the required
 * keys are checked — `link`, when present, is trusted to round-trip
 * through the picker modal (which itself normalises through
 * `normalizeLinkValue` on save).
 */
function isButtonValue(v: unknown): v is ButtonValue {
  return (
    typeof v === 'object' &&
    v !== null &&
    'label' in v &&
    typeof (v as { label: unknown }).label === 'string' &&
    'variant' in v &&
    typeof (v as { variant: unknown }).variant === 'string'
  )
}

// ---------------------------------------------------------------------------
// Type re-export
// ---------------------------------------------------------------------------
//
// `SlotItem<S>` is the canonical shape for a wrapped list item — it
// lives in `sections/defineSection.ts`, but consumers of this file
// (notably `EditableList.tsx`) want to import the type from one place.
// Re-export here to preserve that one-place contract.

export type { SlotItem, EditableSlot } from '../../sections/index'
