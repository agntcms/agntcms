// Canonical CMS-backed system pages. These slugs are intentionally
// ordinary content pages so editors can change the rendered UI without
// patching framework files.

export const NOT_FOUND_PAGE_SLUG = '404'
export const SERVER_ERROR_PAGE_SLUG = '500'

const SITEMAP_EXCLUDED_TERMINAL_SLUGS = new Set([
  NOT_FOUND_PAGE_SLUG,
  SERVER_ERROR_PAGE_SLUG,
  'not-found',
  '_not-found',
])

const SYSTEM_PAGE_ALIAS_TO_CANONICAL = new Map<string, string>([
  ['not-found', NOT_FOUND_PAGE_SLUG],
  ['_not-found', NOT_FOUND_PAGE_SLUG],
  ['error-404', NOT_FOUND_PAGE_SLUG],
  ['404-page', NOT_FOUND_PAGE_SLUG],
  ['page-not-found', NOT_FOUND_PAGE_SLUG],
  ['error-500', SERVER_ERROR_PAGE_SLUG],
  ['500-page', SERVER_ERROR_PAGE_SLUG],
  ['server-error', SERVER_ERROR_PAGE_SLUG],
])

export interface ReservedPageSlugViolation {
  readonly slug: string
  readonly canonicalSlug: string
  readonly message: string
}

export const getReservedPageSlugViolation = (
  slug: string,
): ReservedPageSlugViolation | null => {
  const canonicalSlug = SYSTEM_PAGE_ALIAS_TO_CANONICAL.get(slug)
  if (!canonicalSlug) return null

  const pageLabel =
    canonicalSlug === NOT_FOUND_PAGE_SLUG ? '404 page' : '500 page'

  return {
    slug,
    canonicalSlug,
    message:
      `Slug "${slug}" is reserved as an alias for the ${pageLabel}. ` +
      `Edit the canonical "${canonicalSlug}" page instead.`,
  }
}

export const isSitemapEligibleSlug = (slug: string): boolean => {
  const terminal = slug.split('/').at(-1)
  if (!terminal) return false

  return !SITEMAP_EXCLUDED_TERMINAL_SLUGS.has(terminal)
}
