import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { NewsletterComponent } from './component'

export const Newsletter = defineSection({
  name: 'Newsletter',
  category: 'Content',
  schema,
  component: NewsletterComponent,
  previewData: {
    headline: 'Stay in the loop',
    emailPlaceholder: 'you@company.com',
    buttonLabel: 'Subscribe',
    helperText: 'No spam. Unsubscribe at any time.',
  },
})
