// Shared link-value validators.
//
// Four pure helpers, one per branch of the `LinkValue` discriminated
// union (see `domain/fields.ts`):
//
//   - `validateInternalSlug` — applied to the slug stored on an
//     `{ type: 'internal', slug, label }` value. Empty string is
//     "incomplete but not invalid" so the editor can flag the empty
//     state in its own way; non-empty slugs must match the
//     storage-layer slug grammar (see below).
//
//   - `validateExternalUrl` — applied to the URL stored on an
//     `{ type: 'external', url, label }` value. Empty string is
//     "incomplete but not invalid"; non-empty must parse as an
//     absolute http(s) URL.
//
//   - `validateEmail` — applied to the email stored on an
//     `{ type: 'email', email, label }` value. Empty string is
//     "incomplete but not invalid"; non-empty must match a basic
//     "looks like an email address" regex.
//
//   - `validatePhone` — applied to the phone string stored on an
//     `{ type: 'phone', phone, label }` value. Empty string is
//     "incomplete but not invalid"; non-empty must contain at least
//     seven digits after stripping non-`[\d+]` characters. We do not
//     validate country codes or formatting — the editor wants
//     forgiving acceptance of authored strings.
//
// Lives in `domain/` because both `runtime/` and `react/` need to
// consume it: invariant 1 of the project (CLAUDE.md) says `react/`
// may import only from `domain/` (and type-only from `runtime/`), so
// a runtime-side helper is unreachable from the editor. Putting the
// rule in `domain/` makes it available to both sides without
// inverting the dependency graph.
//
// Allow-list policy for external URLs (intentionally restrictive — link
// values eventually surface in editor UIs and may render as anchor
// `href`s, so dangerous schemes must not survive validation):
//
//   - Absolute URL with `http:` or `https:` ONLY.
//
// Everything else is rejected, including `javascript:`, `data:`,
// `file:`, `mailto:`, `tel:`, `ftp:`, `vbscript:`, `chrome:`,
// `about:`, and protocol-relative `//foo` URLs.
//
// Slug grammar: lowercase letters, digits, hyphens, slashes — same
// shape as page slugs in the FS content adapter. No leading or trailing
// slash, no double slashes, no `..` traversal, no protocol prefixes.
//
// Returns `null` on valid input, otherwise a short human-readable
// error string.

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-/]*[a-z0-9])?$/

/**
 * Validate the slug stored on an internal `LinkValue`.
 *
 * Returns `null` when valid (including the empty string, which the
 * editor renders as "not yet selected"), an error message otherwise.
 */
export const validateInternalSlug = (slug: string): string | null => {
  // Empty is intentionally treated as "incomplete, not invalid" — the
  // editor flags the empty-state with its own affordance (the page
  // picker placeholder) so we don't surface a redundant error here.
  if (slug === '') return null

  // Reject anything that resembles an external URL. These are common
  // paste mistakes when an author switches between internal/external
  // and we want the failure visible immediately.
  if (/^https?:\/\//i.test(slug)) return 'slug must not include a protocol'
  if (slug.startsWith('//')) return 'slug must not start with //'
  if (slug.startsWith('/')) return 'slug must not start with /'
  if (slug.endsWith('/')) return 'slug must not end with /'
  if (slug.includes('//')) return 'slug must not contain //'
  if (slug.includes('..')) return 'slug must not contain ..'

  if (!SLUG_PATTERN.test(slug)) {
    return 'slug must use lowercase letters, digits, hyphens, and slashes only'
  }
  return null
}

/**
 * Validate the URL stored on an external `LinkValue`.
 *
 * Returns `null` when valid (including the empty string, which the
 * editor renders as "not yet entered"), an error message otherwise.
 *
 * Only absolute http(s) URLs pass. Site-relative paths belong to the
 * internal branch — if the author types `/about`, they should switch
 * the segmented control to "Internal" and enter `about` instead.
 */
export const validateExternalUrl = (url: string): string | null => {
  if (url === '') return null
  if (typeof url !== 'string') return 'URL must be a string'

  if (!/^https?:\/\//i.test(url)) {
    return 'External link must start with http:// or https://'
  }

  try {
    // `new URL` throws on malformed input. Use globalThis.URL so this
    // file stays free of node lib types.
    const parsed = new (globalThis as {
      URL: new (input: string) => { protocol: string }
    }).URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'External link must use http or https'
    }
  } catch {
    return 'External link is not a valid URL'
  }
  return null
}

// Basic "looks like an email" pattern. We deliberately do NOT use the
// full RFC 5322 grammar — that pattern is famously unreadable, would
// reject many strings real authors paste, and the editor is not the
// last line of defence (anything submitted to a real mail server gets
// validated there). What we DO need is to reject the obvious junk
// (whitespace, missing `@`, missing TLD-ish suffix) so the inline
// error fires before save.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Validate the email stored on an `email` `LinkValue`.
 *
 * Returns `null` when valid (including the empty string, which the
 * editor renders as "not yet entered"), an error message otherwise.
 */
export const validateEmail = (email: string): string | null => {
  if (email === '') return null
  if (typeof email !== 'string') return 'Invalid email address'
  if (!EMAIL_PATTERN.test(email)) return 'Invalid email address'
  return null
}

/**
 * Validate the phone string stored on a `phone` `LinkValue`.
 *
 * Returns `null` when valid (including the empty string, which the
 * editor renders as "not yet entered"). Non-empty input must contain
 * at least seven digits after stripping every character that is
 * neither a digit nor a leading `+`. Country-code structure is not
 * validated — it's overkill for v1 and would reject authored strings
 * that real-world dialler apps handle fine.
 */
export const validatePhone = (phone: string): string | null => {
  if (phone === '') return null
  if (typeof phone !== 'string') return 'Phone number is too short'
  // Strip parens, hyphens, spaces — anything except digits and `+` —
  // then count digits. The same `tel:` URI normalisation runs in
  // `hrefOf`, so the validator counts what the URI would carry.
  const digits = phone.replace(/[^\d+]/g, '').replace(/\+/g, '')
  if (digits.length < 7) return 'Phone number is too short'
  return null
}
