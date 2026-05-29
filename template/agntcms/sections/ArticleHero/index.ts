import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { ArticleHeroComponent } from './component'

export const ArticleHero = defineSection({
  name: 'ArticleHero',
  category: 'Blog',
  schema,
  component: ArticleHeroComponent,
  previewData: {
    backLink: { type: 'internal', slug: 'blog', label: '← Back to blog' },
    category: 'Product',
    title: 'Why we made the agent a first-class editor',
    authorName: 'Jordan Lee',
    authorPhoto: { filename: 'placeholder.png', alt: 'Jordan Lee' },
    meta: 'May 14, 2026 · 6 min read',
    coverImage: { filename: 'placeholder.png', alt: 'Article cover image' },
  },
})
