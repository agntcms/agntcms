// `wrapSectionProps` — bridges raw section data to the slot-shaped props
// section components now declare. Called from every renderer that
// composes `(schema, data)` into a section component's props:
// `SectionRenderer`, `<GlobalSlot>`, and `SectionPickerModal`'s preview
// cards.
//
// WHY THIS EXISTS
// ---------------
// `EditableSlot<K, V>` (sections/defineSection.ts) is the COMPONENT-side
// shape every editable field carries on a section's props after
// EDITABILITY_DESIGN.md sub-task 1 landed. The runtime payload (page
// JSON, getContent return value) is unchanged — slots exist only at the
// renderer ↔ section-component boundary. This helper is the ONE place
// the lift happens.
//
// LIST / REFERENCE POLICY
// -----------------------
// `reference` stays raw; `list` is lifted like every other editable kind:
//   - `list`: lifted into `EditableSlot<'list', ReadonlyArray<SlotItem<S>>>`
//     by sub-task 3. The underlying value passes through unchanged
//     inside `slot.value`: in published mode that is the raw item array;
//     in preview mode it is a `PreviewFieldLike<ReadonlyArray<...>>`
//     carrying the list-level origin (so `<EditableList>`'s
//     add/remove/reorder routes through it). Per-item slot wrapping is
//     deferred to `<EditableList>`'s render path — see `wrapItemForPreview`
//     (preview) and `wrapItemAsSlot` (published) for the per-item lift.
//     Lifting items here would force the renderer to walk the entire
//     section tree and would block list-field handling that depends on
//     the array remaining a single PreviewField unit.
//   - `reference`: stays raw forever (decision #3, EDITABILITY_DESIGN.md).
//     References are not inline-editable in v1; a slot would force a no-op
//     `<EditableReference>` wrapper without UX value.
//
// UNKNOWN KEYS / MISSING SCHEMA
// -----------------------------
// Real-world data records carry the section schema's fields plus
// occasional ad-hoc props (e.g. the `layout` prop, `_id` on list items
// further inward). Any data key not present in `schema` passes through
// untouched. This is what makes the helper safe for `SectionPickerModal`
// preview cards too: the picker passes `defaults` (schema-derived) plus
// sometimes a `layout` override; non-schema keys flow through.
//
// IMPORT CONSTRAINTS
// ------------------
// `sections/` depends only on `domain/`. This file imports from
// `domain/fields` (descriptor types) and the local `wrapAsSlot.ts`
// helper. No `react/`, no `runtime/`, no I/O.

import type { FieldDescriptor, FieldKind } from '../domain/fields'
import type { SectionSchema } from '../domain/schema'
import { wrapAsSlot } from './wrapAsSlot'

/**
 * Field kinds whose values are lifted into `EditableSlot<K, V>` by this
 * helper. The `reference` kind passes through unchanged — see the file
 * header for why.
 *
 * `list` is in the set because EDITABILITY_DESIGN.md sub-task 3 made
 * `ListField` slot-typed end-to-end: section components receive
 * `EditableSlot<'list', ReadonlyArray<SlotItem<S>>>`. The lift here is
 * SHALLOW — `wrapAsSlot('list', value)` stores the underlying value
 * (preview wrapper or raw array) inside `slot.value`. Per-item slot
 * wrapping happens at `<EditableList>` render time, where the renderer
 * has access to the live items array and the list-level origin needed to
 * stitch inline-save closures.
 */
const SLOT_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>([
  'text',
  'richText',
  'image',
  'video',
  'link',
  'button',
  'number',
  'boolean',
  'select',
  'list',
])

/**
 * Build the props record passed to a section component, lifting every
 * editable field value into an `EditableSlot<K, V>` per its descriptor
 * `kind`. `reference` values pass through raw, as does any data key not
 * present in `schema`.
 *
 * Shape of the input:
 *   - `data`: the section's data record. May be a mix of bare values
 *     (published mode) and `PreviewField<V>` wrappers (preview mode).
 *     `wrapAsSlot` does not distinguish the two — whichever arm comes
 *     in is preserved verbatim inside `slot.value`. The editable
 *     components and the public `read()` helper unwrap downstream.
 *   - `schema`: the section's field-descriptor map. When undefined
 *     (e.g. a synthetic test definition or a stub picker entry),
 *     EVERY key passes through unchanged — there is no kind to
 *     dispatch on.
 *
 * Pure: no I/O, no side effects, no React. Safe to call from server and
 * client renderers alike.
 */
export function wrapSectionProps(
  data: Readonly<Record<string, unknown>>,
  schema: SectionSchema | undefined,
): Record<string, unknown> {
  if (schema === undefined) {
    // No schema — return a shallow copy so callers can mutate without
    // touching the input. Equivalent to `{ ...data }`.
    return { ...data }
  }

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    const descriptor = schema[key] as FieldDescriptor | undefined
    if (descriptor === undefined) {
      // Key isn't in the schema (e.g. `layout`, transitional extras).
      // Pass through verbatim — there is no editable widget bound to it.
      out[key] = value
      continue
    }
    if (!SLOT_KINDS.has(descriptor.kind)) {
      // `reference` (and any future non-slot kinds): pass through.
      // `list` is in `SLOT_KINDS` since sub-task 3 — see the file
      // header's per-kind table for the rationale.
      out[key] = value
      continue
    }
    out[key] = wrapAsSlot(descriptor.kind, value)
  }
  return out
}
