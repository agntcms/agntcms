// `defineSection` — the type-safe factory that binds a section's schema (a
// record of built-in field descriptors from `domain/fields`) to the React
// component that renders that section.
//
// WHY THIS LIVES IN `sections/`, NOT IN `react/`
// ----------------------------------------------
// `defineSection` is declaration metadata, not runtime React code. It stores
// the binding between a schema and a component reference; it never imports
// React, never renders, never touches the DOM. That is deliberate:
//
//   1. `sections/` depends ONLY on `domain/` (see ARCHITECTURE.md §8). If this
//      file imported React or anything from `react/`, `sections/` would pull
//      a client dependency into a module that feeds `config/` and the runtime
//      registry — exactly the kind of leak invariant 2 forbids.
//
//   2. The component is stored as a bare reference, not a thunk/dynamic
//      import. A thunk would not prevent any imports — the user's
//      `agntcms/sections/Hero/index.ts` already `import`s the concrete
//      component at module load in order to pass it here, so wrapping it in
//      `() => Component` would add indirection without moving the load.
//      Bare reference wins on simplicity (KISS) and keeps typing direct.
//
// WHAT THE TYPE PARAMETER `C` IS FOR
// ----------------------------------
// The whole point of this factory is to turn a schema/component mismatch into
// a COMPILE error, not a runtime surprise. The constraint
//   C extends SectionComponent<S>
// where `SectionComponent<S>` is a function type `(props: DataOf<S>) => unknown`,
// does exactly that: if the user writes
//
//     defineSection({
//       name: 'Hero',
//       schema: { title: TextField, image: ImageField },
//       component: (props: { title: string; heading: string }) => ...,
//     })
//
// TypeScript refuses to assign the component to `SectionComponent<typeof schema>`
// because `heading` is not in the derived props, and the user gets a clear
// error at the call site.
//
// We use `unknown` as the component's return type on purpose: `sections/` is
// a React-free zone, so we cannot name `JSX.Element` or `ReactNode` here.
// `unknown` is loose enough to accept any JSX, and the downstream `react/`
// module (T-016 `SectionRenderer`) is where the stricter React typing lives.
//
// WHAT `defineSection` DOES NOT DO
// --------------------------------
// It does not interpret field data, it does not validate a payload against
// the schema, and it does not run the component. ARCHITECTURE.md §4 is
// explicit that typing and rendering logic live at the section level —
// `defineSection` only RECORDS the binding so the runtime registry (built by
// `defineConfig` in T-019) can look it up by name.

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
} from '../domain/fields'
import type { FieldValueFor, ListItem, ReferenceValue, SectionSchema } from '../domain/schema'

// ---------------------------------------------------------------------------
// EditableSlot — opaque, type-level brand for inline-editable fields
// ---------------------------------------------------------------------------
//
// `EditableSlot<K, V>` is the runtime-shape that section component props
// carry for every inline-editable field. The whole point of the slot is to
// be NON-ASSIGNABLE TO `React.ReactNode` — so a section author who writes
//
//   <h1>{title}</h1>
//
// instead of `<EditableText field={title} />` gets a TS error at the
// `{title}` site rather than a silently-broken-in-the-editor page. See
// EDITABILITY_DESIGN.md for the design rationale.
//
// The brand is a phantom unique-symbol property: it has no runtime
// representation (the runtime objects don't carry the symbol) but TypeScript
// uses it to make the type structurally distinct from any plain object the
// author could accidentally render. A plain `{ value: 'hello' }` is NOT
// assignable to `EditableSlot<'text', string>`, and `EditableSlot<'text',
// string>` is NOT assignable to `ReactNode` (which would otherwise accept
// the wrapper because string is a valid React child).
//
// `value` is `V | PreviewFieldLike<V>` because in preview mode the runtime
// wraps the bare value with origin metadata (see `runtime/getContent.ts`),
// while in published mode it stays bare. The `read()` helper in
// `react/editable/read.ts` collapses both arms back to a `V`.

