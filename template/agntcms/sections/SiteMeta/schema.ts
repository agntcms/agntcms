import { TextField, ImageField } from '@agntcms/next'

export const schema = {
  // Site name used in the page title template: "<page title> | <siteName>"
  siteName: TextField,
  // Canonical base URL, e.g. "https://agntcms.dev". Used by sitemap.ts
  // and generateMetadata to construct canonical URLs. Include protocol,
  // no trailing slash.
  baseUrl: TextField,
  // Fallback OG image shown when a page has no seo.ogImage and no
  // coverImage. Optional — pages that always set their own OG image
  // do not need this.
  defaultOgImage: ImageField,
  // Global fallback description. Shown on the home page (before any
  // page-level seo.description is available) and used as openGraph
  // description in layout.tsx.
  defaultDescription: TextField,
}
