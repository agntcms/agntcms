import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { HeroComponent } from './component'

export const Hero = defineSection({
  name: 'Hero',
  category: 'Hero',
  schema,
  component: HeroComponent,
  previewData: {
    eyebrow: 'Introducing agntcms',
    headline: 'The CMS where *your agent* is a first-class editor',
    lead: 'agntcms pairs Next.js with Claude Code so developers ship faster and editors stay in control — no extra tooling, no lock-in.',
    image: { filename: 'placeholder.png', alt: 'agntcms product screenshot' },
    primaryCta: { type: 'internal', slug: '', label: 'Get started free' },
    secondaryCta: { type: 'internal', slug: '', label: 'Read the docs' },
    layout: 'split',
    background: 'paper',
  },
})
