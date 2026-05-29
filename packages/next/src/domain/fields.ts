// Field-type descriptors used to describe the schema of a section's data.
//
// These are the COMPILE-TIME "schema language" that a section author uses to
// declare what shape its `data` payload has. They are NOT the runtime field
// values themselves — a `TextField` descriptor describes "this field is a
// piece of text"; the actual string lives inside a section's `data`.
//
// Naming: every public descriptor (and factory) carries the `Field` suffix
// (`TextField`, `ImageField`, `ListField`, …). The TYPE/INTERFACE and the
// VALUE share the identifier — TypeScript permits a type and a value to live
// in the same namespace, and the symmetry is the point. It also avoids
// shadowing JS globals (`Number`, `Boolean`) and the deprecated DOM `Image`
// constructor — `import { Number } from '@agntcms/next'` followed by
// `Number.isFinite(x)` in the same module would silently call the
// descriptor object instead of the global. The `Field` suffix removes that
// footgun.
//
// The set is intentionally CLOSED in v1. ARCHITECTURE.md §4 says field types
// are built in and not user-extensible — there is no plugin system for field
// types. Adding a new field type means adding a new descriptor here AND
// updating every switch that narrows over `FieldDescriptor`. The exhaustive
// switch in fields.test.ts exists specifically to turn that into a compile
// error instead of a silent gap.
//
// Each descriptor carries a `readonly kind` brand. The brand is present so
// that downstream code (section registry in T-003, runtime in T-008, editable
// React components in T-016) can both:
//   - narrow at the type level via the discriminated union, and
//   - perform a runtime identity check when needed (e.g. dispatching to the
//     right editable widget in the UI).
// Any other properties stay minimal — configuration knobs belong to a later
// iteration, not v0.1.

import type { FieldValueFor, SectionSchema } from './schema'

/** Plain inline text (single-line or small multi-line without formatting). */
export interface TextField {
  readonly kind: 'text'
  /** Override the built-in placeholder used when inserting a new section. */
  readonly default?: string
}

/** Rich text with inline formatting (bold, links, etc.); serialized as markdown. */
export interface RichTextField {
  readonly kind: 'richText'
  /** Override the built-in placeholder used when inserting a new section. */
  readonly default?: string
}

/**
 * An image stored through the asset adapter.
 *
 * The runtime value is an `ImageValue` object (`{ filename, alt }`). Alt
 * is collected per-usage in the image picker modal and lives in the
 * section's `data` alongside the filename — it is NOT stored on disk as
 * asset metadata (the 0.1.16–0.1.17 sidecar experiment was reverted).
 * Keeping alt required at the descriptor level preserves a11y as a hard
 * floor at authoring time.
 */
export interface ImageField {
  readonly kind: 'image'
  /** Override the built-in placeholder used when inserting a new section. */
  readonly default?: ImageValue
}

/**
 * Runtime value of an image field. Both fields required; empty alt is a
 * validation error. Alt is collected per-usage in the picker modal — it
 * is not stored on disk as metadata, because that experiment (v0.1.16–17)
 * was reverted as over-engineering. Keep alt required to preserve a11y
 * as a hard floor.
 */
export interface ImageValue {
  readonly filename: string
  readonly alt: string
}

/**
 * An embedded video referenced by URL.
 *
 * The runtime value is a `VideoValue` object (`{ url, aspectRatio?, caption? }`).
 * Unlike `ImageField`, videos are NOT stored as assets on disk — `url` is a
 * full URL pointing at YouTube / Vimeo / Wistia / Loom (the v1 set of
 * recognised providers). Detection of the embed URL is done by the
 * pure helper `parseVideoUrl()` (`domain/video.ts`); when that helper
 * returns no embed URL, the editor renders a "no video — click to add"
 * placeholder.
 *
 * `aspectRatio` is OPTIONAL on purpose: omitting it means "auto", which
 * the editor and the rendered iframe both interpret as 16:9. Encoding
 * "auto" as the absence of the key (rather than the literal string
 * `'auto'`) keeps `VideoValue` minimal and matches how
 * `exactOptionalPropertyTypes` distinguishes "not set" from "explicitly
 * undefined".
 *
 * `caption` is an optional short plain-text caption rendered below the
 * iframe. It is intentionally PLAIN TEXT (not markdown) — captions are
 * short ("A 2-minute walkthrough") and don't need rich-text features.
 * It travels with the video data so the picker modal can edit URL,
 * ratio, and caption in one place.
 */
