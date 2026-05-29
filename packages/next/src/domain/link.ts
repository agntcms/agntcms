// Pure helpers for working with `LinkValue` runtime values.
//
// These functions live in `domain/` because both `runtime/` and
// `react/` need them, and invariant 1 of the project (CLAUDE.md) says
// `react/` may import only from `domain/`. Putting them here keeps the
// arrow direction `domain ← runtime, react` clean.
//
// The helpers are pure: no I/O, no React, no node:* dependencies.
//
// `normalizeLinkValue` is the migration-window adapter: it accepts any
// of the historical link-value shapes (the v0.1 `{ href, label,
// external? }` payload) plus the current discriminated-union shape and
// projects them onto `LinkValue`. It is also the safety net for
// pasted/garbage input — anything unrecognised collapses to a blank
// internal link so consumers never have to handle `unknown` at the
// section-component level.

import type { LinkValue } from './fields'

/**
 * Resolve a `LinkValue` to the href string a section component should
 * render in an `<a>` element.
 *
 * Internal slugs route through the catch-all (`app/[[...slug]]/page.tsx`)
 * so they always live under the site root:
 *   - empty slug or `'home'` → `'/'`
 *   - `'about'`               → `'/about'`
 *   - `'/blog'`               → `'/blog'`   (defensive: strip leading `/`)
 *   - `'blog/welcome'`        → `'/blog/welcome'`
 *
 * External links return their URL verbatim; the validator already
 * enforces the http(s) protocol allow-list, so we don't re-check here.
 *
 * Email links return `mailto:<email>` when the email is non-empty, or
 * `''` when empty — the empty href lets a section component skip the
 * anchor entirely when an author has not yet filled the field.
 *
 * Phone links return `tel:<digits>` with non-`[\d+]` characters
 * stripped from the URI (so parens, spaces, and hyphens that authors
 * type for legibility are removed before emitting `tel:`). The
 * original formatted string stays in `link.phone` for display
 * purposes. Empty phone → `''`, same rationale as email.
 */
export function hrefOf(link: LinkValue): string {
  if (link.type === 'external') return link.url
  if (link.type === 'email') {
    if (link.email === '') return ''
    return 'mailto:' + link.email
  }
  if (link.type === 'phone') {
    if (link.phone === '') return ''
    // Strip everything but digits and a leading `+` for the tel: URI.
    // The original (formatted) string stays in `link.phone` for the
    // display label fallback; only the URI is normalised.
    return 'tel:' + link.phone.replace(/[^\d+]/g, '')
  }
  // Defensive normalisation against legacy or hand-edited content where a
  // leading slash sneaks into the slug. Strip it so we never emit `//`.
  const slug = link.slug.startsWith('/') ? link.slug.slice(1) : link.slug
  if (slug === '' || slug === 'home') return '/'
  return '/' + slug
}

/**
 * True iff the link points outside the current site.
 *
 * Only the `external` branch returns true. `email` and `phone` fire
 * native handlers (mail client, dialler) — they do not navigate to a
 * different site, so they are NOT considered "external" for the
 * purpose of `target='_blank'` / `rel='noreferrer'`. Use
 * `linkAnchorAttrs` to pick the right anchor attributes from a
 * `LinkValue`.
 */
export function isExternalLink(link: LinkValue): boolean {
  return link.type === 'external'
}

/**
 * Canonical helper for translating a `LinkValue` into anchor
 * attributes. Returns the href every link should carry, plus the
 * `target='_blank'` / `rel='noreferrer'` pair only for the `external`
 * branch.
 *
 * Why a single helper instead of letting consumers compose `hrefOf` +
 * `isExternalLink` themselves: the contract for "open in a new tab"
 * has gotten more nuanced as the discriminated union grew. Email and
 * phone hand off to native OS handlers and would behave incorrectly
 * with `target='_blank'` (Safari opens a blank tab that lingers after
 * the mailto handler resolves). Centralising the decision here means
 * marketing-site primitives, custom CTA buttons, navigation menus,
 * and any future link-rendering surface make the same choice.
 *
 * Section authors should prefer:
 *   const attrs = linkAnchorAttrs(link)
 *   <a {...attrs}>{link.label}</a>
 * over manually computing `target` / `rel`.
 */
export function linkAnchorAttrs(
  link: LinkValue,
): { href: string; target?: '_blank'; rel?: 'noreferrer' } {
  const href = hrefOf(link)
  if (link.type === 'external') {
    return { href, target: '_blank', rel: 'noreferrer' }
  }
  return { href }
}

/**
 * Project an arbitrary value into the canonical `LinkValue` shape.
 *
 * Three input cases:
 *   1. Old-shape `{ href, label, external? }`: infer `type` from the
 *      `href` protocol — `mailto:` → email, `tel:` → phone, `http(s):`
 *      → external, otherwise internal. For the internal branch we
 *      strip the leading `/` so the stored slug matches the page-id
 *      model (no leading slash, see `hrefOf`).
 *   2. New-shape `{ type: 'internal' | 'external' | 'email' | 'phone',
 *      … }`: returned as-is, narrowed.
 *   3. Anything else (null, primitives, garbage objects): collapse to
 *      a blank internal link so the renderer can still emit something
 *      and the editor can re-author from a known-good baseline.
 *
 * The function is intentionally lenient: it never throws. A throwing
 * normaliser would push error-handling onto every section component
 * for the rare case of legacy data, defeating the point of the
 * defensive narrowing.
 */
export function normalizeLinkValue(raw: unknown): LinkValue {
  if (raw === null || typeof raw !== 'object') {
    return { type: 'internal', slug: '', label: '' }
  }
  const obj = raw as Record<string, unknown>
  const label = typeof obj['label'] === 'string' ? obj['label'] : ''

  // New-shape — discriminated union. Validate the discriminator and
  // the field expected for that branch; fall through to garbage path
  // if either is missing.
  if (obj['type'] === 'internal') {
    const slug = typeof obj['slug'] === 'string' ? obj['slug'] : ''
    return { type: 'internal', slug, label }
  }
  if (obj['type'] === 'external') {
    const url = typeof obj['url'] === 'string' ? obj['url'] : ''
    return { type: 'external', url, label }
  }
  if (obj['type'] === 'email') {
    const email = typeof obj['email'] === 'string' ? obj['email'] : ''
    return { type: 'email', email, label }
  }
  if (obj['type'] === 'phone') {
    const phone = typeof obj['phone'] === 'string' ? obj['phone'] : ''
    return { type: 'phone', phone, label }
  }

  // Old-shape — `{ href, label, external? }`. The `external` flag in
  // the legacy data is unreliable (most authors never set it), so we
  // re-derive `type` from the protocol. This mirrors what the editor
  // would have rendered when displaying the legacy link.
  if (typeof obj['href'] === 'string') {
    const href = obj['href']
    if (/^mailto:/i.test(href)) {
      return { type: 'email', email: href.slice('mailto:'.length), label }
    }
    if (/^tel:/i.test(href)) {
      return { type: 'phone', phone: href.slice('tel:'.length), label }
    }
    if (/^https?:\/\//i.test(href)) {
      return { type: 'external', url: href, label }
    }
    // Internal: strip a leading `/` so the stored slug stays in the
    // canonical "no-leading-slash" form. `hrefOf` puts the slash back.
    const slug = href.startsWith('/') ? href.slice(1) : href
    return { type: 'internal', slug, label }
  }

  // Garbage — return a blank internal link.
  return { type: 'internal', slug: '', label: '' }
}