declare const __slot: unique symbol

/**
 * Opaque editable slot. The runtime hands `<EditableText>` /
 * `<EditableImage>` / etc. exactly this shape; the brand `[__slot]: K` is
 * phantom (never set at runtime) and exists only to stop the slot from
 * being assigned to `React.ReactNode` at JSX render sites. The slot kind
 * `K` lets the matching editable component refuse a mismatched widget at
 * compile time (`<EditableText field={imageSlot}>` is a TS error).
 *
 * The `value` is `V | PreviewFieldLike<V>` because the runtime wraps with
 * `PreviewField` only in preview mode; published mode hands the bare
 * value. The `read()` helper unwraps both branches.
 */
export interface EditableSlot<K extends string, V> {
  readonly [__slot]: K
  readonly value: V | PreviewFieldLike<V>
}

/**
 * Local structural replica of `PreviewFieldLike<T>` from
 * `react/editable/isPreviewField.ts`. Duplicated here (not imported) for
 * the same reason that file exists: keeping `sections/` free of any
 * dependency on `react/`. Both shapes must stay structurally identical —
 * if one moves, both move.
 */
interface PreviewFieldLike<T> {
  readonly __agntcmsPreview: true
  readonly value: T
  readonly origin: PreviewFieldOriginLike
}

interface PreviewFieldOriginLike {
  readonly pageSlug: string
  readonly sectionId: string
  readonly fieldPath: string
  readonly source: 'draft' | 'published'
  readonly revision: string
  readonly kind?: 'page' | 'global'
  readonly globalName?: string
}

/**
 * Recursive item shape for `ListField`. Every field on a list item becomes
 * its own slot, so a section author who writes `{item.text}` raw inside
 * `<EditableList renderItem={…}>` gets the SAME compile error as a raw
 * `{title}` at the section level. This closes the structural blind spot
 * a heuristic gate could not (see EDITABILITY_DESIGN.md, decision #2).
 *
 * `_id` is preserved as a bare string — section components routinely use
 * it as a React key, and there is no inline-editing surface for it.
 */
export type SlotItem<S extends SectionSchema> =
  & { readonly _id: string }
  & { readonly [K in keyof S]: FieldDataType<S[K]> }

// Re-export so existing consumers of `SectionSchema` from `sections/` keep
// working. The canonical definition now lives in `domain/schema.ts`.
export type { SectionSchema } from '../domain/schema'

/**
 * Maps a single `FieldDescriptor` to the type a section component receives
 * on its `props` for that field.
 *
 * Built-in field → component-prop type:
 *   text          → EditableSlot<'text', string>
 *   richText      → EditableSlot<'richText', string>
 *   image         → EditableSlot<'image', ImageValue>
 *   video         → EditableSlot<'video', VideoValue>
 *   link          → EditableSlot<'link', LinkValue>
 *   button        → EditableSlot<'button', ButtonValue>
 *   number        → EditableSlot<'number', number>
 *   boolean       → EditableSlot<'boolean', boolean>
 *   select        → EditableSlot<'select', string>
 *   list          → EditableSlot<'list', ReadonlyArray<SlotItem<S>>>
 *   reference     → ReferenceValue          (raw — see decision #3)
 *
 * EDITABILITY_DESIGN.md gates this design. The slot wrapping is the
 * load-bearing change: a slot is not assignable to `React.ReactNode`, so
 * `<h1>{title}</h1>` produces a TS error and forces the author into
 * `<EditableText field={title}>`. `ListField` items recurse via
 * `SlotItem<S>`, so raw rendering inside `renderItem` is also a TS error.
 *
 * `ReferenceField` stays raw because references are not inline-editable
 * in v1 (decision #3): a slot would force a no-op `<EditableReference>`
 * wrapper without UX value.
 *
 * `FieldDataType` and `FieldValueFor` (`domain/schema.ts`) NO LONGER
 * agree element-by-element: `FieldValueFor` is the bare runtime payload
 * shape (what storage carries, what `getContent` returns), and stays as
 * it is; `FieldDataType` is the section-author-facing mapping that
 * drives `DataOf<S>` and now wraps editable kinds in slots. The runtime
 * wrapping happens at the SectionRenderer boundary (sub-task 2 wires
 * `wrapAsSlot`) and is INTENTIONALLY NOT mirrored in `getContent` — see
 * the comment in `runtime/getContent.ts` for why.
 *
 * The mapping is expressed per-descriptor so a future field type is one
 * line of change instead of a redesign. That is not the same as
 * "user-extensible field types" — invariant 5 (CLAUDE.md) forbids a
 * plugin system; this is just the internal seam.
 */
