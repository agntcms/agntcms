// FROZEN — do not edit. Framework file managed by agntcms.
//
// Renders the actual Next.js not-found route from the canonical CMS page
// slug `404`. Editors change the 404 experience by editing that page's
// content, not by creating ad hoc slugs like `error-404`.

import type { Metadata } from 'next'
import {
  PageRenderer,
  PreviewProvider,
  PreviewToolbar,
  SectionEditControls,
} from '@agntcms/next/client'
import { createRuntime, getPreviewMode, NOT_FOUND_PAGE_SLUG } from '@agntcms/next/server'
import config from '@/agntcms/config'

const runtime = createRuntime({ contentAdapter: config.contentAdapter })

export async function generateMetadata(): Promise<Metadata> {
  const page = await runtime.getContent({ slug: NOT_FOUND_PAGE_SLUG, mode: 'published' })

  return {
    title: page?.seo.title ?? 'Page not found',
    description:
      page?.seo.description ??
      'The page you requested could not be found.',
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default async function NotFoundPage() {
  const mode = await getPreviewMode()
  const isPreview = mode === 'preview'

  const page = await runtime.getContent({ slug: NOT_FOUND_PAGE_SLUG, mode })

  if (!page) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-8 py-24 text-center">
        <div className="max-w-xl">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-text-brand-primary">
            404
          </p>
          <h1 className="font-display text-[clamp(36px,6vw,64px)] font-medium tracking-[-0.04em] text-text-primary">
            Page not found
          </h1>
          <p className="mt-5 text-[18px] leading-[1.7] text-text-secondary">
            The page you requested does not exist.
          </p>
        </div>
      </main>
    )
  }

  return (
    <PreviewProvider mode={mode}>
      {isPreview ? (
        <div data-agntcms-page={NOT_FOUND_PAGE_SLUG}>
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
