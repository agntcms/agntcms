import { describe, it, expect } from 'vitest'
import { hasUniqueSectionIds } from './invariants'
import type { Page } from './page'
import type { Section } from './section'

function section(id: string, type = 'Hero'): Section {
  return { id, type, data: {} }
}

function page(sections: Section[]): Page {
  return { slug: '/', seo: { title: 'p', description: 'p' }, sections }
}

describe('hasUniqueSectionIds', () => {
  it('returns true for an empty page', () => {
    expect(hasUniqueSectionIds(page([]))).toBe(true)
  })

  it('returns true when every id is distinct', () => {
    expect(
      hasUniqueSectionIds(page([section('a'), section('b'), section('c')])),
    ).toBe(true)
  })

  it('returns false when two sections share an id', () => {
    expect(
      hasUniqueSectionIds(page([section('a'), section('b'), section('a')])),
    ).toBe(false)
  })

  it('returns false when adjacent sections share an id', () => {
    expect(hasUniqueSectionIds(page([section('x'), section('x')]))).toBe(false)
  })

  it('distinguishes ids that differ only by type', () => {
    // Two sections can have the same `type` and different ids; that is fine.
    // This guards against an accidental implementation that keyed on `type`.
    expect(
      hasUniqueSectionIds(
        page([section('a', 'Hero'), section('b', 'Hero')]),
      ),
    ).toBe(true)
  })
})