export type FieldDataType<F extends FieldDescriptor> =
  F extends TextField ? EditableSlot<'text', string>
    : F extends RichTextField ? EditableSlot<'richText', string>
      : F extends ImageField ? EditableSlot<'image', ImageValue>
        : F extends VideoField ? EditableSlot<'video', VideoValue>
          : F extends ReferenceField ? ReferenceValue
            : F extends LinkField ? EditableSlot<'link', LinkValue>
              : F extends ButtonField ? EditableSlot<'button', ButtonValue>
                : F extends NumberField ? EditableSlot<'number', number>
                  : F extends BooleanField ? EditableSlot<'boolean', boolean>
                    : F extends SelectField ? EditableSlot<'select', string>
                      : F extends ListField<infer S>
                        ? EditableSlot<'list', ReadonlyArray<SlotItem<S>>>
                        : never

/**
 * Derives the SECTION-COMPONENT prop shape from its schema.
 *
 * Per `FieldDataType`, every editable field becomes an `EditableSlot<K,V>`
 * (so `<h1>{title}</h1>` is a TS error); `ReferenceValue` stays raw.
 * Example:
 *
 *   type HeroSchema = { title: TextField; image: ImageField; ref: ReferenceField }
 *   DataOf<HeroSchema> ≡ {
 *     readonly title: EditableSlot<'text', string>
 *     readonly image: EditableSlot<'image', ImageValue>
 *     readonly ref:   ReferenceValue
 *   }
 *
 * NOTE: this is the COMPONENT-SIDE shape. The bare runtime payload (what
 * `getContent` returns and what storage carries) is described by
 * `FieldValueFor<F>` in `domain/schema.ts` — that mapping has not changed
 * and must not change (see the slot-non-wrapping comment in
 * `runtime/getContent.ts`).
 */
export type DataOf<S extends SectionSchema> = {
  readonly [K in keyof S]: FieldDataType<S[K]>
}

/**
 * The contract a section's React component must satisfy: a function taking
 * exactly the derived props for its schema. The return type is intentionally
 * `unknown` — `sections/` may not name React types (see file header). The
 * downstream `react/` module is where the stricter `ReactElement` typing
 * lives; here we only care that the props line up with the schema.
 */
export type SectionComponent<S extends SectionSchema> = (
  props: DataOf<S>,
) => unknown

/**
 * Registration record produced by `defineSection`. Consumers (the registry
 * built by `defineConfig` in T-019, `SectionRenderer` in T-016) look up
 * definitions by `name` and use `component` to render.
 *
 * Both generic parameters are required (no defaults). A heterogeneous
 * registry — the list the runtime actually stores — is typed as
 * `readonly AnySectionDefinition[]`, NOT `readonly SectionDefinition[]`.
 *
 * Why this split exists
 * ---------------------
 * `SectionComponent<S>` is a function whose parameter is contravariant. If
 * we widened `SectionDefinition` to its default parameters and asked a
 * concrete `SectionDefinition<{title: TextField}, (p: {title: string}) => unknown>`
 * to be assignable to it, the function-parameter contravariance would
 * refuse: the "widened" parameter type `DataOf<SectionSchema>` is stricter
 * (more required keys, from TypeScript's perspective) than any concrete
 * `DataOf<S>`. The erasure-safe form lives in `AnySectionDefinition`, which
 * stores the component with `unknown` props. Every precise definition is
 * assignable to `AnySectionDefinition`.
 */
