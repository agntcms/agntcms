// escapeMarkdownAlt — escape markdown image alt text before emitting `![alt](src)`.
//
// Extracted from MarkdownEditorModal so the escape order can be unit-tested
// without dragging in the React modal. Internal helper, NOT re-exported from
// the editable/ barrel.
//
// Order matters: backslash MUST be escaped first, otherwise the second pass
// (`]` → `\]`) would double-escape the backslash we just inserted. `]` is in
// renderMarkdown's ESCAPABLE_RE, so `\]` round-trips back to a literal `]`
// in the rendered preview.

/**
 * Escape `\` and `]` in markdown image alt text. The two characters that can
 * break out of an `![...]` opener are `\` (escape introducer) and `]` (closer);
 * everything else inside `[...]` is treated literally by `renderMarkdown`'s
 * image regex.
 */
export function escapeMarkdownAlt(alt: string): string {
  return alt.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
}
