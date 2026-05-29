// applyLinePrefix — pure helper for the markdown editor's "prefix every
// selected line" toolbar buttons (H1/H2/H3, bullet list, numbered list,
// quote).
//
// Extracted from MarkdownEditorModal so the line-handling rules are
// unit-testable without a textarea / jsdom. The modal owns the
// textarea-specific glue (selection -> setSelectionRange); this helper
// is a pure string transform.
//
// Two rules:
//   1. Lines that are empty or whitespace-only never receive a prefix.
//      An orphan `# ` / `> ` / `1. ` on a blank line is visual noise
//      and, for list prefixes, breaks the renderer's
//      ≥2-consecutive-matching-lines rule.
//   2. For LIST prefixes (`- ` and `1. `) we additionally drop the blank
//      lines from the output, so multi-paragraph selections collapse
//      into consecutive list items that the renderer recognizes as a
//      real <ul>/<ol>. For non-list prefixes (headings, quote) blank
//      lines are preserved in place so paragraph spacing survives.
//
// Detection of "list prefix" is by exact string match against the two
// known toolbar inputs (`- ` and `1. `). The toolbar is the only caller
// and we control the inputs, so a regex would be over-engineered.

export interface ApplyLinePrefixResult {
  readonly text: string
  readonly selectionStart: number
  readonly selectionEnd: number
}

/**
 * Prefix every non-blank line in the [start, end) range of `text` with
 * `prefix`, expanding the range to whole-line boundaries. The returned
 * `selectionStart` / `selectionEnd` cover the rewritten block so callers
 * can re-select it for a clean undo and visual confirmation.
 *
 * - Blank or whitespace-only lines never receive a prefix (Rule 1).
 * - When `prefix` is a list marker (`- ` or `1. `), blank lines are also
 *   dropped from the output (Rule 2) so list items end up consecutive.
 *
 * Empty input with cursor at 0 returns just the prefix — preserves the
 * pre-existing behavior for the empty-textarea case.
 */
export function applyLinePrefix(
  text: string,
  start: number,
  end: number,
  prefix: string,
): ApplyLinePrefixResult {
  // Expand `start` back to the beginning of its line.
  const lineStart = (() => {
    const nl = text.lastIndexOf('\n', start - 1)
    return nl === -1 ? 0 : nl + 1
  })()
  // Expand `end` forward to the end of its line. When the user selected
  // through a trailing newline (i.e. `end` points at the char AFTER a
  // `\n`), step back so we don't accidentally treat the next line as
  // part of the selection.
  const effectiveEnd = end > start && text[end - 1] === '\n' ? end - 1 : end
  const lineEnd = (() => {
    const nl = text.indexOf('\n', effectiveEnd)
    return nl === -1 ? text.length : nl
  })()

  const block = text.substring(lineStart, lineEnd)
  const isListPrefix = prefix === '- ' || prefix === '1. '

  const lines = block.split('\n')
  // Single-line block (no `\n` inside) — we always emit the prefix even
  // if the line is blank. Two reasons: (a) clicking a toolbar button on
  // an empty textarea / empty line is a natural "start typing here"
  // gesture, and (b) this preserves the pre-fix behavior for that
  // common case. The blank-suppression rules only fire in multi-line
  // selections, where orphan markers on internal blank lines are the
  // actual UX problem.
  const isSingleLine = lines.length === 1
  // For the numbered-list prefix, emit visible sequential numbers
  // (`1. `, `2. `, ...) in the source. The renderer accepts both
  // identical and incrementing markers per CommonMark, but readable
  // source is much easier to scan when re-editing. Counter advances
  // only for emitted (non-blank) lines, so dropped blanks don't
  // consume a number. Always starts at 1 so re-clicking the toolbar
  // doesn't produce surprising offsets.
  const isNumberedList = prefix === '1. '
  let counter = 1
  const transformed: string[] = []
  for (const line of lines) {
    const isBlank = line.trim().length === 0
    if (isBlank && !isSingleLine) {
      // Rule 2: drop blanks for list prefixes so list items become
      // consecutive and qualify under the renderer's ≥2-line rule.
      if (isListPrefix) continue
      // Rule 1: keep blank in place for non-list prefixes, no marker.
      transformed.push(line)
      continue
    }
    const linePrefix = isNumberedList ? `${counter}. ` : prefix
    if (isNumberedList) counter += 1
    transformed.push(linePrefix + line)
  }
  const prefixed = transformed.join('\n')

  const newText = text.substring(0, lineStart) + prefixed + text.substring(lineEnd)
  return {
    text: newText,
    selectionStart: lineStart,
    selectionEnd: lineStart + prefixed.length,
  }
}
