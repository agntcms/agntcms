import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { ProblemComponent } from './component'

export const Problem = defineSection({
  name: 'Problem',
  category: 'Content',
  schema,
  component: ProblemComponent,
  previewData: {
    eyebrow: 'The problem',
    headline: 'Content work keeps stalling your engineering team',
    body: 'Every marketing update, every new landing page, every copy tweak — it ends up in the backlog. Developers get pulled off product work to move a button. Editors wait days for a one-line change. The cycle is expensive and demoralizing for everyone.',
    messageEyebrow: 'The real cost',
    message: 'The average dev team spends 30% of sprint capacity on content maintenance that should be self-serve.',
  },
})
