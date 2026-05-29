// Per-section diff status, used by the page history preview pane to
// decorate each rendered section with an "Added / Modified / Moved /
// Unchanged" label relative to the currently-published page.
//
// This is a presentation-layer helper on top of `diffSections`: same
// comparison rules, but the result is a per-id map rather than a set of
// aggregated counts. We keep it next to `diffSections.ts` on purpose —
// both use the same equality and kept-id-index semantics, and colocating
// them makes it obvious when one needs to change that the other does
// too.
//
// Semantics are phrased from the user's point of view while they look at
// the preview pane: "if I restore this snapshot, what happens to each
// section?" So the inputs are named `baseline` (currently-published) and
// `target` (the snapshot being previewed):
//
//   - added:     id in target, not in baseline
//   - modified:  id in both, `data` differs
//   - moved:     id in both, `data` equal, position among kept ids differs
//   - unchanged: id in both, `data` equal, same position among kept ids
//
// When a section is BOTH modified and moved, we report it as `modified`.
// Rationale: data change is the more informative label — a reader who
// sees "Modified" immediately knows content differs, whereas "Moved"
// would hide that. The position change still contributes to the aggregate
// `moved` count in `diffSections`; only the per-section label collapses.
//
// Sections present in baseline but not in target are reported separately
// (`removedInTarget`) so the caller can render them in a callout above
// the preview — they cannot appear in the rendered list because the list
// renders `target.sections`.
//
// IMPORT CONSTRAINTS:
//   - Consumed by a "use client" component (AdminModal).
//   - Depends only on the domain `Section` type.

import type { Section } from '../../domain/index'

export type SectionStatus = 'unchanged' | 'added' | 'modified' | 'moved'

export interface RemovedSection {
  readonly id: string
  readonly type: string
}

export interface SectionDiffStatusResult {
  /** Status for each section id that appears in `target`. */
  readonly statusById: ReadonlyMap<string, SectionStatus>
  /** Sections present in `baseline` but absent from `target`. */
  readonly removedInTarget: readonly RemovedSection[]
}

// Deep structural equality on section `data`. Kept separate from the
// copy in `diffSections.ts` on purpose: both are module-private helpers
// with the same contract, and sharing would require a third file for one
// trivial function. Duplicated deliberately — if the equality rule ever
// changes, both sites are obvious neighbours to update.
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }

  if (Array.isArray(b)) return false

  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const aKeys = Object.keys(ao)
  const bKeys = Object.keys(bo)
  if (aKeys.length !== bKeys.length) return false
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false
    if (!deepEqual(ao[k], bo[k])) return false
  }
  return true
}

/**
 * Compute a per-id status map describing how each section in `target`
 * relates to `baseline`, plus the list of sections removed in `target`.
 *
 * @param baseline currently-published page sections
 * @param target   snapshot sections being previewed
 */
export function sectionDiffStatus(
  baseline: readonly Section[],
  target: readonly Section[],
): SectionDiffStatusResult {
  const baselineById = new Map<string, Section>()
  for (const s of baseline) baselineById.set(s.id, s)
  const targetById = new Map<string, Section>()
  for (const s of target) targetById.set(s.id, s)

  // Kept ids = ids present in both. Positions are computed over this
  // subset in each list's original order; pure add/remove elsewhere does
  // not count as a move for unaffected sections. Matches `diffSections`.
  const keptInBaseline: string[] = []
  const keptInTarget: string[] = []
  for (const s of baseline) {
    if (targetById.has(s.id)) keptInBaseline.push(s.id)
  }
  for (const s of target) {
    if (baselineById.has(s.id)) keptInTarget.push(s.id)
  }
  const baselineIndexOf = new Map<string, number>()
  for (let i = 0; i < keptInBaseline.length; i++) {
    baselineIndexOf.set(keptInBaseline[i] as string, i)
  }
  const targetIndexOf = new Map<string, number>()
  for (let i = 0; i < keptInTarget.length; i++) {
    targetIndexOf.set(keptInTarget[i] as string, i)
  }

  const statusById = new Map<string, SectionStatus>()
  for (const s of target) {
    const prior = baselineById.get(s.id)
    if (prior === undefined) {
      statusById.set(s.id, 'added')
      continue
    }
    const dataEqual = deepEqual(prior.data, s.data)
    if (!dataEqual) {
      // Modified wins over moved when both apply — the per-section label
      // collapses to the more informative one. See file header.
      statusById.set(s.id, 'modified')
      continue
    }
    const bIdx = baselineIndexOf.get(s.id)
    const tIdx = targetIndexOf.get(s.id)
    if (bIdx !== undefined && tIdx !== undefined && bIdx !== tIdx) {
      statusById.set(s.id, 'moved')
    } else {
      statusById.set(s.id, 'unchanged')
    }
  }

  const removedInTarget: RemovedSection[] = []
  for (const s of baseline) {
    if (!targetById.has(s.id)) {
      removedInTarget.push({ id: s.id, type: s.type })
    }
  }

  return { statusById, removedInTarget }
}