export interface VideoField {
  readonly kind: 'video'
  /** Override the built-in placeholder used when inserting a new section. */
  readonly default?: VideoValue
}

/**
 * Runtime value of a video field. `url` is the raw URL the author
 * pasted. `aspectRatio` is optional; when absent the rendered iframe
 * defaults to 16:9. The closed string-literal union mirrors the
 * options the picker modal exposes — adding a ratio means updating the
 * union AND the picker's `<select>`. `caption` is an optional short
 * plain-text caption rendered below the iframe; intentionally NOT
 * markdown (see `VideoField` JSDoc).
 */
export interface VideoValue {
  readonly url: string
  readonly aspectRatio?: '16:9' | '4:3' | '1:1' | '9:16'
  readonly caption?: string
}

/** A reference to another page or content entry by id. */
export interface ReferenceField {
  readonly kind: 'reference'
  /** Override the built-in placeholder used when inserting a new section. */
  readonly default?: string
}

/**
 * A link with display label, modelled as an explicit choice between an
 * internal page reference, an external URL, an email address, or a
 * phone number.
 *
 * Runtime value is a `LinkValue` discriminated union — see below.
 * The descriptor itself does NOT render an anchor; section components
 * decide how to render. The typical pattern is to compute the href via
 * `hrefOf(link)` and the target/rel pair via `linkAnchorAttrs(link)`
 * (see `domain/link.ts`).
 *
 * Why an explicit `type` discriminator rather than the previous
 * "external?: boolean" flag: each branch carries fundamentally
 * different data (a slug reference, a URL, an email address, a phone
 * number) and the editor renders a different sub-form for each. Having
 * a tagged value-side per branch lets each carry exactly the data it
 * needs without a dual-purpose `href` string that means different
 * things in different modes.
 */
export interface LinkField {
  readonly kind: 'link'
  /** Override the built-in placeholder used when inserting a new section. */
  readonly default?: LinkValue
}

/**
 * Runtime value of a `LinkField`. Discriminated by `type`:
 *
 *   - `internal` carries a `slug` (no leading `/`). Empty string is
 *     "not yet selected"; `'home'` is the canonical root page; any
 *     other slug renders as `/<slug>` via `hrefOf()`.
 *   - `external` carries a full `url` (must start with `http://` or
 *     `https://`). Empty string is "not yet entered".
 *   - `email` carries an `email` address. `hrefOf()` returns
 *     `mailto:<email>` when populated, or `''` when empty so the
 *     section component can avoid rendering a stray anchor.
 *   - `phone` carries a `phone` string for display (the formatted form
 *     authors typed). `hrefOf()` strips non-`[\d+]` characters when
 *     producing the `tel:` URI, so `phone` may carry parens, spaces,
 *     and hyphens for legibility.
 *
 * `label` is always required (empty string allowed). It is the display
 * text the section component renders.
 */
export type LinkValue =
  | {
      readonly type: 'internal'
      readonly slug: string
      readonly label: string
    }
  | {
      readonly type: 'external'
      readonly url: string
      readonly label: string
    }
  | {
      readonly type: 'email'
      readonly email: string
      readonly label: string
    }
  | {
      readonly type: 'phone'
      readonly phone: string
      readonly label: string
    }

/**
 * A styled call-to-action button.
 *
 * Runtime value is a `ButtonValue` ({ label, variant, link? }). The
 * descriptor itself does NOT render styles — variant strings are opaque
 * presentation keys (`'primary'` / `'secondary'` / `'ghost'` / whatever
 * the section declares); section components own their CSS and pick a
 * className from `value.variant` at render time. The framework does
 * NOT enforce a global variant set; each `ButtonField` declaration
 * carries the closed list of variants its section supports.
 *
 * `link` is optional on purpose. A button without a link is a pure UI
 * affordance (e.g. "Open dialog", a future click handler) — separating
 * the styled-CTA concern from the navigation concern keeps `LinkField`
 * pure navigation data and lets sections use `ButtonValue` for both
 * link-CTAs and non-navigating action buttons.
 *
 * Why a separate descriptor instead of `LinkField` + a sibling
 * `SelectField` for the variant: in the editor, label + variant + link
 * belong together. Surfacing them as two unrelated fields forced
 * authors to edit the visible text in one modal and the visual style in
 * another. `ButtonField` collapses that into a single picker modal.
 */
