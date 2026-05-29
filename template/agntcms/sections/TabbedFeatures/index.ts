import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { TabbedFeaturesComponent } from './component'

export const TabbedFeatures = defineSection({
  name: 'TabbedFeatures',
  category: 'Features',
  schema,
  component: TabbedFeaturesComponent,
  previewData: {
    eyebrow: 'How it works',
    headline: 'Everything you need to ship faster',
    lead: 'One platform, every tool your team depends on — no integrations required.',
    entries: [
      {
        _id: '1',
        headline: 'Visual editing',
        description: 'Click any element on the page to edit it inline. No context-switching, no CMS tabs.',
        image: { filename: 'placeholder.png', alt: 'Visual editing interface' },
        cta: { type: 'internal', slug: '', label: 'Learn more' },
      },
      {
        _id: '2',
        headline: 'AI-assisted content',
        description: 'Describe the section you want and the agent scaffolds it — copy, structure, and all.',
        image: { filename: 'placeholder.png', alt: 'AI content assistant' },
        cta: { type: 'internal', slug: '', label: 'See how' },
      },
      {
        _id: '3',
        headline: 'One-click deploy',
        description: 'Push to git, and your site is live. No manual build steps, no deployment dashboards.',
        image: { filename: 'placeholder.png', alt: 'Deploy workflow' },
        cta: { type: 'internal', slug: '', label: 'Get started' },
      },
    ],
  },
})
