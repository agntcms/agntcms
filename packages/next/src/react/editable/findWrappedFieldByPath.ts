// Walk a wrapped item produced by `wrapItemForPreview` to locate the
// `PreviewFieldLike<T>` (carried inside an `EditableSlot<K, V>`) whose
// `origin.fieldPath` matches the leaf saved from inside a `<renderItem>`
// callback.
//
// SLOT-AWARE LOOKUP (sub-task 3)
//   Sub-task 3 of EDITABILITY_DESIGN.md changed the wrapped-item shape:
//   each editable field on a `SlotItem<S>` is an `EditableSlot<K, V>`
//   whose `slot.value` is a `PreviewFieldLike<V>` (for inline-editable
//   kinds) or a bare V (for non-inline kinds). The leaf check therefore
//   unwraps the slot first — `slot.value` is where the
//   `__agntcmsPreview` brand lives.
//
// Why this exists:
//   `EditableList`'s `<SaveProvider>` intercepts saves with a path-string
//   key (e.g. `tiers[0].features[1].label`). For TOP-LEVEL inline saves
//   inside a list item the lookup is one segment (`title`). For NESTED
//   list saves (list-of-lists; Pricing's tiers × features), the lookup
//   has to walk through the wrapped tier into the wrapped feature, then
//   to the leaf. This helper centralises that walk and keeps the routing
//   logic in `EditableList.tsx` declarative.
//
// IMPORT CONSTRAINTS:
//   - Same as `wrapItemForPreview.ts`: must not import from storage/,
//     runtime/, mcp/, tasks/, handlers/, config/. Type-only imports of
//     `domain/` are allowed.

import type { PreviewFieldLike } from './isPreviewField'
import { isPreviewField } from './isPreviewField'

/**
 * Parse a fieldPath segment of the form `name` or `name[idx]`.
 * Returns the field name and (if present) the array index.
 *
 * Returns `undefined` for malformed segments — callers fall back to
 * "no inline save closure", which is the safe default.
 */
function parsePathSegment(seg: string): { readonly name: string; readonly index?: number } | undefined {
  const bracket = seg.indexOf('[')
  if (bracket < 0) {
    if (seg.length === 0) return undefined
    return { name: seg }
  }
  const close = seg.indexOf(']', bracket + 1)
  if (close < 0) return undefined
  const name = seg.slice(0, bracket)
  const idxStr = seg.slice(bracket + 1, close)
  const idx = Number(idxStr)
  if (!Number.isInteger(idx) || idx < 0) return undefined
  if (name.length === 0) return undefined
  return { name, index: idx }
}

/**
 * Walk a wrapped item to find the inline-editable wrapped field whose
 * origin matches `relativePath`.
 *
 * `relativePath` is the suffix of `origin.fieldPath` after stripping the
 * caller's `<list>[itemIndex].` prefix — i.e. it ALWAYS starts at a
 * field NAME inside the wrapped item, not at the list itself. Examples:
 *   - `title`                   →  walks one hop, returns the wrapped
 *                                  `title` field of the item.
 *   - `features[2].label`       →  walks into `features` (a wrapped
 *                                  array of nested items), picks index
 *                                  2, then reads `label` on that nested
 *                                  wrapped item.
 *   - `x[0].y[1].z[2].deep`     →  three-level walk; same shape.
 *
 * Returns the wrapped field (a `PreviewFieldLike<T>` augmented with
 * `onSave`) when the path resolves to a wrapped leaf. Returns
 * `undefined` when the path doesn't resolve, the leaf is raw (kind that
 * isn't wrapped, e.g. boolean), or the leaf has no inline-save closure.
 *
 * The function is intentionally permissive: any structural mismatch
 * yields `undefined`, never throws. The caller (`<EditableList>`'s
 * SaveProvider) treats `undefined` as "no inline save available; fall
 * through silently".
 *
 * @internal
 */
