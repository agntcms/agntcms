// `Section` is modelled as a generic carrier, not an explicit discriminated
// union. Rationale:
//
// A discriminated union over a fixed set of sections would force every
// concrete section type to live inside `packages/next/src/domain/`, which is
// wrong — sections are defined by the USER in the template (`agntcms/sections/`)
// and registered explicitly via `defineSection` (T-003). The domain layer
// must stay schema-agnostic.
//
// The generic shape below lets T-003 bind a concrete schema to a concrete
// data type without reaching back into `domain/`, avoiding a circular
// dependency: `SectionDefinition<S>` will derive a `Section<Type, DataOf<S>>`
// from the schema it owns, and downstream code can treat any `Section` as
// `Section<string, unknown>` when it does not care about the specifics.
//
// `id` is the runtime identifier used for page-level invariants (e.g.
// uniqueness within a page) and for addressing a specific field during live
// editing. `type` is the string discriminator registered with the section
// registry. `data` is the payload shaped by the section's schema.

export interface Section<
  T extends string = string,
  D = unknown,
> {
  readonly id: string
  readonly type: T
  readonly data: D
  /** When set, this section is a reference to a named global.
   *  The runtime resolves `type` and `data` from the global at read time. */
  readonly globalRef?: string
}
