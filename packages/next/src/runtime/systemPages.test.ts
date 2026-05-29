import { describe, expect, it } from 'vitest'

import {
  NOT_FOUND_PAGE_SLUG,
  SERVER_ERROR_PAGE_SLUG,
  getReservedPageSlugViolation,
  isSitemapEligibleSlug,
} from './systemPages'

describe('system page helpers', () => {
  it('maps common error-page aliases to their canonical slugs', () => {
    expect(getReservedPageSlugViolation('error-404')).toMatchObject({
      canonicalSlug: NOT_FOUND_PAGE_SLUG,
    })
    expect(getReservedPageSlugViolation('server-error')).toMatchObject({
      canonicalSlug: SERVER_ERROR_PAGE_SLUG,
    })
  })

  it('allows canonical system page slugs themselves', () => {
    expect(getReservedPageSlugViolation(NOT_FOUND_PAGE_SLUG)).toBeNull()
    expect(getReservedPageSlugViolation(SERVER_ERROR_PAGE_SLUG)).toBeNull()
  })

  it('keeps system pages and legacy aliases out of the sitemap', () => {
    expect(isSitemapEligibleSlug('404')).toBe(false)
    expect(isSitemapEligibleSlug('500')).toBe(false)
    expect(isSitemapEligibleSlug('not-found')).toBe(false)
    expect(isSitemapEligibleSlug('docs/not-found')).toBe(false)
    expect(isSitemapEligibleSlug('guides/fixing-404s')).toBe(true)
  })
})
