// Sitemap helpers used by the frozen template entrypoints.
//
// Some projects keep published utility pages around under conventional
// slugs like `404` or `not-found` so editors can preview or repurpose the
// content. Those pages should not be advertised to crawlers through the
// sitemap, even though they are otherwise valid published pages.

export { isSitemapEligibleSlug } from './systemPages'
