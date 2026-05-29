import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { FeaturedArticlesComponent } from './component'

export const FeaturedArticles = defineSection({
  name: 'FeaturedArticles',
  category: 'Blog',
  schema,
  component: FeaturedArticlesComponent,
  previewData: {
    eyebrow: 'From the blog',
    headline: 'Recent writing',
    lead: 'Notes on building agntcms, the thinking behind the design decisions, and lessons from shipping in public.',
    columns: '3',
    articles: [
      {
        _id: '1',
        image: { filename: 'placeholder.png', alt: 'Article cover' },
        category: 'Product',
        title: 'Why we made the agent a first-class editor',
        excerpt: 'Most CMSes treat AI as a bolt-on. We designed agntcms from day one around the idea that an agent should be able to do everything an editor can.',
        meta: 'May 14, 2026 · 6 min read',
        link: { type: 'internal', slug: '', label: 'Read more' },
      },
      {
        _id: '2',
        image: { filename: 'placeholder.png', alt: 'Article cover' },
        category: 'Engineering',
        title: 'Git as a content store: tradeoffs we made',
        excerpt: 'Storing content as JSON in your repository feels obvious in retrospect. Here is what we gave up to get there and what we got in return.',
        meta: 'May 7, 2026 · 8 min read',
        link: { type: 'internal', slug: '', label: 'Read more' },
      },
      {
        _id: '3',
        image: { filename: 'placeholder.png', alt: 'Article cover' },
        category: 'Design',
        title: 'Inline editing without sacrificing layout control',
        excerpt: 'Getting inline text editing to feel native in a Next.js page meant solving three hard problems at once. This is how we approached them.',
        meta: 'Apr 30, 2026 · 5 min read',
        link: { type: 'internal', slug: '', label: 'Read more' },
      },
    ],
  },
})
