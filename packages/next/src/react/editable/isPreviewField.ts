// Runtime check for preview-mode field wrappers.
//
// This file defines `PreviewFieldLike<T>` — a structural replica of
// `PreviewField<T>` from `runtime/getContent.types.ts`. It is defined
// LOCALLY in `react/` (not imported from runtime/) so that "use client"
// components never pull in server-side code. The shape is structurally
// compatible with the canonical `PreviewField<T>` — if the runtime
// type changes, both must be updated in lockstep.
//
// IMPORT CONSTRAINTS:
//   - This file must NOT import from storage/, runtime/, mcp/, tasks/,
//     handlers/, config/. It is used by client components.

/**
 * The origin metadata carried by a preview-mode field. Mirrors
 * `PreviewFieldOrigin` from runtime types but defined locally to avoid
 * importing server code into the client bundle.
 *
 * `kind` and `globalName` were added in v0.2 to support `<GlobalSlot>`:
 * fields that come from a global carry `kind: 'global'` and
 * `globalName: <name>`, which lets the save dispatcher route to
 * `/api/agntcms/global-draft/save` instead of the page draft endpoint.
 * The discriminator is OPTIONAL for backward compatibility — when
 * absent, the field is treated as a page-origin field.
 */
export interface PreviewFieldOriginLike {
  readonly pageSlug: string
  readonly sectionId: string
  readonly fieldPath: string
  readonly source: 'draft' | 'published'
  readonly revision: string
  readonly kind?: 'page' | 'global'
  readonly globalName?: string
}

/**
 * Structural replica of `PreviewField<T>` for use in client components.
 * See file header for why this is duplicated rather than imported.
 */
export interface PreviewFieldLike<T = unknown> {
  readonly __agntcmsPreview: true
  readonly value: T
  readonly origin: PreviewFieldOriginLike
}

/**
 * Runtime check: is the given value a preview-mode wrapped field?
 *
 * Uses the `__agntcmsPreview` brand property that the runtime sets on
 * every `PreviewField<T>` instance. This is a cheap property-existence
 * check — no deep validation of the origin shape.
 */
export function isPreviewField<T>(field: unknown): field is PreviewFieldLike<T> {
  return (
    typeof field === 'object' &&
    field !== null &&
    '__agntcmsPreview' in field &&
    (field as Record<string, unknown>)['__agntcmsPreview'] === true
  )
}
