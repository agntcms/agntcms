// Derivations from `ResolvedConfig.sections` that the route handlers consume.
//
// Today the template's `route.dev.ts` reconstructs three derived collections
// from `config.sections` to wire `createGlobalHandler` and friends:
//   - `allowedTypes`: the set of registered section names, used to reject
//     unknown `type` values at the save boundary.
//   - `sectionDefaults`: per-type insertion seed, used to populate a
//     freshly-inserted/replaced section and to fill missing fields on
//     freshly-created globals. The seed is the section's authored
//     `previewData` layered (shallow, per-field) over its computed
//     placeholder `defaults`, so an inserted section carries representative
//     sample content instead of bare placeholders. See ARCHITECTURE.md §3.
//   - `systemTypes`: the set of `system: true` section names; the globals
//     handler tags list entries with `system: boolean` and rejects creates
//     and deletes of system-flagged types.
//
// Wrapping these into a single helper guarantees that any caller wiring the
// handler outside the template — tests, integration glue, third-party
// embedders — picks up new enforcement bits automatically when we add them.
// See ARCHITECTURE.md §3 "Section registration" for the system-global
// concept and the canonical derivation name.

import type { ResolvedConfig } from './defineConfig'

/**
 * Pre-computed derivations from `config.sections` that route handlers
 * consume. All collections are read-only by construction so a handler
 * cannot accidentally mutate the registry view.
 */
export interface HandlerDerivations {
  /** Registered section type names — used by the save handler's `unknown_type` check. */
  readonly allowedTypes: ReadonlySet<string>
  /**
   * Per-type insertion seed: the section's authored `previewData` layered
   * shallow (per-field, previewData wins) over its computed placeholder
   * `defaults`. Used to populate a newly inserted/replaced section with
   * representative content and to fill missing fields on create. The
   * computed `defaults` remain the fallback for any field the author did
   * not cover in `previewData`.
   */
  readonly sectionDefaults: ReadonlyMap<string, Readonly<Record<string, unknown>>>
  /** Type names whose section definition carries `system: true`. */
  readonly systemTypes: ReadonlySet<string>
}

/**
 * Derive all three handler-facing collections from a resolved config in one
 * pass over `config.sections`. Pure function; no I/O, no module-level state.
 *
 * Bundling the three under one helper (rather than three named exports) is
 * deliberate: the template wires all three together always, so a caller
 * that forgets one would silently lose enforcement. A single struct keeps
 * the wiring honest.
 */
export function deriveHandlerDeps(config: ResolvedConfig): HandlerDerivations {
  const sections = config.sections
  return {
    allowedTypes: new Set(sections.map((s) => s.name)),
    // Insertion seed = computed `defaults` with the authored `previewData`
    // layered on top (shallow, per-field). This makes a newly inserted or
    // replaced section land with the SAME representative content the picker
    // card shows, instead of bare placeholders. `previewData` wins per-field;
    // fields the author omitted fall back to the computed `defaults`.
    sectionDefaults: new Map(
      sections.map((s) => [s.name, { ...s.defaults, ...(s.previewData ?? {}) }]),
    ),
    // `system === true` is checked strictly so an absent or `false` flag
    // does NOT land in the system set. Anything other than literal `true`
    // is "regular user section".
    systemTypes: new Set(
      sections.filter((s) => s.system === true).map((s) => s.name),
    ),
  }
}
