// FROZEN — do not edit. Framework file managed by agntcms.
//
// Catch-all route that renders all content pages. Every URL that is not
// handled by a more specific App Router segment falls here. The slug
// segments are joined into a single path string and handed to the runtime,
// which reads the page from the content adapter and returns it (or null
// when the page does not exist).
//
// Reads from draft bucket when preview cookie is set, published otherwise.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  PageRenderer,
  PreviewProvider,
  PreviewToolbar,
  SectionEditControls,
} from '@agntcms/next/client'
import { createRuntime, getPreviewMode } from '@agntcms/next/server'
import config from '@/agntcms/config'
import { getSiteMeta } from '@/agntcms/site-meta'

// The runtime is constructed once per module load. createRuntime is
// stateless — it holds no request-scoped data — so module-level
// construction is safe and avoids rebuilding the adapter on every request.
const runtime = createRuntime({ contentAdapter: config.contentAdapter })

// SEO metadata is always derived from published content. Crawlers and link
// previews should see canonical titles — draft changes only surface after
// publish, which is the correct behaviour for search indexing.
export async function generateMetadata({ params }: {
  params: Promise<{ slug?: string[] }>
}): Promise<Metadata> {
  const { slug: slugParts } = await params
  const slug = slugParts ? slugParts.join('/') : 'home'

  const [page, siteMeta] = await Promise.all([
    runtime.getContent({ slug, mode: 'published' }),
    getSiteMeta(runtime.getGlobal),
  ])

  if (!page) return {}

  const baseUrl = siteMeta.baseUrl ?? ''

  // Canonical: page-level override wins; otherwise derive from base URL.
  // For the "home" slug the canonical is the root path with no trailing slash.
  const canonicalPath = slug === 'home' ? '' : `/${slug}`
  const canonical = page.seo.canonical ?? (baseUrl ? `${baseUrl}${canonicalPath}` : undefined)

  // OG image resolution order: page.seo.ogImage → page.coverImage →
  // siteMeta.defaultOgImage → nothing.
  const ogImageValue =
    page.seo.ogImage ??
    page.coverImage ??
    siteMeta.defaultOgImage

  // Resolve OG image to an absolute URL when a base URL is available.
  // The framework stores images as plain filename strings under /assets/.
  const ogImageUrl =
    ogImageValue && baseUrl
      ? `${baseUrl}/assets/${ogImageValue.filename}`
      : undefined

  const meta: Metadata = {
    title: page.seo.title,
    description: page.seo.description,
    openGraph: {
      title: page.seo.title,
      description: page.seo.description,
      type: 'website',
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, alt: ogImageValue?.alt ?? '' }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: page.seo.title,
      description: page.seo.description,
      ...(ogImageUrl ? { images: [ogImageUrl] } : {}),
    },
  }

  if (canonical) {
    meta.alternates = { canonical }
  }

  return meta
}

export default async function CatchAllPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug: slugParts } = await params

  // Root path (/) has no slug segments; map it to the "home" page slug.
  // All other paths join their segments with "/" to form the page slug.
  const slug = slugParts ? slugParts.join('/') : 'home'

  const mode = await getPreviewMode()
  const isPreview = mode === 'preview'

  const page = await runtime.getContent({ slug, mode })
  if (!page) notFound()

  return (
    <PreviewProvider mode={mode}>
      {isPreview ? (
        <div data-agntcms-page={slug}>
          <SectionEditControls
            page={page}
            definitions={config.sections}
          />
        </div>
      ) : (
        <PageRenderer page={page} definitions={config.sections} />
      )}
      {isPreview && <PreviewToolbar definitions={config.sections} />}
    </PreviewProvider>
  )
}
