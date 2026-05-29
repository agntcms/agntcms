import { describe, it, expect } from 'vitest'
import { findCurrentHistoryEntryIndex } from './currentHistoryEntry'
import type { Global, Page, Section } from '../../domain/index'

function section(id: string, type: string, data: Record<string, unknown>): Section {
  return { id, type, data }
}

function page(slug: string, sections: readonly Section[]): Page {
  return { slug, seo: { title: slug, description: slug }, sections }
}

describe('findCurrentHistoryEntryIndex', () => {
  it('returns -1 when there is no currently-published page', () => {
    const entries = [{ timestamp: 'a' }, { timestamp: 'b' }]
    const bodies = {
      a: page('p', [section('1', 'H', {})]),
      b: page('p', [section('1', 'H', {})]),
    }
    expect(findCurrentHistoryEntryIndex(entries, bodies, null)).toBe(-1)
  })

  it('returns -1 when history is empty', () => {
    const current = page('p', [section('1', 'H', { t: 'x' })])
    expect(findCurrentHistoryEntryIndex([], {}, current)).toBe(-1)
  })

  it('returns the index of the only entry that matches current', () => {
    const current = page('p', [section('1', 'H', { t: 'x' })])
    const entries = [
      { timestamp: 'new' },
      { timestamp: 'mid' },
      { timestamp: 'old' },
    ]
    const bodies = {
      new: page('p', [section('1', 'H', { t: 'x' })]),
      mid: page('p', [section('1', 'H', { t: 'y' })]),
      old: page('p', [section('1', 'H', { t: 'z' })]),
    }
    expect(findCurrentHistoryEntryIndex(entries, bodies, current)).toBe(0)
  })

  it('returns -1 when no entry deep-equals current', () => {
    const current = page('p', [section('1', 'H', { t: 'now' })])
    const entries = [{ timestamp: 'a' }, { timestamp: 'b' }]
    const bodies = {
      a: page('p', [section('1', 'H', { t: 'a' })]),
      b: page('p', [section('1', 'H', { t: 'b' })]),
    }
    expect(findCurrentHistoryEntryIndex(entries, bodies, current)).toBe(-1)
  })

  it('picks the newest entry when duplicates exist (newest-first order)', () => {
    // Legacy data case: two identical snapshots — e.g. seed + rollback —
    // both deep-equal the current page. Entries arrive newest-first.
    const current = page('p', [section('1', 'H', { t: 'same' })])
    const entries = [
      { timestamp: 'newer' },
      { timestamp: 'older' },
    ]
    const bodies = {
      newer: page('p', [section('1', 'H', { t: 'same' })]),
      older: page('p', [section('1', 'H', { t: 'same' })]),
    }
    expect(findCurrentHistoryEntryIndex(entries, bodies, current)).toBe(0)
  })

  it('matches despite deeply-nested equal data', () => {
    const current = page('p', [
      section('1', 'H', { list: [{ n: 1 }, { n: 2 }] }),
    ])
    const entries = [{ timestamp: 't' }]
    const bodies = {
      t: page('p', [section('1', 'H', { list: [{ n: 1 }, { n: 2 }] })]),
    }
    expect(findCurrentHistoryEntryIndex(entries, bodies, current)).toBe(0)
  })

  it('distinguishes section order (order matters for equality)', () => {
    const current = page('p', [
      section('1', 'A', {}),
      section('2', 'B', {}),
    ])
    const entries = [{ timestamp: 'reordered' }]
    const bodies = {
      reordered: page('p', [section('2', 'B', {}), section('1', 'A', {})]),
    }
    expect(findCurrentHistoryEntryIndex(entries, bodies, current)).toBe(-1)
  })

  it('considers seo metadata when comparing', () => {
    const current: Page = {
      slug: 'p',
      seo: { title: 'New', description: 'd' },
      sections: [section('1', 'H', {})],
    }
    const entries = [{ timestamp: 'a' }, { timestamp: 'b' }]
    const bodies: Record<string, Page> = {
      a: { slug: 'p', seo: { title: 'Old', description: 'd' }, sections: [section('1', 'H', {})] },
      b: { slug: 'p', seo: { title: 'New', description: 'd' }, sections: [section('1', 'H', {})] },
    }
    expect(findCurrentHistoryEntryIndex(entries, bodies, current)).toBe(1)
  })

  it('works for Global bodies (generic over body type)', () => {
    // Globals carry { name, type, data } — the helper's deep-equal
    // comparison treats them the same way as pages. This guards the
    // generalization away from a Page-specific signature.
    const current: Global = {
      name: 'header',
      type: 'Header',
      data: { title: 'Now', link: { slug: '/home' } },
    }
    const entries = [
      { timestamp: 'newer' },
      { timestamp: 'older' },
    ]
    const bodies: Record<string, Global> = {
      newer: {
        name: 'header',
        type: 'Header',
        data: { title: 'Now', link: { slug: '/home' } },
      },
      older: {
        name: 'header',
        type: 'Header',
        data: { title: 'Then', link: { slug: '/home' } },
      },
    }
    expect(findCurrentHistoryEntryIndex(entries, bodies, current)).toBe(0)
  })

  it('skips entries whose bodies have not yet loaded', () => {
    // If the newest entry's body isn't in `bodies` yet, we should not
    // throw; we move on and look at the next entry.
    const current = page('p', [section('1', 'H', { t: 'same' })])
    const entries = [{ timestamp: 'pending' }, { timestamp: 'loaded' }]
    const bodies = {
      // 'pending' intentionally absent
      loaded: page('p', [section('1', 'H', { t: 'same' })]),
    }
    expect(findCurrentHistoryEntryIndex(entries, bodies, current)).toBe(1)
  })
})
