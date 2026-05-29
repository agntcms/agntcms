import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { HowItWorksComponent } from './component'

export const HowItWorks = defineSection({
  name: 'HowItWorks',
  category: 'Content',
  schema,
  component: HowItWorksComponent,
  previewData: {
    eyebrow: 'How it works',
    headline: 'From zero to live in four steps',
    steps: [
      {
        _id: '1',
        number: '01',
        title: 'Scaffold your project',
        description: 'Run `npx create-agntcms@latest` to get a fully wired Next.js project with the skills preinstalled.',
      },
      {
        _id: '2',
        number: '02',
        title: 'Define your sections',
        description: 'Describe your content shape in TypeScript. The schema drives both the editor UI and the agent.',
      },
      {
        _id: '3',
        number: '03',
        title: 'Edit with your team',
        description: 'Open the admin panel in your browser. Editors click, type, and publish — no training needed.',
      },
      {
        _id: '4',
        number: '04',
        title: 'Ship to production',
        description: 'Push to git. Vercel deploys automatically. The agent stays local — nothing extra in production.',
      },
    ],
  },
})
