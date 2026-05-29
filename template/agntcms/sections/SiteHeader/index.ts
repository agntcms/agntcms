import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { SiteHeaderComponent } from './component'

export const SiteHeader = defineSection({
  name: 'SiteHeader',
  category: 'Layout',
  schema,
  component: SiteHeaderComponent,
})