export interface SectionDefinition<
  S extends SectionSchema,
  C extends SectionComponent<S>,
> {
  /** Stable type discriminator used to tag `Section.type` and in lookups. */
  readonly name: string
  /** Optional grouping label for the section picker modal. */
  readonly category?: string
  /** Field-descriptor schema. */
  readonly schema: S
  /** React component reference. See file header on why not a thunk. */
  readonly component: C
  /** Pre-computed placeholder values for each field. Computed from field
   *  descriptors' `default` property (when present) or from the built-in
   *  per-kind fallback.
   *
   *  This is the FALLBACK layer of the insertion seed, not the whole seed.
   *  The canonical insertion seed (built by `deriveHandlerDeps` in
   *  `config/derive.ts`) is the authored `previewData` layered shallow over
   *  these computed `defaults`. A field the author covers in `previewData`
   *  uses that representative value at insertion; a field the author omits
   *  falls back to the placeholder here. See `previewData` below.
   *
   *  Typed as `Record<string, unknown>` so the registry type stays stable
   *  even if a future built-in field type introduces a non-string runtime
   *  value. In v1 every value here is a `string`. The registry itself
   *  never interprets these — consumers that read a specific field narrow
   *  at the call site. */
  readonly defaults: Record<string, unknown>
  /**
   * Marks a section as framework-managed configuration rather than user
   * content. Set to `true` for built-in or framework-owned sections whose
   * globals must NOT appear in user-facing pickers and must NOT be
   * deletable through the admin UI (think site-wide SEO defaults, search
   * settings, analytics IDs).
   *
   * The flag is purely declarative — it does NOT change storage, history,
   * or how the runtime reads the data. It only changes how UIs render
   * globals whose `type` points at a system-flagged section:
   *   - SectionPickerModal omits them from the sections grid and from the
   *     "Globals" group.
   *   - AdminModal renders them in a separate "Settings" group and hides
   *     the delete affordance; Edit and History remain.
   *   - The global-handler's delete endpoint rejects deletions of globals
   *     whose type is system-flagged.
   *
   * Default: `false` (absent).
   */
  readonly system?: boolean
  /** The single authored representative sample for this section. Serves two
   *  roles, both from this one source:
   *    1. The section picker modal renders its preview card from it (layered
   *       shallow over `defaults`).
   *    2. It is the insertion seed: `deriveHandlerDeps` layers it shallow
   *       (per-field, `previewData` wins) over the computed `defaults`, so a
   *       newly inserted/replaced section carries this representative content
   *       instead of bare placeholders.
   *  The computed `defaults` remain only as the fallback for fields the
   *  author omitted here.
   *
   *  Typed as `Record<string, unknown>` (not `Partial<DataOf<S>>`) on the
   *  output side because the registry is heterogeneous: the precise
   *  per-section shape only exists at the `defineSection` call site
   *  (`DefineSectionInput`), and erases when stored as
   *  `AnySectionDefinition`. */
  readonly previewData?: Record<string, unknown>
}

/**
 * The erased/heterogeneous form used by the registry and by
 * `defineConfig({ sections: [...] })`. Precise definitions produced by
 * `defineSection` are assignable to this type because:
 *   - `schema` widens to `SectionSchema` (covariant read),
 *   - `component` widens to a function whose parameter type is `never`.
 *     Under parameter contravariance, any concrete `(props: X) => unknown`
 *     is assignable to `(props: never) => unknown` (for any `X`, `never` is
 *     a subtype of `X`). Return widens to `unknown`.
 *
 * Callers that only need `name` / `schema` metadata treat a list of
 * definitions as `readonly AnySectionDefinition[]`. Rendering code — which
 * does need to INVOKE the component — recovers strong typing at the call
 * site by looking up by name and casting to its section-specific
 * `SectionComponent<S>` before calling. The registry itself never invokes
 * components.
 */
