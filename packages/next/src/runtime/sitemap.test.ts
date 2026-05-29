import { describe, expect, it } from 'vitest'

import { isSitemapEligibleSlug } from './sitemap'

describe('isSitemapEligibleSlug', () => {
  it('excludes common error page slugs', () => {
    expect(isSitemapEligibleSlug('404')).toBe(false)
    expect(isSitemapEligibleSlug('500')).toBe(false)
    expect(isSitemapEligibleSlug('not-found')).toBe(false)
    expect(isSitemapEligibleSlug('_not-found')).toBe(false)
  })

  it('excludes nested utility pages by terminal segment', () => {
    expect(isSitemapEligibleSlug('docs/404')).toBe(false)
    expect(isSitemapEligibleSlug('blog/not-found')).toBe(false)
  })

  it('keeps normal content pages indexable', () => {
    expect(isSitemapEligibleSlug('home')).toBe(true)
    expect(isSitemapEligibleSlug('docs/error-handling')).toBe(true)
    expect(isSitemapEligibleSlug('guides/fixing-404s')).toBe(true)
  })
})
