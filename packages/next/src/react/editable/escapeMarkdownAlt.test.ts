import { describe, it, expect } from 'vitest'
import { escapeMarkdownAlt } from './escapeMarkdownAlt'
import { renderMarkdown } from './renderMarkdown'

describe('escapeMarkdownAlt', () => {
  it('returns plain text with no special chars unchanged', () => {
    expect(escapeMarkdownAlt('hello world')).toBe('hello world')
  })

  it('escapes a single `]`', () => {
    expect(escapeMarkdownAlt(']')).toBe('\\]')
  })

  it('escapes every `]` in input with multiple occurrences', () => {
    expect(escapeMarkdownAlt(']]]')).toBe('\\]\\]\\]')
  })

  it('escapes a single `\\` to `\\\\`', () => {
    expect(escapeMarkdownAlt('\\')).toBe('\\\\')
  })

  // The order trap: backslash MUST be escaped first. If `]` were escaped
  // first, the `\\` produced as part of `\\]` would be double-escaped to
  // `\\\\]` on the second pass.
  it('escapes `\\]` as `\\\\\\]` (backslash first, then bracket)', () => {
    // Input is two characters: backslash, close-bracket.
    const input = '\\]'
    // Output is four characters: backslash, backslash, backslash, close-bracket.
    // After backslash pass: `\\\\]` (4 chars: `\`, `\`, `\`, `]`).
    // After bracket pass:   `\\\\\\]` (5 chars in JS string literal,
    //                       4 actual chars: `\\`, `\\`, `\\`, `\]` — i.e.
    //                       backslash, backslash, backslash-close-bracket).
    // In a JS string literal that's `'\\\\\\]'`.
    expect(escapeMarkdownAlt(input)).toBe('\\\\\\]')
  })

  it('handles a mixed string with backslashes and brackets in arbitrary positions', () => {
    // `foo\]bar]baz\` → backslash pass first turns each `\` into `\\`,
    // then bracket pass turns each `]` into `\]`.
    // Step 1: `foo\\\]bar]baz\\` (each `\` → `\\`).
    // Step 2: `foo\\\\\]bar\]baz\\` (each `]` → `\]`).
    expect(escapeMarkdownAlt('foo\\]bar]baz\\')).toBe('foo\\\\\\]bar\\]baz\\\\')
  })

  it('returns empty string for empty input', () => {
    expect(escapeMarkdownAlt('')).toBe('')
  })

  // Integration check: confirms the escape strategy is the inverse of
  // renderMarkdown's image-alt parsing. Pick an alt with both `\` and `]`
  // — the two characters that can break the `![alt](src)` opener — and
  // verify they round-trip back as literal text in the rendered <img alt>.
  it('round-trips through renderMarkdown for an alt containing `\\` and `]`', () => {
    const alt = 'weird \\] alt'
    const md = `![${escapeMarkdownAlt(alt)}](/assets/x.png)`
    const html = renderMarkdown(md)
    // The renderer escapes the alt text via htmlEscape before emitting,
    // so what we expect in the HTML is the htmlEscape'd literal alt. None
    // of our chars (`\`, `]`, space, letters) are HTML-significant, so
    // the literal alt appears verbatim inside the alt="..." attribute.
    expect(html).toContain(`alt="${alt}"`)
    expect(html).toContain('src="/assets/x.png"')
  })
})
