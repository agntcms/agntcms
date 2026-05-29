import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { BlogIndexComponent } from './component'

export const BlogIndex = defineSection({
  name: 'BlogIndex',
  category: 'Blog',
  schema,
  component: BlogIndexComponent,
  previewData: {
    eyebrow: 'Writing',
    headline: '# Blog.',
    intro: 'Notes on the product, the philosophy, and the open-source progress. Short pieces, written in the open.',
    posts: [
      {
        _id: '1',
        title: 'Why we made the agent a first-class editor',
        summary: 'Most CMSes treat AI as a bolt-on. We designed agntcms from day one around the idea that an agent should be able to do everything an editor can.',
        href: '/blog/agent-editor',
        cover: { filename: 'placeholder.png', alt: 'Article cover' },
        category: 'Product',
        publishedAt: 'May 14, 2026',
        author: 'Jordan Lee',
        readingTime: '6 min read',
      },
      {
        _id: '2',
        title: 'Git as a content store: tradeoffs we made',
        summary: 'Storing content as JSON in your repository feels obvious in retrospect. Here is what we gave up to get there and what we got in return.',
        href: '/blog/git-content-store',
        cover: { filename: 'placeholder.png', alt: 'Article cover' },
        category: 'Engineering',
        publishedAt: 'May 7, 2026',
        author: 'Camille Roux',
        readingTime: '8 min read',
      },
      {
        _id: '3',
        title: 'Inline editing without sacrificing layout control',
        summary: 'Getting inline text editing to feel native in a Next.js page meant solving three hard problems at once.',
        href: '/blog/inline-editing',
        cover: { filename: 'placeholder.png', alt: 'Article cover' },
        category: 'Design',
        publishedAt: 'Apr 30, 2026',
        author: 'Theo Anand',
        readingTime: '5 min read',
      },
    ],
  },
})