export interface ButtonField {
  readonly kind: 'button'
  /**
   * The closed list of variants this button supports. The picker modal
   * renders a `<select>` populated from these options; section authors
   * decide what styles their CSS supports. Order is preserved — index 0
   * is the canonical fallback when content has no variant set.
   */
  readonly variants: ReadonlyArray<SelectOption>
  /** Override the built-in placeholder used when inserting a new section. */
  readonly default?: ButtonValue
}

/**
 * Runtime value of a `ButtonField`.
 *
 *   - `label`   — visible button text. Required, may be empty (the
 *                 picker shows a "Click to add label" hint then).
 *   - `variant` — a presentation key matching one of the descriptor's
 *                 declared `variants[].value`. Section components map
 *                 this to a className. Stored verbatim so a variant
 *                 removed from the schema after content was authored
 *                 does not silently rewrite the saved value — the
 *                 picker surfaces the stale variant as "(missing)" so
 *                 the editor can fix it.
 *   - `link`    — OPTIONAL. When present, a discriminated `LinkValue`
 *                 (the same union used by `LinkField`). Sections decide
 *                 whether to wrap the rendered button in an `<a>` based
 *                 on `link !== undefined`.
 */
export interface ButtonValue {
  readonly label: string
  readonly variant: string
  readonly link?: LinkValue
}

/**
 * A numeric value with optional validation hints.
 *
 * `min`/`max`/`step` are HINTS for the editor widget, not enforced at the
 * descriptor level. The runtime never validates — the editor's number
 * input clamps and steps to keep authoring sensible. Storage carries
 * whatever the author committed, including out-of-range values from
 * older content if the descriptor's bounds tighten over time.
 */
export interface NumberField {
  readonly kind: 'number'
  readonly default?: number
  readonly min?: number
  readonly max?: number
  readonly step?: number
}

/** A boolean toggle. */
export interface BooleanField {
  readonly kind: 'boolean'
  readonly default?: boolean
}

/** A single option in a `SelectField`. */
export interface SelectOption {
  readonly value: string
  readonly label: string
}

/**
 * A choice from a fixed list of options.
 *
 * Runtime value is `string` (one of the option `value`s). We deliberately
 * do NOT type the value as a literal union derived from `options` in v1
 * — that would require `as const` discipline at every author's call
 * site, which is a footgun for the typical author. A generic-tied
 * literal-union variant can be added later without breaking the v1
 * shape.
 */
export interface SelectField {
  readonly kind: 'select'
  readonly options: readonly SelectOption[]
  readonly default?: string
}

/**
 * A list of structured items, each shaped by a sub-schema.
 *
 * Runtime value is `Array<ListItem<S>>` where `ListItem<S>` is the
 * derived data shape of `itemSchema` plus an opaque stable `_id` string.
 * The `_id` is generated when an item is first inserted (via the
 * editable widget) and persists for the item's lifetime so the editor
 * can track items across reorder/delete without index churn.
 *
 * `itemSchema` is `SectionSchema` — the same vocabulary as a top-level
 * section's data. This means lists of objects with text/richText/image/
 * link/number/boolean/select fields, and even nested lists. Recursion
 * is allowed but not optimised; deeply nested lists will work but the
 * editor UX is intentionally flat (one level of cards).
 *
 * `min`/`max` are HINTS for the editor widget, not enforced at runtime.
 *
 * `default` (optional) is an array of seed items used when the editor
 * builds a blank instance of a parent item that contains this list — the
 * canonical case is "a new tier comes pre-filled with two feature rows".
 * Each entry is a `Partial` over the item shape so authors can omit fields
 * they don't care about (those fall back to per-kind blanks). `_id` is
 * deliberately NOT part of the default-item shape: the editor mints a
 * fresh `_id` for every cloned entry, recursively, so two consecutive
 * blank-builds never share ids. See `buildBlankItem` in
 * `react/editable/ItemFormEditor.tsx` for the regeneration rule.
 */
