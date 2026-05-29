import { describe, it, expect } from 'vitest'
import { wordDiff, type WordDiffOp } from './wordDiff'

function concatEqualAnd(ops: readonly WordDiffOp[], include: 'add' | 'remove'): string {
  return ops
    .filter((o) => o.kind === 'equal' || o.kind === include)
    .map((o) => o.text)
    .join('')
}

describe('wordDiff', () => {
  it('returns an empty list when inputs are identical', () => {
    expect(wordDiff('hello world', 'hello world')).toEqual([])
  })

  it('returns an empty list for two empty strings', () => {
    expect(wordDiff('', '')).toEqual([])
  })

  it('reports a pure add when before is empty', () => {
    const ops = wordDiff('', 'hello world')
    expect(ops).toEqual([{ kind: 'add', text: 'hello world' }])
  })

  it('reports a pure remove when after is empty', () => {
    const ops = wordDiff('hello world', '')
    expect(ops).toEqual([{ kind: 'remove', text: 'hello world' }])
  })

  it('reports a mixed add/remove/equal sequence and round-trips both sides', () => {
    const before = 'the quick brown fox'
    const after = 'the slow brown cat'
    const ops = wordDiff(before, after)

    // Ops preserve exact whitespace so the two sides can be reconstructed.
    expect(concatEqualAnd(ops, 'remove')).toBe(before)
    expect(concatEqualAnd(ops, 'add')).toBe(after)

    // Sanity: at least one add and one remove were produced.
    expect(ops.some((o) => o.kind === 'add')).toBe(true)
    expect(ops.some((o) => o.kind === 'remove')).toBe(true)
  })

  it('preserves whitespace verbatim across runs (coalesces adjacent ops)', () => {
    // Trailing newline in one side should appear as an add/remove run
    // rather than being stripped.
    const before = 'a b c'
    const after = 'a b c\n'
    const ops = wordDiff(before, after)

    expect(concatEqualAnd(ops, 'remove')).toBe(before)
    expect(concatEqualAnd(ops, 'add')).toBe(after)
    // The trailing newline must appear in exactly one op of kind 'add'.
    const adds = ops.filter((o) => o.kind === 'add').map((o) => o.text)
    expect(adds).toContain('\n')
  })

  it('coalesces consecutive ops of the same kind into a single op', () => {
    // Two adjacent word tokens removed + the whitespace between them
    // should collapse into one op so the consumer renders one span.
    const ops = wordDiff('keep old words tail', 'keep tail')

    // No two consecutive ops share the same kind.
    for (let i = 1; i < ops.length; i++) {
      const prev = ops[i - 1]!
      const cur = ops[i]!
      expect(prev.kind).not.toBe(cur.kind)
    }
  })

  it('round-trips both sides for markdown-ish input with formatting markers', () => {
    // Markdown markers ride along with their surrounding word tokens;
    // this is the acceptable behaviour documented in the file header.
    const before = 'Hello **world** and friends'
    const after = 'Hello **earth** and friends'
    const ops = wordDiff(before, after)

    expect(concatEqualAnd(ops, 'remove')).toBe(before)
    expect(concatEqualAnd(ops, 'add')).toBe(after)
  })

  it('handles add-only where before is a subset of after', () => {
    const before = 'a c'
    const after = 'a b c'
    const ops = wordDiff(before, after)
    expect(concatEqualAnd(ops, 'remove')).toBe(before)
    expect(concatEqualAnd(ops, 'add')).toBe(after)
    expect(ops.some((o) => o.kind === 'remove')).toBe(false)
  })

  it('handles remove-only where after is a subset of before', () => {
    const before = 'a b c'
    const after = 'a c'
    const ops = wordDiff(before, after)
    expect(concatEqualAnd(ops, 'remove')).toBe(before)
    expect(concatEqualAnd(ops, 'add')).toBe(after)
    expect(ops.some((o) => o.kind === 'add')).toBe(false)
  })
})
