import type { Page } from './page'

// Section ids must be unique within a page. This is a fundamental invariant
// — live editing addresses a field by (page slug, section id, field path),
// and a duplicated id would make that address ambiguous. Keeping the check
// here (in `domain/`) means every layer can rely on it without pulling in
// runtime or storage code.

/**
 * Returns `true` when every `section.id` in the page appears exactly once.
 * Empty `sections` arrays are trivially unique.
 */
export function hasUniqueSectionIds(page: Page): boolean {
  const seen = new Set<string>()
  for (const section of page.sections) {
    if (seen.has(section.id)) return false
    seen.add(section.id)
  }
  return true
}
