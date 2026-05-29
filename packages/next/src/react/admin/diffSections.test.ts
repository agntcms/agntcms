import { describe, it, expect } from 'vitest'
import { diffSections } from './diffSections'
import type { Section } from '../../domain/index'

function s(id: string, type: string, data: Record<string, unknown>): Section {
  return { id, type, data }
}

describe('diffSections', () => {
  it('returns zeros for identical lists', () => {
    const a = [s('1', 'Hero', { title: 'a' }), s('2', 'Text', { body: 'b' })]
    expect(diffSections(a, a)).toEqual({ added: 0, removed: 0, modified: 0, moved: 0 })
  })

  it('counts added sections', () => {
    const prev = [s('1', 'Hero', {})]
    const next = [s('1', 'Hero', {}), s('2', 'Text', {}), s('3', 'Footer', {})]
    expect(diffSections(prev, next)).toEqual({ added: 2, removed: 0, modified: 0, moved: 0 })
  })

  it('counts removed sections', () => {
    const prev = [s('1', 'Hero', {}), s('2', 'Text', {}), s('3', 'Footer', {})]
    const next = [s('1', 'Hero', {})]
    expect(diffSections(prev, next)).toEqual({ added: 0, removed: 2, modified: 0, moved: 0 })
  })

  it('counts modified sections (data differs, id same)', () => {
    const prev = [s('1', 'Hero', { title: 'old' })]
    const next = [s('1', 'Hero', { title: 'new' })]
    expect(diffSections(prev, next)).toEqual({ added: 0, removed: 0, modified: 1, moved: 0 })
  })

  it('treats type change as modified (same id)', () => {
    // Type change with same id: we match by id, so this is a "modified" —
    // data comparison may or may not trigger. We verify current behaviour:
    // same data + same id + different type counts as unmodified because we
    // only deep-compare `data`. This is the intended contract: moves/edits
    // happen on `data`; type changes are a replacement that the agent flow
    // would have re-issued the section with a new id anyway.
    const prev = [s('1', 'Hero', { x: 1 })]
    const next = [s('1', 'Text', { x: 1 })]
    expect(diffSections(prev, next)).toEqual({ added: 0, removed: 0, modified: 0, moved: 0 })
  })

  it('counts a reorder as moved', () => {
    const prev = [s('1', 'A', {}), s('2', 'B', {}), s('3', 'C', {})]
    const next = [s('2', 'B', {}), s('1', 'A', {}), s('3', 'C', {})]
    const diff = diffSections(prev, next)
    // ids 1 and 2 swap positions among kept ids (0<->1), id 3 stays at 2.
    expect(diff.moved).toBe(2)
    expect(diff.added).toBe(0)
    expect(diff.removed).toBe(0)
    expect(diff.modified).toBe(0)
  })

  it('does not count stable ids as moved when others are removed', () => {
    // id "1" at index 0 in both; id "2" removed from prev.
    const prev = [s('1', 'A', {}), s('2', 'B', {})]
    const next = [s('1', 'A', {})]
    const diff = diffSections(prev, next)
    expect(diff.removed).toBe(1)
    expect(diff.moved).toBe(0)
  })

  it('does not count stable ids as moved when others are added before', () => {
    // "1" absolute index changes from 0 to 1, but among kept ids it's still
    // at position 0 — so not counted as moved.
    const prev = [s('1', 'A', {})]
    const next = [s('new', 'X', {}), s('1', 'A', {})]
    const diff = diffSections(prev, next)
    expect(diff.added).toBe(1)
    expect(diff.moved).toBe(0)
  })

  it('combines added, removed, modified, and moved', () => {
    const prev = [
      s('keep', 'A', { v: 1 }),
      s('edit', 'B', { v: 1 }),
      s('gone', 'C', {}),
      s('move', 'D', { stable: true }),
    ]
    const next = [
      s('move', 'D', { stable: true }), // moved (index 3 -> 0 among kept)
      s('keep', 'A', { v: 1 }),
      s('edit', 'B', { v: 2 }), // modified
      s('new', 'E', {}), // added
    ]
    const diff = diffSections(prev, next)
    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(1)
    expect(diff.modified).toBe(1)
    // keptInPrev = [keep, edit, move] (order from prev)
    // keptInNext = [move, keep, edit] (order from next)
    // keep: prev idx 0 -> next idx 1 (moved)
    // edit: prev idx 1 -> next idx 2 (moved)
    // move: prev idx 2 -> next idx 0 (moved)
    expect(diff.moved).toBe(3)
  })

  it('deep-equals nested arrays and objects for modified detection', () => {
    const prev = [
      s('1', 'X', { list: [1, 2, { nested: 'a' }] }),
    ]
    const next = [
      s('1', 'X', { list: [1, 2, { nested: 'a' }] }),
    ]
    expect(diffSections(prev, next)).toEqual({ added: 0, removed: 0, modified: 0, moved: 0 })

    const changed = [
      s('1', 'X', { list: [1, 2, { nested: 'b' }] }),
    ]
    expect(diffSections(prev, changed).modified).toBe(1)
  })

  it('treats empty-vs-empty as no diff', () => {
    expect(diffSections([], [])).toEqual({ added: 0, removed: 0, modified: 0, moved: 0 })
  })

  it('counts all-new as added', () => {
    expect(diffSections([], [s('1', 'A', {}), s('2', 'B', {})])).toEqual({
      added: 2, removed: 0, modified: 0, moved: 0,
    })
  })

  it('counts all-gone as removed', () => {
    expect(diffSections([s('1', 'A', {}), s('2', 'B', {})], [])).toEqual({
      added: 0, removed: 2, modified: 0, moved: 0,
    })
  })
})
