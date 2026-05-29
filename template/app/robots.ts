// FROZEN — do not edit. Framework file managed by agntcms.
//
// Emits a basic allow-all robots.txt. The `sitemap` URL is derived from
// the `site-meta` global so it stays in sync with the configured canonical
// origin. If `site-meta` is absent or `baseUrl` is empty the sitemap
// directive is omitted rather than emitting a malformed URL.

import type { MetadataRoute } from 'next'
import { createRuntime } from '@agntcms/next/server'
import config from '@/agntcms/config'
import { getSiteMeta } from '@/agntcms/site-meta'

const runtime = createRuntime({ contentAdapter: config.contentAdapter })

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteMeta = await getSiteMeta(runtime.getGlobal)

  // baseUrl is null when absent or empty; getSiteMeta already strips trailing slashes.
  const origin = siteMeta.baseUrl ?? undefined

  const result: MetadataRoute.Robots = {
    rules: {
      userAgent: '*',
      allow: '/',
    },
  }

  if (origin) {
    result.sitemap = `${origin}/sitemap.xml`
  }

  return result
}
