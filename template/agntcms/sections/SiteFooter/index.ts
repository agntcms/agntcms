import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { SiteFooterComponent } from './component'

export const SiteFooter = defineSection({
  name: 'SiteFooter',
  category: 'Layout',
  schema,
  component: SiteFooterComponent,
  // Sample lifted from content/globals/site-footer.json so the picker preview
  // matches the live Servicely™ demo footer exactly. Also serves as the insertion
  // seed for any page that inserts a standalone SiteFooter section.
  previewData: {
    brandName: 'Servicely™',
    showCaret: true,
    tagline: 'The all-in-one platform for selling any service. Book, bill, and manage clients without leaving your browser.',
    columns: [
      {
        _id: 'col-product',
        heading: 'Product',
        links: [
          { _id: 'l-1', label: 'Overview', link: { type: 'internal', slug: '/', label: 'Overview' } },
          { _id: 'l-2', label: 'Pricing', link: { type: 'internal', slug: '/pricing', label: 'Pricing' } },
          { _id: 'l-3', label: 'Changelog', link: { type: 'internal', slug: '/', label: 'Changelog' } },
          { _id: 'l-4', label: 'Roadmap', link: { type: 'internal', slug: '/', label: 'Roadmap' } },
        ],
      },
      {
        _id: 'col-company',
        heading: 'Company',
        links: [
          { _id: 'l-1', label: 'About', link: { type: 'internal', slug: '/about', label: 'About' } },
          { _id: 'l-2', label: 'Blog', link: { type: 'internal', slug: '/blog', label: 'Blog' } },
          { _id: 'l-3', label: 'Contact', link: { type: 'internal', slug: '/contact', label: 'Contact' } },
          { _id: 'l-4', label: 'Security', link: { type: 'internal', slug: '/', label: 'Security' } },
        ],
      },
      {
        _id: 'col-legal',
        heading: 'Legal',
        links: [
          { _id: 'l-1', label: 'Terms', link: { type: 'internal', slug: '/', label: 'Terms' } },
          { _id: 'l-2', label: 'Privacy', link: { type: 'internal', slug: '/', label: 'Privacy' } },
          { _id: 'l-3', label: 'DPA', link: { type: 'internal', slug: '/', label: 'DPA' } },
          { _id: 'l-4', label: 'License', link: { type: 'internal', slug: '/', label: 'License' } },
        ],
      },
    ],
    copyright: '© 2026 Servicely™ · All rights reserved',
    versionLine: 'v1.0 · Built with agntcms',
  },
})
