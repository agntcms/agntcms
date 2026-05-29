// Section-level diff between two lists of sections. Used by the page
// history UI to show what changed between a historical snapshot and the
// next-newer version (or the currently published page).
//
// Categories (by section `id`):
//   - added:    id present in `next` but not in `prev`
//   - removed:  id present in `prev` but not in `next`
//   - modified: id present in both, `data` differs (deep equal)
//   - moved:    id present in both, `data` equal, position among kept ids differs
//
// "position among kept ids" means indices are computed over the subset of
// ids that appear in BOTH lists, in each list's original order. A pure
// add/remove elsewhere in the array therefore does NOT count as a move
// for sections whose relative order is unchanged.
//
// IMPORT CONSTRAINTS:
//   - This module is consumed by a "use client" component (AdminModal).
//   - Depends only on the domain `Section` type.

import type { Section } from '../../domain/index'

export interface SectionsDiff {
  readonly added: number
  readonly removed: number
  readonly modified: number
  readonly moved: number
}

/** Deep structural equality for section `data` payloads. */
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
 * Compare two ordered section lists and return counts in four buckets.
 *
 * `prev` is the older version; `next` is the newer. Conceptually: how
 * would you describe the changes going from `prev` to `next`?
 */
export function diffSections(
  prev: readonly Section[],
  next: readonly Section[],
): SectionsDiff {
  const prevById = new Map<string, Section>()
  for (const s of prev) prevById.set(s.id, s)
  const nextById = new Map<string, Section>()
  for (const s of next) nextById.set(s.id, s)

  let added = 0
  let removed = 0
  let modified = 0

  // Kept ids: appear in both. We use the arrays below to compare the
  // relative order of kept ids between the two versions.
  const keptInPrev: string[] = []
  const keptInNext: string[] = []

  for (const s of prev) {
    if (nextById.has(s.id)) keptInPrev.push(s.id)
    else removed++
  }

  for (const s of next) {
    const prevSection = prevById.get(s.id)
    if (prevSection === undefined) {
      added++
      continue
    }
    keptInNext.push(s.id)
    if (!deepEqual(prevSection.data, s.data)) modified++
  }

  // Count ids whose index among kept ids changed between the two lists.
  // Using "position among kept ids" (not absolute index) means that when
  // only additions/removals happen elsewhere, unchanged sections are not
  // reported as moved — which matches the reader's intuition.
  let moved = 0
  const nextIndexOf = new Map<string, number>()
  for (let i = 0; i < keptInNext.length; i++) {
    nextIndexOf.set(keptInNext[i] as string, i)
  }
  for (let i = 0; i < keptInPrev.length; i++) {
    const id = keptInPrev[i] as string
    const j = nextIndexOf.get(id)
    if (j !== undefined && j !== i) moved++
  }

  return { added, removed, modified, moved }
}
