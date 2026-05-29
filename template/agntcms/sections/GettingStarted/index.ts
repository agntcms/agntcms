import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { GettingStartedComponent } from './component'

export const GettingStarted = defineSection({
  name: 'GettingStarted',
  category: 'CTA',
  schema,
  component: GettingStartedComponent,
  previewData: {
    eyebrow: 'Get started',
    headline: 'Your first page in five minutes',
    intro: 'Run one command. The CLI scaffolds a complete Next.js project with the editor, agent skills, and a sample home page ready to customize.',
    command: 'npx create-agntcms@latest my-site',
    meta: 'Requires Node 18+. No account needed.',
    primaryCta: { type: 'internal', slug: '', label: 'Read the docs' },
    secondaryCta: { type: 'external', url: 'https://github.com', label: 'View on GitHub' },
  },
})
