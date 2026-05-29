import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { FeatureGridComponent } from './component'

export const FeatureGrid = defineSection({
  name: 'FeatureGrid',
  category: 'Features',
  schema,
  component: FeatureGridComponent,
  previewData: {
    eyebrow: 'Features',
    headline: 'Built for teams that move fast',
    lead: 'Every feature ships with sensible defaults so you spend time on your product, not the framework.',
    columns: '3',
    variant: 'icon',
    cards: [
      {
        _id: '1',
        iconSvg: '',
        stat: '',
        label: 'Instant previews',
        body: 'See every change live before publishing. No build step, no refresh.',
      },
      {
        _id: '2',
        iconSvg: '',
        stat: '',
        label: 'Type-safe schema',
        body: 'Define your content shape once. The editor and the CLI both enforce it.',
      },
      {
        _id: '3',
        iconSvg: '',
        stat: '',
        label: 'Agent-ready',
        body: 'Claude Code reads the same skills your editor does. Fewer handoffs, better output.',
      },
      {
        _id: '4',
        iconSvg: '',
        stat: '',
        label: 'Git-native content',
        body: 'Content lives in your repo. Branch, review, and roll back with normal git tools.',
      },
      {
        _id: '5',
        iconSvg: '',
        stat: '',
        label: 'Zero lock-in',
        body: 'Export to plain JSON at any time. You own the schema, the data, and the stack.',
      },
      {
        _id: '6',
        iconSvg: '',
        stat: '',
        label: 'Vercel-native',
        body: 'Deploy to Vercel in one push. No extra containers, no side-car processes.',
      },
    ],
    footerCta: { type: 'internal', slug: '', label: 'View all features' },
  },
})
