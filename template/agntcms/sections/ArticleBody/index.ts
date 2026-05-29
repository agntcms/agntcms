import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { ArticleBodyComponent } from './component'

export const ArticleBody = defineSection({
  name: 'ArticleBody',
  category: 'Blog',
  schema,
  component: ArticleBodyComponent,
})
