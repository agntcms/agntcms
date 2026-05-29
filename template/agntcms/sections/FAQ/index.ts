import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { FAQComponent } from './component'

export const FAQ = defineSection({
  name: 'FAQ',
  category: 'Content',
  schema,
  component: FAQComponent,
  previewData: {
    eyebrow: 'FAQ',
    headline: 'Common questions',
    lead: 'Everything you need to know before you start building.',
    entries: [
      {
        _id: '1',
        question: 'Do I need a Claude Pro subscription?',
        answer: 'You need any Claude subscription that includes Claude Code access. The agent runs locally on your machine — no extra API keys required.',
      },
      {
        _id: '2',
        question: 'Can I use my own database?',
        answer: 'Yes. The storage adapter is a single interface. Swap the default FS adapter for Postgres, PlanetScale, or any other backend in one file.',
      },
      {
        _id: '3',
        question: 'Does it work without the agent?',
        answer: 'Absolutely. The admin UI and all content editing work in any browser. The agent is an optional power-user layer, not a hard dependency.',
      },
      {
        _id: '4',
        question: 'How does deployment work?',
        answer: 'Push to git. Vercel picks up the change and deploys automatically. The agent is dev-only — nothing extra runs in production.',
      },
      {
        _id: '5',
        question: 'Is my content locked in?',
        answer: 'No. All content is plain JSON in your repo. Export, migrate, or self-host it at any time with no proprietary format to reverse-engineer.',
      },
    ],
  },
})
