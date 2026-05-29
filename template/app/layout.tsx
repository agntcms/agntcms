import type { Metadata } from 'next'
import { Inter_Tight, JetBrains_Mono, Source_Serif_4 } from 'next/font/google'
import { GlobalSlot, createRuntime, getPreviewMode } from '@agntcms/next/server'
import config from '@/agntcms/config'
import { getSiteMeta } from '@/agntcms/site-meta'
import '../styles/globals.css'

// Inter Tight covers both display and body roles per BRAND.md.
const interTight = Inter_Tight({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter-tight',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

// Source Serif 4 is reserved for manifesto / long-form essay typography.
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-source-serif',
  display: 'swap',
})

// The runtime is constructed once per module load. createRuntime is
// stateless — it holds no request-scoped data — so module-level
// construction is safe and avoids rebuilding the adapter on every request.
const runtime = createRuntime({ contentAdapter: config.contentAdapter })

// Layout-level metadata provides fallback defaults for every page.
// Per-page generateMetadata in app/[[...slug]]/page.tsx overrides these
// with page-specific titles and descriptions. Users who want to customize
// the default metadata can edit this function — layout.tsx is NOT frozen.
export async function generateMetadata(): Promise<Metadata> {
  const siteMeta = await getSiteMeta(runtime.getGlobal)

  // layout.tsx uses a local fallback description rather than the global one
  // because this file is user-editable and the wording belongs to the user.
  const description =
    siteMeta.defaultDescription !== ''
      ? siteMeta.defaultDescription
      : 'An opinionated, AI-native CMS framework for content sites.'

  const baseUrl = siteMeta.baseUrl ?? ''
  const ogImageUrl =
    siteMeta.defaultOgImage && baseUrl
      ? `${baseUrl}/assets/${siteMeta.defaultOgImage.filename}`
      : undefined

  return {
    // `metadataBase` anchors all relative URLs in Open Graph / Twitter
    // image fields. Without it, Next.js cannot resolve /assets/ URLs.
    ...(baseUrl ? { metadataBase: new URL(baseUrl) } : {}),
    // `default` is shown when a route has no own title (admin, error pages).
    // `template: '%s'` is a pass-through — seo.title in page content becomes
    // the literal <title> without any brand suffix appended.
    // Authors include the brand in seo.title when they want it.
    title: {
      default: siteMeta.siteName,
      template: '%s',
    },
    description,
    openGraph: {
      siteName: siteMeta.siteName,
      type: 'website',
      ...(ogImageUrl ? { images: [{ url: ogImageUrl }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      ...(ogImageUrl ? { images: [ogImageUrl] } : {}),
    },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read preview state via the shared helper so layout and page use the
  // same detection mechanism. GlobalSlot mirrors the preview/published split
  // so globals get editable affordances in preview and bare data in production.
  const mode = await getPreviewMode()

  return (
    <html lang="en" className={`${interTight.variable} ${jetbrainsMono.variable} ${sourceSerif.variable}`}>
      <body className="bg-paper text-ink font-body antialiased">
        <GlobalSlot
          name="site-header"
          getGlobal={runtime.getGlobal}
          definitions={config.sections}
          mode={mode}
        />
        {children}
        <GlobalSlot
          name="site-footer"
          getGlobal={runtime.getGlobal}
          definitions={config.sections}
          mode={mode}
        />
      </body>
    </html>
  )
}
