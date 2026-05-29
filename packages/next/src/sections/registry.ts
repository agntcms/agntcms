// The section registry is pure data. `defineConfig` (T-019) will hand the
// user's `sections: [Hero, VideoIntro, ...]` array to the runtime, and the
// runtime will call `buildSectionRegistry` on it to get a name→definition
// lookup. There is NO module-level mutable state here — no `register()`
// side effects, no global singleton, no auto-registration.
//
// Why no global:
//   - Invariant 6 (CLAUDE.md): "section registration is always explicit
//     through `agntcms/config.ts`". A module-level registry would let
//     imports silently register sections as a side effect, which is exactly
//     the kind of magic the design rules out.
//   - Testability: every test can instantiate its own registry with its own
//     set of definitions, no reset ceremony.
//
// The registry exists so the runtime can do O(1) lookup by name. A plain
// array is fine for defineConfig's input (ordered, literal), but the runtime
// will call into the registry once per section during rendering, so we
// materialize a Map once and hand it around.

import type { AnySectionDefinition } from './defineSection'

/**
 * The input list `defineConfig` takes and the runtime receives. Uses the
 * erased `AnySectionDefinition` form so that a heterogeneous list of
 * precise definitions (each with its own schema and component prop type)
 * can be held in a single array without widening to `unknown`. See the
 * `SectionDefinition` / `AnySectionDefinition` split in `defineSection.ts`
 * for the variance rationale.
 */
export type SectionDefinitionList = readonly AnySectionDefinition[]

/**
 * Opaque, immutable lookup built from a `SectionDefinitionList`. Holds both
 * the original ordered list (needed when the runtime wants to iterate
 * definitions in insertion order, e.g. to produce a UI menu of available
 * section types) and the name→definition map for O(1) render-time lookup.
 *
 * `get` returns `undefined` on a miss. The runtime decides the policy:
 * `SectionRenderer` (T-016) will surface a clear "unknown section type"
 * error rather than throwing deep inside a component tree.
 */
export interface SectionRegistry {
  readonly definitions: SectionDefinitionList
  get(name: string): AnySectionDefinition | undefined
  has(name: string): boolean
}

/** Thrown when two definitions in the same registry share a `name`. */
export class DuplicateSectionNameError extends Error {
  public readonly sectionName: string
  public constructor(name: string) {
    super(
      `Section name "${name}" is registered more than once. ` +
        'Section names must be unique within a config.',
    )
    this.name = 'DuplicateSectionNameError'
    this.sectionName = name
  }
}

/**
 * Build an immutable `SectionRegistry` from an ordered list of definitions.
 *
 * Rejects duplicates eagerly: two definitions with the same `name` is a
 * configuration bug (the runtime would arbitrarily prefer one, and live
 * editing would address the wrong component). Surfacing it at registry
 * build time means the error is raised once at process start, not in a
 * hot render path.
 *
 * The returned object is frozen and closes over a local `Map` — callers
 * cannot mutate it after construction.
 */
export function buildSectionRegistry(
  definitions: SectionDefinitionList,
): SectionRegistry {
  const byName = new Map<string, AnySectionDefinition>()
  for (const def of definitions) {
    if (byName.has(def.name)) {
      throw new DuplicateSectionNameError(def.name)
    }
    byName.set(def.name, def)
  }

  const registry: SectionRegistry = {
    definitions,
    get: (name) => byName.get(name),
    has: (name) => byName.has(name),
  }
  return Object.freeze(registry)
}