export interface ListField<S extends SectionSchema = SectionSchema> {
  readonly kind: 'list'
  readonly itemSchema: S
  readonly min?: number
  readonly max?: number
  readonly default?: ReadonlyArray<ListItemDefault<S>>
}

/**
 * The shape of a single seed item declared on `ListField.default`. Authors
 * may omit any field — missing fields fall back to per-kind blanks at
 * build time. `_id` is intentionally excluded: the editor regenerates ids
 * recursively when cloning the default, so a literal id in the schema
 * would be overwritten anyway.
 */
export type ListItemDefault<S extends SectionSchema> = {
  readonly [K in keyof S]?: FieldValueFor<S[K]>
}

/**
 * The closed union of all built-in field descriptors.
 *
 * This is the v1 vocabulary for describing a section's schema. It is closed
 * on purpose: consistency of the editing UI depends on the runtime knowing
 * every possible field type ahead of time.
 */
export type FieldDescriptor =
  | TextField
  | RichTextField
  | ImageField
  | VideoField
  | ReferenceField
  | LinkField
  | ButtonField
  | NumberField
  | BooleanField
  | SelectField
  | ListField

/** String literal union of every descriptor's `kind` — useful for maps and tables. */
export type FieldKind = FieldDescriptor['kind']

// Singleton descriptor values. Authors import these from the package root
// (via the barrel) when declaring a section schema, e.g.
//   schema: { title: TextField, hero: ImageField }
// The runtime identity is stable and cheap to compare.
//
// Each `const` shares its identifier with the corresponding interface above.
// TypeScript keeps types and values in separate namespaces, so this works
// without ambiguity. See the file header for the rationale behind the
// `Field` suffix.
export const TextField: TextField = { kind: 'text' }
export const RichTextField: RichTextField = { kind: 'richText' }
export const ImageField: ImageField = { kind: 'image' }
export const VideoField: VideoField = { kind: 'video' }
export const ReferenceField: ReferenceField = { kind: 'reference' }
export const LinkField: LinkField = { kind: 'link' }
export const NumberField: NumberField = { kind: 'number' }
export const BooleanField: BooleanField = { kind: 'boolean' }

// `SelectField` and `ListField` need configuration so they are factory
// functions, not singletons. They preserve the input types so downstream
// `FieldValueFor` can recover the precise shape (literal options for Select
// in a future generic variant; the precise itemSchema for List today).

/**
 * Factory for a `SelectField`. The `options` array shape is preserved on
 * the descriptor for the editor widget to render; the runtime value is a
 * plain `string` in v1 (see `SelectField` for why we did not derive a
 * literal union from `options`).
 */
export const SelectField = (
  options: readonly SelectOption[],
  opts?: { readonly default?: string },
): SelectField => ({
  kind: 'select',
  options,
  ...(opts?.default !== undefined ? { default: opts.default } : {}),
})

/**
 * Factory for a `ButtonField`. The `variants` array shape is preserved
 * verbatim so the picker modal can render the variant `<select>` from
 * the descriptor; the runtime value (`ButtonValue.variant`) is a plain
 * string in v1 (same rationale as `SelectField` — see that JSDoc).
 *
 * If `default.variant` does not match any declared `variants[].value`,
 * the picker still surfaces the stored value as "(missing)" so authors
 * can fix it. We do not validate at factory time: schema-author errors
 * surface at editing time, not at module-load time.
 */
export const ButtonField = (
  variants: ReadonlyArray<SelectOption>,
  opts?: { readonly default?: ButtonValue },
): ButtonField => ({
  kind: 'button',
  variants,
  ...(opts?.default !== undefined ? { default: opts.default } : {}),
})

/**
 * Factory for a `ListField`. Generic over the item schema so the runtime
 * value type (`FieldValueFor<ListField<S>>`) can include the precise
 * shape of each list item. See `domain/schema.ts` for the recursion.
 */
export const ListField = <S extends SectionSchema>(
  itemSchema: S,
  opts?: {
    readonly min?: number
    readonly max?: number
    readonly default?: ReadonlyArray<ListItemDefault<S>>
  },
): ListField<S> => ({
  kind: 'list',
  itemSchema,
  ...(opts?.min !== undefined ? { min: opts.min } : {}),
  ...(opts?.max !== undefined ? { max: opts.max } : {}),
  ...(opts?.default !== undefined ? { default: opts.default } : {}),
})
