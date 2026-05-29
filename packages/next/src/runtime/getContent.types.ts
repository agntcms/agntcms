// `getContent` — TYPE DESIGN for the dual-mode content-reading API.
//
// This file is a PUBLIC CONTRACT artefact. It locks the shape of
// `@agntcms/next/server`'s `getContent` export. T-008 will ship the
// matching runtime implementation; the types here are authoritative.
//
// -------------------------------------------------------------------------
// Problem: the dual nature of getContent (ARCHITECTURE.md §6, §11)
// -------------------------------------------------------------------------
//
// `getContent` has two completely different return shapes depending on the
// caller's mode:
//
//   preview  — every field value is wrapped in `PreviewField<T>` carrying
//              ORIGIN METADATA. The `<EditableText />` / `<EditableImage />`
//              client components need to know *which* field in *which*
//              section on *which* page they are editing, and against *which*
//              source snapshot, so the save round-trip can write back to the
//              right draft file and (later) detect optimistic-concurrency
//              conflicts.
//
//   published — every field value is THE BARE DATA. No wrapper, no origin,
//               no brand, no runtime cost on the prod hot path. A page that
//               is read a million times per minute must not pay for editor
//               metadata it will never use.
//
// ARCHITECTURE.md §11 names this the single most delicate point of the
// public API. The hazard: if the two return shapes diverge into two
// different functions, user code doubles; if they merge behind a single
// function whose return type is widened to "either shape", user code loses
// type inference and every call site becomes a runtime discriminator. The
// design below keeps a SINGLE call site, generic over `Mode`, and uses a
// distributive conditional so the return type narrows as soon as `Mode`
// narrows.
//
// -------------------------------------------------------------------------
// Chosen representation: branded `PreviewField<T>` wrapper
// -------------------------------------------------------------------------
//
// `PreviewField<T>` is a small, branded object wrapping the bare value
// alongside its origin metadata. Alternatives considered:
//
//   A. Parallel types (`PageContentPreview<S>` vs `PageContentPublished<S>`
//      as unrelated shapes). Rejected: forces user code to pick one at
//      every call site and defeats the "single generic entry point"
//      requirement.
//
//   B. A runtime `Proxy`-based wrapper that LOOKS like the bare value but
//      secretly carries metadata. Rejected: invisible magic, terrible
//      debuggability, breaks `JSON.stringify`, and still needs a type
//      discriminator for the editable components to detect it.
//
//   C. Branded wrapper object (CHOSEN). Explicit, debuggable, serializable
//      if needed, trivial for `EditableText` / `EditableImage` to
//      pattern-match on, and carries zero cost in prod because
//      `FieldIn<'published', T>` resolves structurally to `T`.
//
// The `__agntcmsPreview: true` brand is not just cosmetic: T-016 will ship
// a client-side `unwrapPreview(field)` helper that needs to tell "this is a
// preview-mode field wrapper" from "this is a bare string / asset" at
// RUNTIME, not just at compile time. A nominal brand makes that a cheap
// property check.
//
// `revision` is a content-addressable hash of the source page snapshot
// (SHA-256 over the serialized page bytes, hex-encoded — T-008's call).
// Alternatives considered:
//
//   - A wall-clock timestamp: rejected because two drafts saved in the
//     same millisecond are indistinguishable and clock skew breaks
//     ordering across processes.
//   - A monotonically allocated revision number: rejected because the
//     FS adapter has no place to persist a monotonic counter without
//     inventing a separate store. Content hashing is stateless.
//   - A branch/version label: rejected because v1 has no branches
//     (ARCHITECTURE.md §4).
//
// Hashing is adapter-agnostic (any adapter can hash its own bytes) and
// detects actual content drift, which is the only property the save
// round-trip cares about.
//
// -------------------------------------------------------------------------
// Distribution and inference
// -------------------------------------------------------------------------
//
// `FieldIn<Mode, T>` is written as a distributive conditional over a naked
// `Mode` type parameter. When a caller writes
//
//   function read<M extends PreviewMode>(mode: M) {
//     return getContent({ slug: 'home', mode })
//   }
//
// TypeScript instantiates `Mode = M` (naked), and `FieldIn<M, T>`
// distributes to `FieldIn<'preview', T> | FieldIn<'published', T>`, which
// collapses to `PreviewField<T> | T`. Inside a branch where `M` narrows to
// `'preview'`, control-flow narrowing re-evaluates the return type to just
// `PreviewField<T>`. The type-level tests below prove this on a fixture
// schema.
//
// -------------------------------------------------------------------------
// Scope cut — what T-007 deliberately does NOT ship
// -------------------------------------------------------------------------
//
// This file defines:
//   - `PreviewMode`, `PreviewFieldOrigin`, `PreviewField<T>`
//   - `FieldIn<Mode, T>`, `PageContent<Mode, S>`
//   - `GetContentOptions<Mode>` and the `GetContent` function type
//
// This file re-exports from domain (canonical definitions):
//   - `SectionSchema`, `FieldValueFor<F>`, `ReferenceValue` (domain/schema.ts)
//
// This file deliberately does NOT:
//   - Declare a runtime `const` or `function`. The only runtime-adjacent
//     declaration is a `declare function getContent(...)` to lock the
//     public export name and signature; it emits zero JS.
//   - Model the full `Page` return shape (slug + seo + array of typed
//     sections). T-003 owns the section registry and is the place where
//     a page's `sections: Section<T, D>[]` becomes "mode-aware" across
//     heterogeneous section types. T-008 will compose `PageContent<Mode, S>`
//     under the per-section shape T-003 produces. The PER-FIELD dual-mode
//     mechanism is what this file locks.
//   - Ship a client-side `unwrapPreview` adapter. That belongs to T-016
//     when the React components actually need it.
//
// -------------------------------------------------------------------------
// What T-008 needs to do (implementation checklist)
// -------------------------------------------------------------------------
//
//   1. Implement `getContent` against `ContentStorageAdapter` (T-004):
//      - 'published' mode: `readPage(slug, 'published')`, return bare data.
//      - 'preview' mode: try `readPage(slug, 'draft')` first; if null, fall
//        back to `readPage(slug, 'published')`; wrap every field in
//        `PreviewField<T>` with `source` set to which bucket actually
//        served the data, `revision` set to the content hash of the
//        serialized page bytes from that bucket.
//   2. Return `null` when neither bucket has the slug.
//   3. Keep the prod path allocation-lean: no wrapping, no per-field
//      object construction, return the bare `Page` the adapter returned.
//   4. Build `fieldPath` strings as `<fieldName>` for top-level fields in
//      v1. The shape is a plain string so nested paths (`items.0.caption`)
//      can extend it without a breaking change.
//   5. Compose the per-section `PageContent<Mode, S>` mechanism under a
//      multi-section return shape once T-003 exposes its section registry.
//
// -------------------------------------------------------------------------
// Import policy
// -------------------------------------------------------------------------
//
// This file imports ONLY type-level names from `../domain/`. It must NOT
// import from `../storage/` runtime code (type-only imports from storage
// would be fine but are not needed here). It must NOT import from
// `../sections/`, `../react/`, `../handlers/`, `../mcp/`, `../tasks/`, or
// `../config/`. It must NOT import anything from `node:*`.