export interface AnySectionDefinition {
  readonly name: string
  /** Optional grouping label for the section picker modal. */
  readonly category?: string
  readonly schema: SectionSchema
  readonly component: (props: never) => unknown
  /** Pre-computed placeholder values — see `SectionDefinition.defaults`. */
  readonly defaults: Record<string, unknown>
  /** Framework-managed flag — see `SectionDefinition.system`. */
  readonly system?: boolean
  /** Optional preview-card sample content — see `SectionDefinition.previewData`. */
  readonly previewData?: Record<string, unknown>
}

/**
 * Input shape for `defineSection`. Split out so the factory can use a single
 * generic parameter set for both input and output.
 */
export interface DefineSectionInput<
  S extends SectionSchema,
  C extends SectionComponent<S>,
> {
  readonly name: string
  /** Optional grouping label for the section picker modal. */
  readonly category?: string
  readonly schema: S
  readonly component: C
  /** Framework-managed flag — see `SectionDefinition.system`. Default `false`. */
  readonly system?: boolean
  /** Optional richer sample content — the single authored representative
   *  sample for this section. Merged SHALLOW over `defaults` (per-field;
   *  nested structures are atomic). Missing fields fall back to `defaults`.
   *
   *  This sample drives BOTH the section picker modal's preview cards AND
   *  the insertion seed: a newly inserted/replaced section is populated
   *  with `previewData` layered over the computed `defaults` (see
   *  `deriveHandlerDeps`). So this is real seed content, not just a picker
   *  cosmetic — use it to give inserted sections representative copy, a
   *  populated `ListField`, a filled-in `RichTextField`, etc.
   *
   *  Input shape is the BARE-VALUE form (`FieldValueFor<F>` per field),
   *  not the slot-wrapped `DataOf<S>`. Reasons:
   *    1. `EditableSlot<K, V>`'s brand is a module-private `unique
   *       symbol` — authors cannot construct slot literals, so the
   *       slot-wrapped form would be unusable as authoring input.
   *    2. `wrapSectionProps` lifts bare values into slots at render
   *       time anyway (see `SectionPickerModal`). Authoring in slot
   *       shape would invert that lift.
   *    3. This matches the storage/runtime shape of section data, so a
   *       sample payload pasted from a real page Just Works.
   *
   *  The stored form on the returned `SectionDefinition` widens to
   *  `Record<string, unknown>` for registry homogeneity — same pattern
   *  as `defaults`. */
  readonly previewData?: Partial<{ readonly [K in keyof S]: FieldValueFor<S[K]> }>
}

/**
 * Built-in default placeholder for a field based on its kind and name.
 * Used when the field descriptor does not carry an explicit `default`.
 *
 * Return type is `unknown` because each kind produces its own shape —
 * image yields an `ImageValue` object, the others yield strings. Keeping
 * the seam open avoids a typing break for the registry if a future
 * BUILT-IN descriptor introduces yet another shape.
 */
