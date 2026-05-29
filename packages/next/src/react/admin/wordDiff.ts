// Word-level text diff used by the history preview pane's per-field
// diff panel. Consumed by `fieldDiff.ts` and rendered by the
// `FieldDiffPanel` piece of `AdminModal.tsx`.
//
// Approach: tokenize both sides into a sequence of "word or whitespace"
// tokens so the output round-trips back to the exact original strings
// when concatenated. Then compute a standard LCS table over those
// tokens and walk it backwards to produce an ordered list of ops.
//
// Scope and tradeoffs:
//   - Word granularity (not character). Good enough for the editorial
//     UI we show and keeps the diff readable. Markdown markers like
//     `**`, `[` come along for the ride as part of their surrounding
//     word token, which is acceptable per the task brief.
//   - LCS is O(n*m) in time and memory. History snapshots are short
//     (section data is a handful of lines, rarely more); no need for
//     Myers or other linear-memory variants at v1 scale.
//
// IMPORT CONSTRAINTS:
//   - Pure module, no React, no domain imports required.
//   - Consumed by a "use client" module; no server-side deps.

export type WordDiffOpKind = 'equal' | 'add' | 'remove'

export interface WordDiffOp {
  readonly kind: WordDiffOpKind
  readonly text: string
}

/**
 * Tokenize a string into alternating word / whitespace runs. Keeping
 * whitespace as its own tokens means the concatenation of all tokens
 * reproduces the original string byte-for-byte, which is required so
 * the rendered diff does not silently collapse spacing.
 */
function tokenize(input: string): readonly string[] {
  if (input === '') return []
  // Split into maximal runs of whitespace OR non-whitespace. Using a
  // regex with alternation keeps the two classes in order and avoids
  // any empty tokens in the middle.
  const matches = input.match(/\s+|\S+/g)
  return matches ?? []
}

/**
 * Compute a word-level diff between `before` and `after`.
 *
 * Returns an ordered list of ops such that concatenating all `equal`
 * and `remove` ops reproduces `before`, and concatenating all `equal`
 * and `add` ops reproduces `after`. Returns an empty list when the
 * inputs are equal (including when both are empty).
 *
 * Runs of consecutive same-kind ops are coalesced so consumers can
 * render one span per run.
 */
export function wordDiff(before: string, after: string): readonly WordDiffOp[] {
  if (before === after) return []

  const a = tokenize(before)
  const b = tokenize(after)

  // Fast paths for pure-add and pure-delete avoid allocating the LCS
  // table when one side is empty.
  if (a.length === 0) {
    return after === '' ? [] : coalesce([{ kind: 'add', text: after }])
  }
  if (b.length === 0) {
    return before === '' ? [] : coalesce([{ kind: 'remove', text: before }])
  }

  // LCS table: lcs[i][j] = length of longest common subsequence of
  // a[0..i) and b[0..j). Standard dynamic programming.
  const m = a.length
  const n = b.length
  const lcs: number[][] = []
  for (let i = 0; i <= m; i++) {
    const row: number[] = new Array(n + 1).fill(0) as number[]
    lcs.push(row)
  }
  for (let i = 1; i <= m; i++) {
    const ai = a[i - 1] as string
    const rowI = lcs[i] as number[]
    const rowPrev = lcs[i - 1] as number[]
    for (let j = 1; j <= n; j++) {
      if (ai === b[j - 1]) {
        rowI[j] = (rowPrev[j - 1] as number) + 1
      } else {
        const left = rowI[j - 1] as number
        const up = rowPrev[j] as number
        rowI[j] = left >= up ? left : up
      }
    }
  }

  // Walk the table backwards to produce ops in reverse, then reverse
  // once at the end. Tie-break in favor of removes-before-adds when
  // neither side is preferable; this keeps the output stable and
  // readable (the pattern most users expect from diff tools).
  const ops: WordDiffOp[] = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ kind: 'equal', text: a[i - 1] as string })
      i--
      j--
      continue
    }
    const rowI = lcs[i] as number[]
    const rowPrev = lcs[i - 1] as number[]
    const up = rowPrev[j] as number
    const left = rowI[j - 1] as number
    if (up >= left) {
      ops.push({ kind: 'remove', text: a[i - 1] as string })
      i--
    } else {
      ops.push({ kind: 'add', text: b[j - 1] as string })
      j--
    }
  }
  while (i > 0) {
    ops.push({ kind: 'remove', text: a[i - 1] as string })
    i--
  }
  while (j > 0) {
    ops.push({ kind: 'add', text: b[j - 1] as string })
    j--
  }

  ops.reverse()
  return coalesce(ops)
}

/**
 * Merge adjacent ops of the same kind into a single op. Reduces the
 * number of DOM nodes the renderer has to produce and keeps the
 * output easy to reason about in tests.
 */
function coalesce(ops: readonly WordDiffOp[]): readonly WordDiffOp[] {
  if (ops.length <= 1) return ops
  const out: WordDiffOp[] = []
  for (const op of ops) {
    const last = out[out.length - 1]
    if (last !== undefined && last.kind === op.kind) {
      out[out.length - 1] = { kind: last.kind, text: last.text + op.text }
    } else {
      out.push(op)
    }
  }
  return out
}
