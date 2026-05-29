import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { BlogIndexHeaderComponent } from './component'

export const BlogIndexHeader = defineSection({
  name: 'BlogIndexHeader',
  category: 'Blog',
  schema,
  component: BlogIndexHeaderComponent,
  previewData: {
    eyebrow: 'Writing',
    headline: 'All posts',
    lead: 'Filter by topic or browse everything we have published so far.',
    categories: [
      { _id: '1', label: 'All' },
      { _id: '2', label: 'Product' },
      { _id: '3', label: 'Engineering' },
      { _id: '4', label: 'Design' },
    ],
  },
})
