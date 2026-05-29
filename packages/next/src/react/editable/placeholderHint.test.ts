import { describe, it, expect } from 'vitest'
import {
  isBlankString,
  placeholderHintFromOrigin,
  PLACEHOLDER_HINT_STYLE,
} from './placeholderHint'

describe('isBlankString', () => {
  it('returns true for the empty string', () => {
    expect(isBlankString('')).toBe(true)
  })

  it('returns true for whitespace-only strings', () => {
    expect(isBlankString('   ')).toBe(true)
    expect(isBlankString('\n\t  ')).toBe(true)
  })

  it('returns false for any non-whitespace content', () => {
    expect(isBlankString('a')).toBe(false)
    expect(isBlankString('  hello  ')).toBe(false)
  })
})

describe('placeholderHintFromOrigin', () => {
  // The five cases from the task spec — these lock the contract that the
  // hint always reads "Click to edit <last-segment>" with any trailing
  // `[N]` index stripped.

  it('"title" -> "Click to edit title"', () => {
    expect(placeholderHintFromOrigin('title')).toBe('Click to edit title')
  })

  it('"features[0].title" -> "Click to edit title"', () => {
    expect(placeholderHintFromOrigin('features[0].title')).toBe(
      'Click to edit title',
    )
  })

  it('"tiers[2].features[0].label" -> "Click to edit label"', () => {
    expect(placeholderHintFromOrigin('tiers[2].features[0].label')).toBe(
      'Click to edit label',
    )
  })

  it('"body" -> "Click to edit body"', () => {
    expect(placeholderHintFromOrigin('body')).toBe('Click to edit body')
  })

  it('empty string -> "Click to edit"', () => {
    expect(placeholderHintFromOrigin('')).toBe('Click to edit')
  })

  it('strips trailing [N] when the path is just an indexed segment', () => {
    // Defensive: a path ending in `[0]` with no preceding name (unlikely
    // but legal as a string) falls through to the "no name" fallback
    // rather than producing "Click to edit ".
    expect(placeholderHintFromOrigin('items[0]')).toBe('Click to edit items')
  })
})

describe('PLACEHOLDER_HINT_STYLE', () => {
  it('uses italic font style', () => {
    expect(PLACEHOLDER_HINT_STYLE.fontStyle).toBe('italic')
  })

  it('uses a muted color via the admin token namespace', () => {
    // The admin namespace is guaranteed to be present at render time by
    // AdminThemeBoot (mounted by PreviewProvider in preview mode), so no
    // fallback hex is needed — and including one would let host project
    // tokens "win" if the boot ever fails to inject.
    expect(PLACEHOLDER_HINT_STYLE.color).toContain('--agntcms-admin-fg-dim')
  })
})