import type {
  FieldValueFor,
  ReferenceValue,
  SectionSchema,
} from '../domain/index'

// Re-export the types that T-007 originally defined locally so existing
// consumers (tests, future modules) importing from this file keep working.
// The canonical definitions live in `domain/`.
export type {
  FieldValueFor,
  ReferenceValue,
  SectionSchema,
} from '../domain/index'

// ---------------------------------------------------------------------------
// Preview-mode metadata
// ---------------------------------------------------------------------------

/**
 * Mode discriminator for `getContent`. `'published'` is the prod hot
 * path (bare data). `'preview'` is the editor path (data wrapped with
 * origin metadata).
 */
export type PreviewMode = 'preview' | 'published'

/**
 * Origin metadata carried by every `PreviewField<T>` in preview mode.
 *
 * `pageSlug`, `sectionId`, and `fieldPath` together address the field in
 * the content store uniquely enough for the save round-trip to write
 * back to the correct draft file and the correct field inside its
 * section payload.
 *
 * `source` tells the UI and save flow which bucket actually served the
 * data: `'draft'` when a draft existed and was read, `'published'` when
 * preview mode fell back to the published snapshot because no draft
 * existed yet. This affects the first save: saving against a
 * `'published'` source creates a new draft; saving against a `'draft'`
 * source overwrites the existing one.
 *
 * `revision` is a content-addressable hash (SHA-256 hex) of the
 * serialized page bytes from the source bucket at read time. See the
 * file header for the rationale; the hash discriminates ACTUAL content
 * drift without needing adapter-level bookkeeping.
 *
 * `kind` discriminates between a field that lives in a page section
 * (`'page'`, the default) and a field that lives in a standalone global
 * read via `getGlobal` (`'global'`). When `kind` is `'global'`,
 * `globalName` carries the global's name so the save round-trip can
 * route to `/api/agntcms/global-draft/save` instead of the page draft
 * endpoint. The discriminator is OPTIONAL for backward compatibility:
 * existing call sites that don't set it are treated as page origins.
 *
 * Why not split into two unrelated origin types? Every editable widget
 * already reads `origin.fieldPath` and (for the agent ✨ button)
 * `origin.pageSlug`/`origin.sectionId`. Keeping a single shape with all
 * fields present (populated with sentinel values on the global path,
 * matching the convention `wrapGlobalData` introduced in AdminModal)
 * avoids touching every editable component. Consumers that care about
 * the routing decision branch on `origin.kind`.
 */
export interface PreviewFieldOrigin {
  readonly pageSlug: string
  readonly sectionId: string
  readonly fieldPath: string
  readonly source: 'draft' | 'published'
  readonly revision: string
  /**
   * Discriminator: `'page'` (default, when omitted) means the field
   * lives inside a page draft; `'global'` means it lives inside a
   * standalone global. New in v0.2 (Phase 2 globals work).
   */
  readonly kind?: 'page' | 'global'
  /**
   * The global's name. Present iff `kind === 'global'`. Consumers that
   * route saves on the global endpoint read this value.
   */
  readonly globalName?: string
}

