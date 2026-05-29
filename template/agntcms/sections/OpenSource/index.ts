import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { OpenSourceComponent } from './component'

export const OpenSource = defineSection({
  name: 'OpenSource',
  category: 'Content',
  schema,
  component: OpenSourceComponent,
  previewData: {
    eyebrow: 'Open source',
    headline: 'Built in the open',
    body: 'agntcms is fully open source. Every line of the runtime, the skills, and the CLI is on GitHub. Contribute, fork, or audit it freely.',
    stats: [
      { _id: '1', number: '2.4k', label: 'GitHub stars' },
      { _id: '2', number: '180+', label: 'contributors' },
      { _id: '3', number: 'MIT', label: 'license' },
    ],
    primaryCta: { type: 'external', url: 'https://github.com', label: 'View on GitHub' },
    secondaryCta: { type: 'internal', slug: '', label: 'Read the docs' },
  },
})
