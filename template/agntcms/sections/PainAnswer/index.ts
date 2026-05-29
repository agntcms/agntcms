import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { PainAnswerComponent } from './component'

export const PainAnswer = defineSection({
  name: 'PainAnswer',
  category: 'Content',
  schema,
  component: PainAnswerComponent,
  previewData: {
    eyebrow: 'Why agntcms',
    headline: 'A better way to build content sites',
    intro: 'Most CMS platforms were designed before AI and before modern frameworks. agntcms starts fresh.',
    painLabel: 'The old way',
    oursLabel: 'With agntcms',
    rows: [
      {
        _id: '1',
        pain: 'Context-switch to a CMS dashboard to change one heading',
        ours: 'Click the heading on the page and type — inline, instant',
      },
      {
        _id: '2',
        pain: 'Wait for a developer to wire up a new field type',
        ours: 'Add a line to your schema and the editor appears automatically',
      },
      {
        _id: '3',
        pain: 'Pay for a hosted CMS and a separate deploy platform',
        ours: 'Content lives in your repo — same git flow, same Vercel deploy',
      },
      {
        _id: '4',
        pain: 'Train every editor on a proprietary interface',
        ours: 'The UI is plain — no jargon, no hidden menus',
      },
    ],
  },
})
