import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { BlogPostBodyComponent } from './component'

export const BlogPostBody = defineSection({
  name: 'BlogPostBody',
  category: 'Blog',
  schema,
  component: BlogPostBodyComponent,
})
