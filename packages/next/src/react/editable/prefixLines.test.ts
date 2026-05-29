import { describe, it, expect } from 'vitest'
import { applyLinePrefix } from './prefixLines'

describe('applyLinePrefix', () => {
  // ---------------------------------------------------------------------------
  // Rule 1: blank / whitespace-only lines never get a prefix.
  // Rule 2: for list prefixes (`- ` and `1. `), blank lines are dropped.
  // ---------------------------------------------------------------------------

  it('prefixes a single non-empty line with `# `', () => {
    const text = 'hello'
    const result = applyLinePrefix(text, 0, text.length, '# ')
    expect(result.text).toBe('# hello')
    expect(result.selectionStart).toBe(0)
    expect(result.selectionEnd).toBe('# hello'.length)
  })

  it('emits sequential numbers for a multi-line non-empty `1. ` selection', () => {
    // Toolbar input is the literal `1. `; emit visible incrementing
    // numbers so the source pane is readable.
    const text = 'a\nb\nc'
    const result = applyLinePrefix(text, 0, text.length, '1. ')
    expect(result.text).toBe('1. a\n2. b\n3. c')
    expect(result.selectionStart).toBe(0)
    expect(result.selectionEnd).toBe(result.text.length)
  })

  it('drops the blank line and continues the counter on the next non-blank line for `1. `', () => {
    // The dropped blank does NOT consume a number — the second
    // emitted line is `2. `, not `3. `.
    const text = 'paragraph one\n\nparagraph two'
    const result = applyLinePrefix(text, 0, text.length, '1. ')
    expect(result.text).toBe('1. paragraph one\n2. paragraph two')
    // After Rule 2 the block shrinks, so the new selectionEnd matches
    // the post-transform length.
    expect(result.selectionStart).toBe(0)
    expect(result.selectionEnd).toBe(result.text.length)
  })

  it('drops the blank line between two paragraphs when the prefix is `- `', () => {
    const text = 'paragraph one\n\nparagraph two'
    const result = applyLinePrefix(text, 0, text.length, '- ')
    expect(result.text).toBe('- paragraph one\n- paragraph two')
  })

  it('preserves the blank line in place when the prefix is `# `', () => {
    // Non-list prefixes keep paragraph spacing (Rule 1 only — blank
    // line stays blank, no marker added to it).
    const text = 'paragraph one\n\nparagraph two'
    const result = applyLinePrefix(text, 0, text.length, '# ')
    expect(result.text).toBe('# paragraph one\n\n# paragraph two')
  })

  it('preserves the blank line in place when the prefix is `> `', () => {
    const text = 'paragraph one\n\nparagraph two'
    const result = applyLinePrefix(text, 0, text.length, '> ')
    expect(result.text).toBe('> paragraph one\n\n> paragraph two')
  })

  it('treats a whitespace-only line the same as an empty line', () => {
    // For non-list prefixes, the whitespace-only line is preserved
    // verbatim (no prefix added).
    const text = 'a\n   \nb'
    const result = applyLinePrefix(text, 0, text.length, '# ')
    expect(result.text).toBe('# a\n   \n# b')
  })

  it('drops a whitespace-only line for list prefixes', () => {
    const text = 'a\n   \nb'
    const result = applyLinePrefix(text, 0, text.length, '1. ')
    // Counter advances only for emitted lines: `1. ` then `2. `.
    expect(result.text).toBe('1. a\n2. b')
  })

  it('returns just the prefix when the input is empty (cursor at 0,0)', () => {
    // Pre-existing behavior: empty textarea + click toolbar inserts
    // the marker so the user can start typing right after.
    const result = applyLinePrefix('', 0, 0, '1. ')
    expect(result.text).toBe('1. ')
    expect(result.selectionStart).toBe(0)
    expect(result.selectionEnd).toBe('1. '.length)
  })

  it('expands a partial in-line selection to whole-line boundaries', () => {
    // Caret in the middle of "two" — the whole "two" line gets the
    // prefix, not just the selected substring.
    const text = 'one\ntwo\nthree'
    const start = text.indexOf('w')
    const result = applyLinePrefix(text, start, start, '# ')
    expect(result.text).toBe('one\n# two\nthree')
  })

  it('handles a selection that ends right after a newline without eating the next line', () => {
    // `end` points at the char AFTER the `\n` between "one" and "two".
    // Only "one" should be prefixed.
    const text = 'one\ntwo\nthree'
    const end = text.indexOf('\n') + 1
    const result = applyLinePrefix(text, 0, end, '# ')
    expect(result.text).toBe('# one\ntwo\nthree')
  })
})
