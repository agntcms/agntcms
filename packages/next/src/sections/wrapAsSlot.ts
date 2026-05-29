// `wrapAsSlot` — runtime helper that lifts a bare value (or its
// preview-mode wrapper) into the opaque `EditableSlot<K, V>` shape that
// section-component props now carry.
//
// WHY THIS LIVES IN `sections/`
// -----------------------------
// `EditableSlot<K, V>` is declared in `sections/defineSection.ts`, and
// `wrapAsSlot` is the single point where the type machinery is bridged
// to a concrete runtime object. Putting the helper in the same module
// boundary as the type keeps the two co-located: anyone changing the
// slot brand can find the constructor that produces it without crossing
// layers.
//
// `sections/` already depends only on `domain/` (see ARCHITECTURE.md
// §8); `wrapAsSlot` does not break that — the function imports nothing
// from sibling modules and has no I/O. SectionRenderer (in `react/`)
// is the prospective consumer of this helper in sub-task 2; it will
// import the value from `../sections/index`. The existing convention
// in `react/` is to import sections symbols as `import type` only,
// which sub-task 2 will need to relax for this single helper. The
// alternative — placing the helper in `runtime/` — would force `react/`
// to value-import from `runtime/`, which is a stronger violation of
// invariant 1 (CLAUDE.md). `sections/` is the lower cost.
//
// RUNTIME SHAPE
// -------------
// At runtime the slot is just `{ value }`. The `[__slot]: K` brand is a
// PHANTOM unique-symbol property — it exists ONLY in the type system and
// is never set on the actual object. The helper therefore produces an
// object whose runtime structure is identical to a `PreviewField<T>`'s
// `{ value }` arm, intentionally: editable components read `.value` and
// detect a `__agntcmsPreview` brand on the inner value to choose
// between preview and published rendering branches.
//
// The `kind` parameter exists at runtime for symmetry with the type-side
// kind discriminator and to enable future debug-time assertions. It is
// not currently stored on the produced slot — there is nothing the
// editable components need to read at runtime that the inner descriptor
// doesn't already provide via the schema lookup.

import type { FieldKind } from '../domain/fields'
import type { EditableSlot } from './defineSection'

/**
 * Wrap a bare runtime value (or a preview-mode wrapped value) into an
 * `EditableSlot<K, V>`. The phantom `[__slot]: K` brand is NOT set at
 * runtime — it is a type-system-only marker that forces section
 * components to consume the value through an editable widget rather
 * than render it raw.
 *
 * `kind` is the slot-kind discriminator (`'text'`, `'richText'`,
 * `'image'`, …). It currently has no runtime effect, but it pins the
 * generic parameter `K` at the call site so `<EditableText
 * field={slot}>` cannot be passed an `EditableSlot<'image', …>`.
 *
 * `value` may be either the bare runtime value (published mode) or a
 * `PreviewField<V>` wrapper (preview mode). The helper does NOT
 * distinguish the two — it simply stores whatever it is given. The
 * `read()` helper in `react/editable/read.ts` and the editable
 * components themselves know how to detect the wrapper.
 *
 * NOT YET CALLED FROM ANY CONSUMER. Sub-task 2 will wire this into
 * `SectionRenderer` so every editable field flows through here before
 * reaching the section component.
 */
export function wrapAsSlot<K extends FieldKind, V>(
  // `kind` is consumed only at the type level today. Keeping the
  // parameter rather than dropping it preserves the call-site shape we
  // want SectionRenderer to use — `wrapAsSlot('text', value)` — and
  // leaves room for a future debug brand without a signature change.
  _kind: K,
  value: V | { readonly __agntcmsPreview: true; readonly value: V; readonly origin: unknown },
): EditableSlot<K & string, V> {
  // The phantom brand is NOT settable at runtime (it is a `unique
  // symbol` declared on the type side only). The `as` cast is the
  // bridge from the dynamic shape to the typed surface. This is the
  // ONLY place in the package that produces an `EditableSlot` value;
  // every other layer reads through `read()` or through editable
  // components that consume `slot.value`.
  return { value } as EditableSlot<K & string, V>
}
