// FROZEN — do not edit. Framework file managed by agntcms.
//
// Generates the XML sitemap for all published pages. Reads the base URL
// from the `site-meta` global so the sitemap stays in sync with the
// configured canonical origin. If `site-meta` is missing or `baseUrl` is
// empty, the sitemap entry is omitted for that page rather than emitting
// a malformed URL.
//
// `listPages` returns published pages only (ARCHITECTURE.md §12: draft-
// only pages are intentionally excluded from the sitemap). Each entry
// carries `lastModified` from `page.publishedAt` when present; the
// framework does not fill in mtime here because it would require a second
// adapter round-trip per page.

import type { MetadataRoute } from 'next'
import { createRuntime, isSitemapEligibleSlug } from '@agntcms/next/server'
import config from '@/agntcms/config'
import { getSiteMeta } from '@/agntcms/site-meta'

const runtime = createRuntime({ contentAdapter: config.contentAdapter })

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [siteMeta, pages] = await Promise.all([
    getSiteMeta(runtime.getGlobal),
    runtime.listPages(),
  ])

  // If site-meta is absent or baseUrl is not configured, we cannot build
  // absolute URLs — return an empty sitemap rather than relative URLs,
  // which the Sitemap Protocol disallows.
  if (siteMeta.baseUrl === null) return []

  // baseUrl is already normalised (no trailing slash) by getSiteMeta.
  const origin = siteMeta.baseUrl

  return pages.filter((page) => isSitemapEligibleSlug(page.slug)).map((page) => {
    // The "home" slug maps to the root path; every other slug becomes a
    // sub-path. Both cases use the absolute URL format required by the
    // Sitemap Protocol.
    const path = page.slug === 'home' ? '' : `/${page.slug}`
    const entry: MetadataRoute.Sitemap[number] = {
      url: `${origin}${path}`,
    }
    if (page.publishedAt) {
      entry.lastModified = new Date(page.publishedAt)
    }
    return entry
  })
}
