// Pure helper used by EditableText and EditableRichText to render a
// muted "Click to edit <name>" hint when a field's value is empty in
// preview mode. Empty values would otherwise render as zero-content
// elements (an empty `<h3>`, an empty `<div>`) and editors would have
// nothing to click.
//
// The helper derives a friendly label from the LAST segment of
// `field.origin.fieldPath`, stripping any trailing `[N]` index. Examples:
//
//   'title'                            -> 'Click to edit title'
//   'features[0].title'                -> 'Click to edit title'
//   'tiers[2].features[0].label'       -> 'Click to edit label'
//   'body'                             -> 'Click to edit body'
//   ''                                 -> 'Click to edit'
//
// Lives in react/editable/ rather than domain/ — this is a UI affordance,
// not a domain concept.

/**
 * Returns true if a string is empty or contains only whitespace.
 *
 * The placeholder branch in EditableText / EditableRichText must trigger
 * for both `''` and `'   '` so authors don't get a blank-but-technically-
 * non-empty card. This is render-only logic — saved values are unaffected.
 */
export function isBlankString(value: string): boolean {
  return value.trim().length === 0
}

/**
 * Builds a "Click to edit <name>" hint from a field path. See module
 * doc-comment for examples. Pure string manipulation — no schema lookup.
 */
export function placeholderHintFromOrigin(fieldPath: string): string {
  if (fieldPath.length === 0) {
    return 'Click to edit'
  }
  // Split on the final dot to get the last path segment. `'title'` has no
  // dot and falls through with `last === 'title'`.
  const lastDot = fieldPath.lastIndexOf('.')
  const lastSegment = lastDot === -1 ? fieldPath : fieldPath.slice(lastDot + 1)
  // Strip a trailing `[N]` index — `features[0]` -> `features`. We only
  // strip a single trailing index; nested indices like `a[0][1]` are not a
  // valid field-path shape (sectionSchema produces dot-separated paths).
  const cleaned = lastSegment.replace(/\[\d+\]$/, '')
  if (cleaned.length === 0) {
    return 'Click to edit'
  }
  return `Click to edit ${cleaned}`
}

/**
 * Inline style for the placeholder hint span. Muted color and italic so it
 * visually reads as a hint, not as real content (mirrors the visual
 * convention of HTML `<input placeholder>`). Uses a CSS variable with a
 * sensible fallback so themes that define `--color-text-tertiary` win.
 */
export const PLACEHOLDER_HINT_STYLE = {
  color: 'var(--agntcms-admin-fg-dim)',
  fontStyle: 'italic' as const,
}