/**
 * A field value in preview mode: the bare value plus its origin metadata
 * and a brand so downstream code can distinguish a wrapped preview field
 * from a bare published value both at compile time and at runtime.
 *
 * The brand uses a regular property `__agntcmsPreview: true` rather
 * than a `unique symbol`. The original T-007 design used a `declare`-only
 * unique symbol for the brand, which is structurally unforgeable at
 * compile time. However, `declare const` symbols exist only in the type
 * system — they have no runtime identity, so the implementation (T-008)
 * cannot actually SET a symbol-keyed property on the wrapper objects it
 * constructs. Using a string-keyed property solves this: the runtime can
 * set it, the `EditableText`/`EditableImage` components (T-016) can
 * detect it with a cheap `'__agntcmsPreview' in field` check, and it is
 * still unforgeable enough for v1 (no user type would accidentally have
 * a `__agntcmsPreview` property). The double-underscore prefix signals
 * "framework internal — do not depend on this key".
 *
 * The `value` key carries the underlying data (e.g. a `string` for
 * `TextField` or `ImageField`). Client-side code unwraps by reading
 * `field.value`; servers read `field.origin` to compute where a save
 * must land.
 */
export interface PreviewField<T> {
  readonly __agntcmsPreview: true
  readonly value: T
  readonly origin: PreviewFieldOrigin
}

// ---------------------------------------------------------------------------
// FieldIn — the per-field mode selector
// ---------------------------------------------------------------------------

/**
 * `FieldIn<Mode, T>` is the mode-aware wrapper type. It is the SINGLE
 * axiom on which everything else in this file depends:
 *
 *   - `FieldIn<'preview', T>`   → `PreviewField<T>`
 *   - `FieldIn<'published', T>` → `T` (structurally identical, zero cost)
 *
 * Written as a distributive conditional over a naked `Mode` parameter so
 * that when `Mode` is itself a union, `FieldIn<Mode, T>` distributes over
 * it. This is what makes the single `getContent` call site correctly
 * return `PreviewField<T> | T` (rather than a widened `never`) when the
 * caller's `mode` is known only as `'preview' | 'published'`.
 */
export type FieldIn<Mode extends PreviewMode, T> = Mode extends 'preview'
  ? PreviewField<T>
  : Mode extends 'published'
    ? T
    : never

// ---------------------------------------------------------------------------
// PageContent — schema-driven per-field projection
// ---------------------------------------------------------------------------

/**
 * Projects a section schema `S` into its mode-resolved field shape.
 * Each key in `S` is mapped through `FieldValueFor<S[K]>` to its runtime
 * value type, and then wrapped via `FieldIn<Mode, _>`.
 *
 * The double conditional keeps distribution working: `Mode` must remain
 * naked in the outermost position so a union `Mode` distributes here.
 * `S[K]` is passed through `FieldValueFor` separately (non-distributive)
 * because each key resolves independently.
 *
 * Mapped type keys are preserved as-is (no `-readonly`, no `-?`) so the
 * readonly-ness and optionality of the schema's own keys are not
 * dropped.
 */
export type PageContent<
  Mode extends PreviewMode,
  S extends SectionSchema,
> = Mode extends 'preview'
  ? { readonly [K in keyof S]: PreviewField<FieldValueFor<S[K]>> }
  : Mode extends 'published'
    ? { readonly [K in keyof S]: FieldValueFor<S[K]> }
    : never

// ---------------------------------------------------------------------------
// Public function shape
// ---------------------------------------------------------------------------

/**
 * Parameters for a single `getContent` call.
 *
 * `slug` identifies the page. `mode` is the dual-mode discriminator;
 * keeping it as a generic `Mode extends PreviewMode` is what lets the
 * return type narrow in lockstep with the caller's `mode` value.
 *
 * Additional fields (e.g. locale, draft id, preview token) are
 * deliberately out of scope for T-007. They can be added additively
 * without breaking the mode-resolution mechanism locked in here.
 */
export interface GetContentOptions<Mode extends PreviewMode> {
  readonly slug: string
  readonly mode: Mode
}

/**
 * The public `getContent` function type. Single call site, generic over
 * `Mode` and over the section schema `S`, returning `null` when the
 * requested page does not exist in the mode's resolved storage.
 *
 * T-008 ships the runtime implementation that satisfies this type.
 * Typed as a function type (not an interface with a call signature) so
 * callers using `typeof getContent` get a clean arrow-function shape in
 * tooltips.
 */
export type GetContent = <
  Mode extends PreviewMode,
  S extends SectionSchema,
>(
  options: GetContentOptions<Mode>,
) => Promise<PageContent<Mode, S> | null>

/**
 * Ambient declaration of the `getContent` export itself. `declare` emits
 * no JavaScript — this is purely a type-level anchor that locks the
 * name and signature for T-008 to implement. Without this declaration
 * the test file below could still round-trip through the `GetContent`
 * alias, but having the export here makes the public API surface
 * grep-able and keeps a single source of truth for the signature.
 */
export declare const getContent: GetContent
