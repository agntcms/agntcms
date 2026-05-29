// `read<T>(slot)` — public author-facing helper that collapses a slot
// down to its bare value.
//
// USE CASE
// --------
// Section authors who want to pass a slot's value to a NON-EDITABLE
// utility — `hrefOf(linkValue)`, `parseVideoUrl(url)`, a date formatter
// — call `read(slot)` to get the bare `V`. They DO NOT touch
// `slot.value` directly because that field carries a `V |
// PreviewFieldLike<V>` union; reading it raw forces the author to
// branch on `isPreviewField` at every call site, which is exactly the
// boilerplate this helper eliminates.
//
// THIS REPLACES THE OLD `resolveLinkValue` / `resolveField` PATTERN
// ----------------------------------------------------------------
// Pre-slot, template sections did
//
//   const link = resolveLinkValue(field)   // narrow union manually
//
// where `resolveLinkValue` looked at the structural shape (preview
// wrapper or bare value) and returned the bare `LinkValue`. With slots,
// `field` is `EditableSlot<'link', LinkValue>` and the unwrap target is
// `slot.value`'s preview-vs-bare branch. `read()` is the one helper that
// covers the unwrap for every kind.
//
// IMPORT CONSTRAINTS (invariant 2)
// --------------------------------
// This file lives in `react/editable/` because `read()` is exported on
// `@agntcms/next/client` for section-author use. It must NOT import
// anything from storage/, runtime/, mcp/, tasks/, handlers/, config/.
// `EditableSlot` is a TYPE from `sections/`, imported with `import type`
// only; that's allowed because the value-side constructor (`wrapAsSlot`)
// stays inside the runtime data path and never crosses into
// client-bundle code.

import type { EditableSlot } from '../../sections/defineSection'
import { isPreviewField } from './isPreviewField'

/**
 * Collapse an `EditableSlot<K, V>` to its bare value `V`.
 *
 * In published mode, `slot.value` is already `V`, so the helper is a
 * straight read. In preview mode, `slot.value` is a `PreviewFieldLike<V>`
 * carrying origin metadata; the helper unwraps to `.value`.
 *
 * The slot kind `K` is irrelevant to the unwrap and is therefore widened
 * via `string` in the parameter type — section authors call `read(linkSlot)`
 * without knowing or caring which slot kind they hold.
 */
export function read<V>(slot: EditableSlot<string, V>): V {
  const value = slot.value
  if (isPreviewField<V>(value)) {
    return value.value
  }
  return value
}

/**
 * Is this slot currently rendering in preview mode?
 *
 * In preview mode, `slot.value` is a `PreviewFieldLike<V>` carrying origin
 * metadata. In published mode, it is the bare `V`. This helper is the
 * canonical signal an author should use to keep an OPTIONAL link/image/etc.
 * field VISIBLE and CLICKABLE in preview when it would otherwise be hidden
 * by an empty-value short-circuit.
 *
 * The canonical idiom for an optional CTA:
 *
 *     const cta = read(rawCta)
 *     const showCta = Boolean(hrefOf(cta)) || isSlotInPreview(rawCta)
 *     {showCta && <a ...><EditableLink field={rawCta} ... /></a>}
 *
 * Without the `|| isSlotInPreview(...)` clause, an unconfigured optional CTA
 * disappears in preview mode and the author has no click target to open the
 * link picker. With it, the `<a>` (and the `<EditableLink>` inside) stays
 * mounted in preview, but the published site still hides it.
 *
 * The slot kind `K` is irrelevant to the check (the preview wrapper shape is
 * the same for every kind), so it is widened via `string` in the parameter
 * type — authors call `isSlotInPreview(linkSlot)` without naming the kind.
 */
export function isSlotInPreview<V>(slot: EditableSlot<string, V>): boolean {
  return isPreviewField<V>(slot.value)
}
