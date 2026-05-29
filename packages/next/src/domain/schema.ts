// Shared schema-level types used by both the section definition layer
// (`sections/defineSection`) and the runtime (`runtime/getContent`).
//
// These types were originally defined locally in both places (T-003 and
// T-007). T-008 hoists them here so there is a single source of truth in
// the domain module, which is the natural centre of the dependency graph.
//
// Import policy: this file imports ONLY from `./fields` within domain/.
// It MUST NOT import from storage/, runtime/, sections/, or any other
// sibling module.

import type {
  BooleanField,
  ButtonField,
  ButtonValue,
  FieldDescriptor,
  ImageField,
  ImageValue,
  LinkField,
  LinkValue,
  ListField,
  NumberField,
  ReferenceField,
  RichTextField,
  SelectField,
  TextField,
  VideoField,
  VideoValue,
} from './fields'

// ---------------------------------------------------------------------------
// SectionSchema
// ---------------------------------------------------------------------------

/**
 * A section schema: a record mapping field names to built-in field
 * descriptors. This is the COMPILE-TIME description authors pass to
 * `defineSection` and that the runtime uses to resolve per-field types.
 *
 * Defined as a plain `Record<string, FieldDescriptor>` — deliberately
 * WITHOUT a `Readonly<>` wrapper. The reason: `SectionSchema` is used
 * as a constraint in `extends` position (e.g. `S extends SectionSchema`).
 * Adding `Readonly` forces an index signature onto any schema extending
 * it, which collapses `keyof S` to `string` under mapped types and
 * erases the concrete field names the type machinery depends on. Keeping
 * it as a plain Record lets finite object-literal schemas remain
 * assignable without acquiring an index signature, preserving `keyof S`
 * as the precise union of field-name literals.
 *
 * The `Readonly` safety concern (preventing mutation of schema objects)
 * is a compile-time convenience; the `keyof S` preservation is a
 * correctness requirement for `DataOf<S>`, `PageContent<Mode, S>`, and
 * every mapped type that fans out over schema keys.
 */
export type SectionSchema = Record<string, FieldDescriptor>

// ---------------------------------------------------------------------------
// Provisional value-side shapes
// ---------------------------------------------------------------------------
//
// The field DESCRIPTORS (TextField, ImageField, ...) describe the schema
// language at compile time. These interfaces describe the RUNTIME VALUES
// carried by those fields. They are intentionally minimal — richer shapes
// (e.g. typed reference targets) can be layered on additively.
//
// Text / richText are strings. `reference` is a `{ slug }` object.
// `image` is an `ImageValue` (`{ filename, alt }`) — see domain/fields.ts.

/**
 * The runtime value of a `ReferenceField`: a pointer to another page by
 * slug. In v1 references are always page-to-page; richer target kinds
 * (collections, entries, etc.) are out of scope (ARCHITECTURE.md section 12).
 */
export interface ReferenceValue {
  readonly slug: string
}

// ---------------------------------------------------------------------------
// FieldValueFor — descriptor-to-value mapping
// ---------------------------------------------------------------------------

/**
 * Maps a built-in `FieldDescriptor` to the type of its runtime value.
 *
 * This is the authoritative mapping used by both the runtime's
 * `PageContent<Mode, S>` and the section-definition layer's own
 * type machinery.
 *
 * Built-in field -> runtime type:
 *   text       -> string
 *   richText   -> string         (markdown source)
 *   image      -> ImageValue     (`{ filename, alt }`, see domain/fields.ts)
 *   video      -> VideoValue     (`{ url, aspectRatio? }`, see domain/fields.ts)
 *   reference  -> ReferenceValue
 *   link       -> LinkValue      (discriminated union; see `domain/fields.ts`)
 *   button     -> ButtonValue    (`{ label, variant, link? }`, see domain/fields.ts)
 *   number     -> number
 *   boolean    -> boolean
 *   select     -> string         (one of the descriptor's option values)
 *   list       -> Array<ListItem<S>>  (each item: derived data shape of S
 *                                      plus opaque `_id`)
 *
 * The `list` case recurses through the schema. The recursion has to live
 * on this side of the descriptor/value seam because `ListField<S>`'s
 * value depends on `FieldValueFor` applied to every member of `S`.
 */
export type FieldValueFor<F extends FieldDescriptor> = F extends TextField
  ? string
  : F extends RichTextField
    ? string
    : F extends ImageField
      ? ImageValue
      : F extends VideoField
        ? VideoValue
        : F extends ReferenceField
          ? ReferenceValue
          : F extends LinkField
            ? LinkValue
            : F extends ButtonField
              ? ButtonValue
              : F extends NumberField
                ? number
                : F extends BooleanField
                  ? boolean
                  : F extends SelectField
                    ? string
                    : F extends ListField<infer S>
                      ? ReadonlyArray<ListItem<S>>
                      : never

/**
 * The runtime shape of a single item in a `ListField<S>` value.
 *
 * Each item is the derived per-field record of `S` (every field name
 * resolved through `FieldValueFor`) plus an opaque stable `_id` string.
 * The `_id` is set once when the item is created in the editor and
 * persists for the item's lifetime — this is how the editor tracks
 * items across reorder and delete without using index positions.
 *
 * `_id` is exposed in the runtime value type because section components
 * may need it (e.g. to use as a React key when rendering the array).
 * The underscore prefix signals "framework-managed; don't put authoring
 * data here".
 */
export type ListItem<S extends SectionSchema> = {
  readonly [K in keyof S]: FieldValueFor<S[K]>
} & { readonly _id: string }
