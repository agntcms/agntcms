// Typed accessor for the `site-meta` global. All four metadata helpers
// (app/layout.tsx, app/[[...slug]]/page.tsx, app/sitemap.ts, app/robots.ts)
// read this global; centralizing the narrowing here means schema changes only
// require one update instead of four.

import { cache } from 'react'
import type { ImageValue } from '@agntcms/next'
import type { GetGlobal } from '@agntcms/next/server'

// The shape of the site-meta global's `data` field after narrowing.
// Matches the schema in agntcms/sections/SiteMeta/schema.ts exactly.
export interface SiteMeta {
  siteName: string
  baseUrl: string | null
  defaultOgImage: ImageValue | null
  defaultDescription: string
}

// Reads the `site-meta` global and returns a fully-typed, narrowed object.
// Falls back to safe defaults when the global is absent or a field is
// missing/wrong-typed — never throws.
// `cache` dedups multiple calls within the same server request so layout.tsx
// and [[...slug]]/page.tsx do not each trigger a separate adapter read.
export const getSiteMeta = cache(async (getGlobal: GetGlobal): Promise<SiteMeta> => {
  // `getGlobal` is invoked in published mode unconditionally — globals do not
  // have drafts in v0.1. If/when drafts arrive for globals, callers in preview
  // contexts (e.g. `[[...slug]]/page.tsx generateMetadata`) must pass the mode.
  const global = await getGlobal({ name: 'site-meta', mode: 'published' })
  const data: unknown = global?.data

  // Narrow data to a plain object first — if it isn't, all fields fall to
  // their defaults below.
  const d = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}

  const siteName =
    typeof d['siteName'] === 'string' && d['siteName'] !== ''
      ? d['siteName']
      : 'agntcms'

  // Strip ALL trailing slashes (not just one), then validate that the result
  // is a parseable absolute URL. A bare hostname like "example.com" or a value
  // with extra slashes would crash `new URL(baseUrl)` in layout.tsx, so we
  // degrade to null rather than propagate a broken value to any consumer.
  let baseUrl: string | null = null
  if (typeof d['baseUrl'] === 'string') {
    const cleaned = d['baseUrl'].replace(/\/+$/, '')
    if (cleaned !== '') {
      try {
        const parsed = new URL(cleaned)
        // Reject URLs with a path component — a baseUrl of
        // "https://example.com/foo" would produce wrong sitemap and canonical
        // URLs like "https://example.com/foo/sitemap.xml".
        if (parsed.pathname === '/' || parsed.pathname === '') {
          baseUrl = cleaned
        }
      } catch {
        // Malformed or missing protocol — treat as absent; all four consumers
        // already handle baseUrl: null correctly.
        baseUrl = null
      }
    }
  }

  // ImageValue requires both `filename` (string) and `alt` (string).
  const rawImage = d['defaultOgImage']
  const defaultOgImage: ImageValue | null =
    typeof rawImage === 'object' &&
    rawImage !== null &&
    typeof (rawImage as Record<string, unknown>)['filename'] === 'string' &&
    typeof (rawImage as Record<string, unknown>)['alt'] === 'string'
      ? {
          filename: (rawImage as Record<string, unknown>)['filename'] as string,
          alt: (rawImage as Record<string, unknown>)['alt'] as string,
        }
      : null

  const defaultDescription =
    typeof d['defaultDescription'] === 'string' ? d['defaultDescription'] : ''

  return { siteName, baseUrl, defaultOgImage, defaultDescription }
})
