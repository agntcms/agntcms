import { describe, it, expect } from 'vitest'
import { sectionDiffStatus } from './sectionDiffStatus'
import type { Section } from '../../domain/index'

function s(id: string, type: string, data: Record<string, unknown>): Section {
  return { id, type, data }
}

describe('sectionDiffStatus', () => {
  it('marks every section unchanged when baseline and target are identical', () => {
    const a = [s('1', 'Hero', { t: 'x' }), s('2', 'Text', { b: 'y' })]
    const r = sectionDiffStatus(a, a)
    expect(r.statusById.get('1')).toBe('unchanged')
    expect(r.statusById.get('2')).toBe('unchanged')
    expect(r.removedInTarget).toEqual([])
  })

  it('marks sections present only in target as added', () => {
    const baseline = [s('1', 'Hero', {})]
    const target = [s('1', 'Hero', {}), s('2', 'Text', {})]
    const r = sectionDiffStatus(baseline, target)
    expect(r.statusById.get('1')).toBe('unchanged')
    expect(r.statusById.get('2')).toBe('added')
    expect(r.removedInTarget).toEqual([])
  })

  it('reports sections only in baseline under removedInTarget', () => {
    const baseline = [
      s('keep', 'A', {}),
      s('gone', 'B', {}),
      s('also-gone', 'C', {}),
    ]
    const target = [s('keep', 'A', {})]
    const r = sectionDiffStatus(baseline, target)
    expect(r.statusById.get('keep')).toBe('unchanged')
    // Preserves baseline order.
    expect(r.removedInTarget).toEqual([
      { id: 'gone', type: 'B' },
      { id: 'also-gone', type: 'C' },
    ])
    // Removed ids are NOT in statusById.
    expect(r.statusById.has('gone')).toBe(false)
    expect(r.statusById.has('also-gone')).toBe(false)
  })

  it('marks sections with same id but differing data as modified', () => {
    const baseline = [s('1', 'Hero', { title: 'old' })]
    const target = [s('1', 'Hero', { title: 'new' })]
    const r = sectionDiffStatus(baseline, target)
    expect(r.statusById.get('1')).toBe('modified')
  })

  it('marks reordered sections as moved', () => {
    const baseline = [s('1', 'A', {}), s('2', 'B', {}), s('3', 'C', {})]
    const target = [s('2', 'B', {}), s('1', 'A', {}), s('3', 'C', {})]
    const r = sectionDiffStatus(baseline, target)
    expect(r.statusById.get('1')).toBe('moved')
    expect(r.statusById.get('2')).toBe('moved')
    // id 3 is at kept-index 2 in both → unchanged.
    expect(r.statusById.get('3')).toBe('unchanged')
  })

  it('prefers modified over moved when both apply to the same section', () => {
    // Baseline order: [a, b]. Target order: [b', a] where b' has different data.
    // b is both moved (idx 1 → 0) and modified — per contract it must report
    // as "modified".
    const baseline = [s('a', 'A', {}), s('b', 'B', { v: 1 })]
    const target = [s('b', 'B', { v: 2 }), s('a', 'A', {})]
    const r = sectionDiffStatus(baseline, target)
    expect(r.statusById.get('b')).toBe('modified')
    // 'a' only moved.
    expect(r.statusById.get('a')).toBe('moved')
  })

  it('does not mark stable ids as moved when others are added or removed', () => {
    // Only 'a' is kept; baseline has a trailing removed item, target has a
    // leading added item. 'a' stays at kept-index 0 in both → unchanged.
    const baseline = [s('a', 'A', {}), s('removed', 'X', {})]
    const target = [s('added', 'Y', {}), s('a', 'A', {})]
    const r = sectionDiffStatus(baseline, target)
    expect(r.statusById.get('a')).toBe('unchanged')
    expect(r.statusById.get('added')).toBe('added')
    expect(r.removedInTarget).toEqual([{ id: 'removed', type: 'X' }])
  })

  it('handles deep-equal nested data as unchanged', () => {
    const baseline = [s('1', 'X', { list: [1, { n: 'a' }] })]
    const target = [s('1', 'X', { list: [1, { n: 'a' }] })]
    expect(sectionDiffStatus(baseline, target).statusById.get('1')).toBe(
      'unchanged',
    )
  })

  it('handles empty baseline (all target sections are added)', () => {
    const r = sectionDiffStatus([], [s('1', 'A', {}), s('2', 'B', {})])
    expect(r.statusById.get('1')).toBe('added')
    expect(r.statusById.get('2')).toBe('added')
    expect(r.removedInTarget).toEqual([])
  })

  it('handles empty target (everything in baseline is removed)', () => {
    const r = sectionDiffStatus([s('1', 'A', {}), s('2', 'B', {})], [])
    expect(r.statusById.size).toBe(0)
    expect(r.removedInTarget).toEqual([
      { id: '1', type: 'A' },
      { id: '2', type: 'B' },
    ])
  })

  it('statusById iteration order matches target order', () => {
    const baseline = [s('a', 'A', {}), s('b', 'B', {})]
    const target = [s('new', 'N', {}), s('b', 'B', {}), s('a', 'A', {})]
    const r = sectionDiffStatus(baseline, target)
    expect(Array.from(r.statusById.keys())).toEqual(['new', 'b', 'a'])
  })
})