export function findWrappedFieldByPath(
  wrappedItem: Record<string, unknown>,
  relativePath: string,
): (PreviewFieldLike<unknown> & { readonly onSave: (newValue: unknown) => void }) | undefined {
  // Split on `.` to get segments; each segment is `name` or `name[idx]`.
  const segments = relativePath.split('.')
  if (segments.length === 0) return undefined

  // Walk through every segment except the last as a "container" hop —
  // the segment is always `name[idx]` and must resolve to an array of
  // wrapped nested items. The final segment is the leaf NAME on the
  // current container; it must be a `PreviewFieldLike` with an
  // `onSave` closure.
  //
  // SUB-TASK 3 SLOT-AWARE HOPS:
  //   After sub-task 3, a `ListField` on a `SlotItem<S>` is
  //   `EditableSlot<'list', PreviewFieldLike<Array>>`, i.e.
  //   `{ value: { __agntcmsPreview, value: Array, origin, onSave } }`.
  //   Reading `cursor[name]` lands on the slot wrapper, NOT the array.
  //   We unwrap (a) the slot's `{ value }` shape, then (b) the
  //   `__agntcmsPreview` wrapper, before treating the result as the
  //   array of nested items. Both unwraps are PERMISSIVE: a value that
  //   isn't a slot or preview wrapper passes through unchanged, and the
  //   `Array.isArray` check that follows yields the existing
  //   "no inline save closure" `undefined` return on any structural
  //   mismatch.
  let cursor: Record<string, unknown> = wrappedItem
  for (let i = 0; i < segments.length - 1; i++) {
    const parsed = parsePathSegment(segments[i] as string)
    if (parsed === undefined || parsed.index === undefined) return undefined
    const raw = cursor[parsed.name]
    const unslotted = isSlotShape(raw) ? raw.value : raw
    const arrayValue = isPreviewField<unknown>(unslotted)
      ? (unslotted as { readonly value: unknown }).value
      : unslotted
    if (!Array.isArray(arrayValue)) return undefined
    const next = arrayValue[parsed.index]
    if (typeof next !== 'object' || next === null) return undefined
    cursor = next as Record<string, unknown>
  }

  // Final segment — the leaf name. We don't accept `[idx]` on the leaf:
  // the caller's contract is to save into a NAMED wrapped field, not
  // into a bare array slot. (No current field kind has a primitive-
  // array shape.)
  const last = parsePathSegment(segments[segments.length - 1] as string)
  if (last === undefined || last.index !== undefined) return undefined
  const leaf = cursor[last.name]
  // Sub-task 3: each editable field on `wrappedItem` is now an
  // `EditableSlot<K, V>` whose `slot.value` carries the
  // `PreviewFieldLike<V>` for inline-editable kinds. Unwrap one level
  // before the brand check.
  //
  // The unwrap is permissive: a leaf that is not a `{ value }` shape
  // (e.g. legacy data, a non-slot kind that happened to land at this
  // path, an unknown key) yields `inner === leaf` and the brand check
  // simply fails — matching the existing "no inline save closure"
  // contract. This is the safe direction: never throw on shape
  // mismatches.
  const inner = isSlotShape(leaf) ? leaf.value : leaf
  if (
    isPreviewField<unknown>(inner) &&
    'onSave' in inner &&
    typeof (inner as { onSave?: unknown }).onSave === 'function'
  ) {
    return inner as PreviewFieldLike<unknown> & { readonly onSave: (newValue: unknown) => void }
  }
  return undefined
}

/**
 * Structural check for an `EditableSlot<K, V>`-shaped object — exactly
 * `{ value }`. The phantom `[__slot]: K` brand has no runtime presence
 * (unique-symbol declared in `sections/defineSection.ts`), so the only
 * thing to inspect is the `value` key.
 *
 * The check is deliberately wide: it returns `true` for ANY object with
 * a `value` key. False positives are harmless because the inner brand
 * check (`isPreviewField`) is the load-bearing test — a non-slot object
 * that happens to expose a `value` key still fails the brand check and
 * the helper returns undefined.
 */
function isSlotShape(v: unknown): v is { readonly value: unknown } {
  return typeof v === 'object' && v !== null && 'value' in v
}

/**
 * Strip a `<list>[itemIndex].` prefix off a fieldPath, returning the
 * remainder (relative path inside the wrapped item) or `undefined`
 * when the prefix doesn't match.
 *
 * Why this is its own function:
 *   `EditableList`'s `field.origin.fieldPath` is the LIST's path (no
 *   item index); the SaveProvider intercept callbacks know `itemIndex`
 *   separately. Composing them into the canonical prefix and stripping
 *   it from a leaf path is awkward enough to deserve a named helper.
 *
 * @internal
 */
export function stripListItemPrefix(
  leafPath: string,
  listFieldPath: string,
  itemIndex: number,
): string | undefined {
  const prefix = `${listFieldPath}[${itemIndex}].`
  if (!leafPath.startsWith(prefix)) return undefined
  return leafPath.slice(prefix.length)
}
