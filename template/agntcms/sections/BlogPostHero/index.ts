import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { BlogPostHeroComponent } from './component'

export const BlogPostHero = defineSection({
  name: 'BlogPostHero',
  category: 'Blog',
  schema,
  component: BlogPostHeroComponent,
  previewData: {
    category: 'Product',
    title: '# Why we made the agent a first-class editor',
    summary: 'Most CMSes treat AI as a bolt-on. We designed agntcms from day one around the idea that an agent should be able to do everything an editor can.',
    author: 'Jordan Lee',
    publishedAt: 'May 14, 2026',
    readingTime: '6 min read',
    cover: { filename: 'placeholder.png', alt: 'Article cover image' },
    tags: [
      { _id: '1', label: 'Product' },
      { _id: '2', label: 'Agent' },
      { _id: '3', label: 'Editing' },
    ],
  },
})
