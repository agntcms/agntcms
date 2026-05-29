// Detect which history entry corresponds to the currently-published
// version of a page, so the UI can label it "Current" and hide the
// Restore button (restoring the live version is a no-op).
//
// The "current" entry is the NEWEST history entry whose full Page body
// is deep-equal to the currently-published page. We pick the newest on
// purpose: after the publish-dedupe change, at most one new snapshot
// can equal the current page, but legacy data (e.g. seed + rollback
// producing two identical snapshots) can still contain duplicates, and
// labelling only the newest avoids confusing the user with several
// "Current" rows.
//
// If no entry deep-equals the current page (e.g. page has no history,
// or the user is looking at history for a slug that isn't currently
// published), this returns -1.
//
// IMPORT CONSTRAINTS:
//   - Consumed by a "use client" component (AdminModal).
//   - No domain imports — the logic is structural (deep-equal) so it
//     works for any plain-JSON body: `Page` (page history) or `Global`
//     (global history). Callers supply the body type via the generic
//     parameter.

// Deep structural equality. Duplicated from `sectionDiffStatus.ts` on
// purpose — same trade-off as there: both sites use the same rule, and
// inlining each avoids a third file for one trivial function. If the
// rule ever changes, both files are obvious neighbours to update.
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

/** Minimal shape the helper needs from a history entry. */
export interface HistoryEntryRef {
  readonly timestamp: string
}

/**
 * Find the index of the history entry that corresponds to the
 * currently-live body (a published page or a saved global).
 *
 * Generic over the body type so the same helper serves both page
 * history and global history — the "match" rule is deep structural
 * equality, which is identical for either.
 *
 * @param entries entries in newest-first order (the order returned by
 *                the history API).
 * @param bodies  snapshot bodies keyed by timestamp.
 * @param current currently-live body, or null if none.
 * @returns index of the newest entry whose body deep-equals `current`,
 *          or -1 if no entry matches (including when `current` is null
 *          or `entries` is empty).
 */
export function findCurrentHistoryEntryIndex<TBody>(
  entries: readonly HistoryEntryRef[],
  bodies: Readonly<Record<string, TBody>>,
  current: TBody | null,
): number {
  if (current === null) return -1
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry === undefined) continue
    const body = bodies[entry.timestamp]
    // A snapshot body we haven't loaded yet is treated as "not a match"
    // rather than throwing: the modal displays entries as they arrive,
    // and we want the label to appear as soon as bodies resolve without
    // blocking earlier rendering.
    if (body === undefined) continue
    if (deepEqual(body, current)) return i
  }
  return -1
}