function builtInDefault(fieldName: string, descriptor: FieldDescriptor): unknown {
  switch (descriptor.kind) {
    case 'image':
      // `ImageValue` shape (`{ filename, alt }`). Alt is required in the
      // picker — providing a non-empty placeholder here keeps a newly
      // inserted section valid until the author opens the picker.
      return { filename: 'placeholder.png', alt: 'Placeholder image' }
    case 'video':
      // `VideoValue` shape. `aspectRatio` and `caption` are both
      // genuinely optional — the editor and the rendered iframe treat
      // absent ratio as 16:9, and an absent caption suppresses the
      // caption element entirely — so we omit those keys rather than
      // emit literal `undefined`s. Empty `url` triggers the "no video
      // — click to add" placeholder in `<EditableVideo>`, which is
      // the actionable zero-state.
      return { url: '' } satisfies VideoValue
    case 'richText':
      return 'Start writing here...'
    case 'text':
      return fieldName.charAt(0).toUpperCase() + fieldName.slice(1).replace(/([A-Z])/g, ' $1')
    case 'reference':
      // `ReferenceValue` shape (`{ slug }`). Empty slug is a valid placeholder
      // until the author wires up a real reference; it keeps `data.refField.slug`
      // access from crashing on a freshly inserted section.
      return { slug: '' }
    case 'link':
      // Default to an internal link with an empty slug and a sensible
      // visible label — the editor's page picker shows "Choose a
      // page…" for an empty slug, so the author is nudged to pick.
      return { type: 'internal', slug: '', label: 'Learn more' }
    case 'button': {
      // `ButtonValue` shape (`{ label, variant, link? }`). Pick the
      // first declared variant as the canonical fallback (mirrors how
      // `select` defaults to its first option). Empty `variants` is a
      // degenerate config — fall back to '' so a placeholder still
      // builds without crashing.
      const firstVariant = descriptor.variants[0]?.value ?? ''
      return { label: 'Get started', variant: firstVariant } satisfies ButtonValue
    }
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'select':
      // Default to the first declared option's `value`. If `options` is
      // empty (a degenerate config), fall back to ''.
      return descriptor.options[0]?.value ?? ''
    case 'list':
      // Empty array. The List editor lets the author add items
      // explicitly; we do not invent placeholder items here because the
      // item schema can include required fields with their own defaults
      // and recreating that recursion at module-load would be brittle.
      return []
    default: {
      // Closed field-type set — exhaustive guard. If a new descriptor is
      // added, TypeScript will fail to narrow `descriptor` to `never` and
      // the build breaks here.
      const _exhaustive: never = descriptor
      void _exhaustive
      return ''
    }
  }
}

/**
 * Type-safe factory for a `SectionDefinition`.
 *
 * The compile-time win is the constraint `C extends SectionComponent<S>`: if
 * the component's props do not match the derived `DataOf<S>`, TypeScript
 * rejects the call. The factory itself is purely about binding — it does no
 * validation at runtime, because in v1 there is nothing to validate (the
 * schema is plain descriptor metadata, not a parser).
 *
 * Object and schema are not deep-frozen: doing so would add a runtime cost on
 * every module load without preventing anything the type system does not
 * already prevent in strict mode. `as const` at the author's call site is
 * enough for literal inference.
 */
export function defineSection<
  S extends SectionSchema,
  C extends SectionComponent<S>,
>(input: DefineSectionInput<S, C>): SectionDefinition<S, C> {
  const defaults: Record<string, unknown> = {}
  for (const [key, descriptor] of Object.entries(input.schema)) {
    defaults[key] =
      (descriptor as { default?: unknown }).default ??
      builtInDefault(key, descriptor as FieldDescriptor)
  }
  // `system` is conditionally spread (not assigned literal `undefined`)
  // because `exactOptionalPropertyTypes` distinguishes "key absent" from
  // "key present with value undefined" — only the former satisfies
  // `system?: boolean`.
  return {
    name: input.name,
    ...(input.category !== undefined ? { category: input.category } : {}),
    schema: input.schema,
    component: input.component,
    defaults,
    ...(input.system !== undefined ? { system: input.system } : {}),
    // `previewData` is the authored representative sample. Pass through
    // as-is when supplied; both the picker (preview cards) and the
    // insertion seed built by `deriveHandlerDeps` layer it over `defaults`.
    // The conditional spread keeps the returned object key-clean under
    // `exactOptionalPropertyTypes` (no `previewData: undefined` leaks).
    ...(input.previewData !== undefined
      ? { previewData: input.previewData as Record<string, unknown> }
      : {}),
  }
}
