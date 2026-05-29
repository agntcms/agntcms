import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { BannerComponent } from './component'

export const Banner = defineSection({
  name: 'Banner',
  category: 'Calls to action',
  schema,
  component: BannerComponent,
  previewData: {
    headline: 'Ready to ship your next project?',
    lead: 'Join hundreds of teams who have already ditched the legacy CMS. agntcms is free to start — no credit card required.',
    primaryCta: { type: 'internal', slug: '', label: 'Get started free' },
    secondaryCta: { type: 'internal', slug: '', label: 'See a live demo' },
    image: { filename: 'placeholder.png', alt: 'Banner illustration' },
  },
})
