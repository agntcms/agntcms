import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { SiteHeaderComponent } from './component'

export const SiteHeader = defineSection({
  name: 'SiteHeader',
  category: 'Layout',
  schema,
  component: SiteHeaderComponent,
  // Sample lifted from content/globals/site-header.json so the picker preview
  // matches the live Servicely™ demo header exactly. Also serves as the insertion
  // seed for any page that inserts a standalone SiteHeader section.
  previewData: {
    brandName: 'Servicely™',
    showCaret: true,
    navItems: [
      { _id: 'nav-1', label: 'Home', link: { type: 'internal', slug: '/', label: 'Home' } },
      { _id: 'nav-2', label: 'Services', link: { type: 'internal', slug: '/services', label: 'Services' } },
      { _id: 'nav-3', label: 'About', link: { type: 'internal', slug: '/about', label: 'About' } },
      { _id: 'nav-4', label: 'Pricing', link: { type: 'internal', slug: '/pricing', label: 'Pricing' } },
      { _id: 'nav-5', label: 'Blog', link: { type: 'internal', slug: '/blog', label: 'Blog' } },
    ],
    signInCta: { type: 'internal', slug: '/', label: 'Sign in' },
    primaryCta: { type: 'internal', slug: '/', label: 'Start selling' },
  },
})
